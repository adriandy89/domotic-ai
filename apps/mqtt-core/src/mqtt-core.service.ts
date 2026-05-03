import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import {
  getAvailableActions,
  getExposesFromAttributes,
  getKeyHomeNotifiedDisconnections,
  getKeyHomeUniqueIdOrgId,
  getKeyHomeUniqueIdsDisconnected,
  IHomeConnectedEvent,
  IRulesSensorData,
  ISensorData,
  IUserSensorNotification,
  userAttr,
  validateCommand,
} from '@app/models';
import { NatsClientService } from '@app/nats-client';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JsonValue } from '@prisma/client/runtime/client';
import { NotificationChannel, SensorData } from 'generated/prisma/client';
import { MqttClient } from 'mqtt';

const SAFE_DEVICE_ID_REGEX = /^[a-zA-Z0-9_\-:.]+$/;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 2;
const RATE_LIMIT_SWEEP_MS = 30_000;

export interface PublishCommandResult {
  ok: boolean;
  code?:
    | 'INVALID_DEVICE_ID'
    | 'DEVICE_NOT_FOUND'
    | 'DEVICE_DISABLED'
    | 'INVALID_COMMAND'
    | 'RATE_LIMITED'
    | 'PUBLISH_FAILED';
  error?: string;
  validationErrors?: { property: string; code: string; message: string }[];
  retryAfterMs?: number;
}

const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    return input.replace(/\u0000/g, ''); // Remove null characters
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput); // Recursively sanitize arrays
  }
  if (typeof input === 'object' && input !== null) {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, sanitizeInput(value)]),
    );
  }
  return input; // Return as is for numbers, booleans, etc.
};

const userAttrKeys: {
  [key in userAttr]: string;
} = {
  contactTrue: 'contact',
  contactFalse: 'contact',
  vibrationTrue: 'vibration',
  occupancyTrue: 'occupancy',
  presenceTrue: 'presence',
  smokeTrue: 'smoke',
  waterLeakTrue: 'water_leak',
};

@Injectable()
export class MqttCoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttCoreService.name);
  private readonly commandTimestamps = new Map<string, number[]>();
  private rateLimitSweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly cacheService: CacheService,
    private readonly natsClient: NatsClientService,
    private readonly dbService: DbService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: MqttClient,
  ) {}

  onModuleInit() {
    this.rateLimitSweepTimer = setInterval(
      () => this.sweepRateLimitMap(),
      RATE_LIMIT_SWEEP_MS,
    );
    this.rateLimitSweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.rateLimitSweepTimer) clearInterval(this.rateLimitSweepTimer);
  }

  private sweepRateLimitMap() {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [key, ts] of this.commandTimestamps.entries()) {
      const fresh = ts.filter((t) => t > cutoff);
      if (fresh.length === 0) this.commandTimestamps.delete(key);
      else this.commandTimestamps.set(key, fresh);
    }
  }

  async handleMessage(topic: string, bufferMsg: Buffer) {
    try {
      const topicParts = topic.split('/');
      if (topic.endsWith('bridge/devices')) {
        let homeBridgeDevices: any[];
        try {
          const parsed = JSON.parse(bufferMsg.toString());
          if (!Array.isArray(parsed)) {
            this.logger.error(
              `bridge/devices payload is not an array (topic=${topic})`,
            );
            return;
          }
          homeBridgeDevices = parsed;
        } catch (err) {
          this.logger.error(
            `Failed to parse bridge/devices JSON for topic ${topic}: ${err}`,
          );
          return;
        }
        const homeBridgeUniqueId = topicParts[topicParts.length - 3];

        const foundHome = await this.dbService.home.findUnique({
          where: { unique_id: homeBridgeUniqueId, disabled: false },
          select: {
            unique_id: true,
            id: true,
            organization_id: true,
            users: {
              select: {
                user_id: true,
              },
            },
            connected: true,
          },
        });
        if (!foundHome) {
          this.logger.error(`Not Found home bridge = ${homeBridgeUniqueId}`);
          return;
        }
        if (!foundHome.connected) {
          await this.dbService.home.update({
            where: { id: foundHome.id },
            data: { connected: true },
          });
          // ! Remove from disconnected cache
          await this.cacheService.sRem(
            getKeyHomeUniqueIdsDisconnected(),
            foundHome.unique_id,
          );
          // Check if this home was previously notified as disconnected
          const wasNotified = await this.cacheService.sIsMember(
            getKeyHomeNotifiedDisconnections(),
            foundHome.unique_id,
          );
          if (wasNotified) {
            // Remove from notified set
            await this.cacheService.sRem(
              getKeyHomeNotifiedDisconnections(),
              foundHome.unique_id,
            );
          }
          // notify to user
          await this.natsClient.emit<IHomeConnectedEvent>(
            'mqtt-core.home.connected',
            {
              homeId: foundHome.id,
              userIds: foundHome.users.map((user) => user.user_id),
              connected: true,
            },
          );
        }

        await Promise.all(
          homeBridgeDevices
            .filter((item) => item.type != 'Coordinator')
            .map(async (item) => {
              try {
                const deviceFound = await this.dbService.device.findUnique({
                  where: {
                    unique_id_organization_id: {
                      organization_id: foundHome.organization_id,
                      unique_id: item.friendly_name,
                    },
                  },
                  select: { id: true },
                });
                if (deviceFound) {
                  this.logger.verbose(
                    `Bridge Update Device: ${item.friendly_name} - Home: ${foundHome.unique_id}`,
                  );
                  const sanitizedData = sanitizeInput({
                    model: item.model_id,
                    attributes: item,
                  });
                  await this.dbService.device.update({
                    where: { id: deviceFound.id },
                    data: {
                      model: sanitizedData.model,
                      attributes: sanitizedData.attributes,
                    },
                  });
                } else {
                  try {
                    const organization =
                      await this.dbService.organization.findUnique({
                        where: {
                          id: foundHome.organization_id,
                        },
                        select: {
                          max_devices: true,
                        },
                      });
                    if (!organization) {
                      throw new Error('Organization not found');
                    }
                    const totalDevices = await this.dbService.device.count({
                      where: { organization_id: foundHome.organization_id },
                    });
                    if (totalDevices < organization.max_devices) {
                      this.logger.verbose(
                        `Bridge Create Device: ${item.friendly_name}`,
                      );
                      const sanitizedData = sanitizeInput({
                        unique_id: item.friendly_name,
                        name:
                          item.definition?.description?.substring(0, 124) ??
                          item.friendly_name,
                        model: item.model_id,
                        attributes: item,
                      });

                      await this.dbService.device.create({
                        data: {
                          unique_id: sanitizedData.unique_id,
                          name: sanitizedData.name,
                          model: sanitizedData.model,
                          attributes: sanitizedData.attributes,
                          home_id: foundHome.id,
                          organization_id: foundHome.organization_id,
                          disabled: true,
                        },
                      });
                    } else {
                      this.logger.error(
                        `Max devices reached for organization: ${foundHome.organization_id}`,
                      );
                    }
                  } catch (error) {
                    console.log('Error:', error);
                  }
                }
              } catch (error) {
                this.logger.error(`Error: ${error}`);
              }
            }),
        );

        return;
      }
      const homeUniqueId = topicParts[topicParts.length - 2];
      const deviceUniqueId = topicParts[topicParts.length - 1];

      let message: unknown;
      try {
        message = JSON.parse(bufferMsg.toString().replace(/\u0000/g, ''));
      } catch (err) {
        this.logger.error(
          `Failed to parse JSON for device=${deviceUniqueId} home=${homeUniqueId}: ${err}`,
        );
        return;
      }
      if (!message || typeof message !== 'object') {
        this.logger.error(
          `Invalid message (not an object) for device=${deviceUniqueId} home=${homeUniqueId}`,
        );
        return;
      }

      // ? Save message to database
      const homeOrgId = await this.cacheService.get<string>(
        getKeyHomeUniqueIdOrgId(homeUniqueId),
      );
      if (!homeOrgId) {
        this.logger.error(
          `Not Found Organization ID = ${homeOrgId} for home = ${homeUniqueId}`,
        );
        return;
      }

      const device = await this.dbService.device.findUnique({
        where: {
          unique_id_organization_id: {
            organization_id: homeOrgId,
            unique_id: deviceUniqueId,
          },
        },
        select: {
          id: true,
          name: true,
          disabled: true,
          conditions: {
            select: {
              rule_id: true,
            },
          },
        },
      });

      if (!device?.id) {
        this.logger.error(
          `Not Found device = ${deviceUniqueId} for home = ${homeUniqueId}`,
        );
        return;
      }

      if (device.disabled) {
        this.logger.warn(
          `Device = ${deviceUniqueId} for home = ${homeUniqueId} is disabled`,
        );
        return;
      }

      this.logger.verbose(`Incoming Message: ${deviceUniqueId}`);
      await this.dbService.sensorData.create({
        data: {
          device_id: device.id,
          data: message,
        },
        select: {
          device_id: true,
          data: true,
          timestamp: true,
        },
      });

      // ? get previous data
      const prevSensorData = await this.dbService.sensorDataLast.findUnique({
        where: {
          device_id: device.id,
        },
        select: {
          data: true,
        },
      });

      const newSensorData = await this.dbService.sensorDataLast.upsert({
        where: {
          device_id: device.id,
        },
        create: {
          device_id: device.id,
          data: message,
        },
        update: {
          data: message,
        },
        select: {
          device_id: true,
          data: true,
          timestamp: true,
        },
      });

      const updatedHome = await this.dbService.home.update({
        where: { unique_id: homeUniqueId },
        data: { last_update: new Date() },
        select: {
          id: true,
          name: true,
          users: {
            select: {
              user: {
                select: {
                  id: true,
                  channels: true,
                  telegram_chat_id: true,
                  email: true,
                  is_active: true,
                  attributes: true,
                },
              },
            },
          },
        },
      });

      await this.natsClient.emit<ISensorData>('mqtt-core.sensor.data', {
        homeId: updatedHome.id,
        userIds: updatedHome.users.map((user) => user.user.id),
        deviceId: newSensorData.device_id,
        timestamp: newSensorData.timestamp,
        data: newSensorData.data,
      });

      if (updatedHome && prevSensorData && newSensorData) {
        if (device.conditions?.length > 0) {
          await this.natsClient.emit<IRulesSensorData>('mqtt-core.rules.data', {
            ruleIds: device.conditions.map((condition) => condition.rule_id),
            deviceId: newSensorData.device_id,
            timestamp: newSensorData.timestamp,
            data: newSensorData.data,
            prevData: prevSensorData.data,
          });
        }
        // compare last data with new data
        await this.globalUserAttributesNotification(
          device.name,
          newSensorData,
          prevSensorData,
          updatedHome,
        );
      }
    } catch (error) {
      console.log('Error handling message:', error);
    }
  }

  async globalUserAttributesNotification(
    deviceName: string,
    newSensorData: Pick<SensorData, 'data' | 'device_id'>,
    prevData: Pick<SensorData, 'data'>,
    home: {
      id: string;
      name: string;
      users: {
        user: {
          id: string;
          attributes: JsonValue;
          channels: NotificationChannel[];
          telegram_chat_id: string | null;
          email: string | null;
          is_active: boolean;
        };
      }[];
    },
  ) {
    if (!newSensorData.data || !prevData.data) return;

    // Detectar cambios en los datos del sensor que sean relevantes para notificaciones
    const changes: {
      key: string;
      value: any;
    }[] = [];

    for (const [key, value] of Object.entries(newSensorData.data)) {
      if (
        prevData?.data[key] !== undefined &&
        prevData?.data[key] !== value &&
        Object.values(userAttrKeys).includes(key)
      ) {
        changes.push({
          key,
          value,
        });
      }
    }

    if (changes.length === 0) return;

    // Iterar sobre los usuarios del home
    for (const { user } of home.users) {
      if (
        !user.attributes ||
        typeof user.attributes !== 'object' ||
        !user.channels ||
        user.channels.length === 0 ||
        !user.is_active
      )
        continue;

      const userAttrObj = user.attributes as Record<string, any>;

      // Revisar cada atributo del usuario
      for (const [keyAttr, valueAttr] of Object.entries(userAttrObj)) {
        // Solo procesar si el atributo está activo (true) y es un atributo válido
        if (valueAttr === true && Object.keys(userAttrKeys).includes(keyAttr)) {
          // Revisar cada cambio detectado
          for (const { key, value } of changes) {
            // Verificar si el cambio coincide con el atributo del usuario
            if (userAttrKeys[keyAttr as userAttr] === key) {
              // Verificar si el valor coincide con la condición (True/False)
              const shouldNotify = keyAttr.endsWith('True')
                ? value === true
                : value === false;

              if (shouldNotify) {
                this.logger.verbose(
                  `Notifying user ${user.id} for ${keyAttr} on home ${home.id}`,
                );
                await this.natsClient.emit<IUserSensorNotification>(
                  'mqtt-core.user.sensor-notification',
                  {
                    deviceName,
                    homeName: home.name,
                    homeId: home.id,
                    user,
                    deviceId: newSensorData.device_id,
                    attributeKey: keyAttr,
                    sensorKey: key,
                    sensorValue: value,
                  },
                );
              }
            }
          }
        }
      }
    }
  }

  async publishCommand(payload: {
    homeUniqueId: string;
    deviceUniqueId: string;
    organizationId: string;
    command: Record<string, unknown>;
  }): Promise<PublishCommandResult> {
    const { homeUniqueId, deviceUniqueId, organizationId, command } = payload;

    if (
      !SAFE_DEVICE_ID_REGEX.test(deviceUniqueId) ||
      !SAFE_DEVICE_ID_REGEX.test(homeUniqueId)
    ) {
      return {
        ok: false,
        code: 'INVALID_DEVICE_ID',
        error:
          'home or device unique_id contains characters not allowed in MQTT topics',
      };
    }

    if (
      !command ||
      typeof command !== 'object' ||
      Object.keys(command).length === 0
    ) {
      return {
        ok: false,
        code: 'INVALID_COMMAND',
        error: 'command must be a non-empty object',
      };
    }

    const device = await this.dbService.device.findUnique({
      where: {
        unique_id_organization_id: {
          organization_id: organizationId,
          unique_id: deviceUniqueId,
        },
      },
      select: {
        id: true,
        disabled: true,
        attributes: true,
        home: { select: { unique_id: true } },
      },
    });

    if (!device || device.home?.unique_id !== homeUniqueId) {
      return {
        ok: false,
        code: 'DEVICE_NOT_FOUND',
        error: 'device not found in this home/organization',
      };
    }
    if (device.disabled) {
      return {
        ok: false,
        code: 'DEVICE_DISABLED',
        error: 'device is disabled',
      };
    }

    const exposes = getExposesFromAttributes(device.attributes);
    const actions = getAvailableActions(exposes);
    if (actions.length > 0) {
      const validation = validateCommand(command, actions);
      if (!validation.valid) {
        return {
          ok: false,
          code: 'INVALID_COMMAND',
          error: 'command does not match device exposes',
          validationErrors: validation.errors,
        };
      }
    }

    const limitKey = `${homeUniqueId}:${deviceUniqueId}`;
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const fresh = (this.commandTimestamps.get(limitKey) ?? []).filter(
      (t) => t > cutoff,
    );
    if (fresh.length >= RATE_LIMIT_MAX_PER_WINDOW) {
      const oldest = fresh[0];
      return {
        ok: false,
        code: 'RATE_LIMITED',
        error: `Max ${RATE_LIMIT_MAX_PER_WINDOW} commands per second per device`,
        retryAfterMs: Math.max(0, oldest + RATE_LIMIT_WINDOW_MS - now),
      };
    }
    fresh.push(now);
    this.commandTimestamps.set(limitKey, fresh);

    const topic = `home/id/${homeUniqueId}/${deviceUniqueId}/set`;
    return await new Promise<PublishCommandResult>((resolve) => {
      this.mqttClient.publish(
        topic,
        JSON.stringify(command),
        { qos: 1 },
        (err) => {
          if (err) {
            this.logger.error(
              `MQTT publish failed for ${topic}: ${err.message}`,
            );
            resolve({ ok: false, code: 'PUBLISH_FAILED', error: err.message });
            return;
          }
          resolve({ ok: true });
        },
      );
    });
  }
}
