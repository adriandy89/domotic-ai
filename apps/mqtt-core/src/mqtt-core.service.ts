import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { getKeyHomeNotifiedDisconnections, getKeyHomeUniqueIdOrgId, getKeyHomeUniqueIdsDisconnected, IHomeConnectedEvent, ISensorData, IUserSensorNotification } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JsonValue } from '@prisma/client/runtime/client';
import { SensorData } from 'generated/prisma/client';
import { MqttClient } from 'mqtt';

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

type userAttr =
  | 'contactTrue'
  | 'contactFalse'
  | 'vibrationTrue'
  | 'occupancyTrue'
  | 'presenceTrue'
  | 'smokeTrue'
  | 'waterLeakTrue';
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
export class MqttCoreService {
  private readonly logger = new Logger(MqttCoreService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly natsClient: NatsClientService,
    private readonly dbService: DbService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: MqttClient,
  ) { }

  async handleMessage(topic: string, bufferMsg: Buffer) {
    try {
      const topicParts = topic.split('/');
      if (topic.endsWith('bridge/devices')) {
        const homeBridgeDevices = JSON.parse(bufferMsg.toString());
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
          await this.natsClient.emit<IHomeConnectedEvent>('mqtt-core.home.connected', {
            homeId: foundHome.id,
            userIds: foundHome.users.map((user) => user.user_id),
            connected: true,
          });
        }

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
                this.logger.verbose(
                  `Bridge Create Device: ${item.friendly_name}`,
                );
                try {
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
                } catch (error) {
                  console.log('Error:', error);
                }
              }
            } catch (error) {
              this.logger.error(`Error: ${error}`);
            }
          });

        return;
      }
      const homeUniqueId = topicParts[topicParts.length - 2];
      const deviceUniqueId = topicParts[topicParts.length - 1];

      const message = JSON.parse(bufferMsg.toString().replace(/\u0000/g, ''));

      // ? Save message to database
      const homeOrgId = await this.cacheService.get<string>(getKeyHomeUniqueIdOrgId(homeUniqueId));
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
        },
      });

      if (!device) {
        this.logger.error(
          `Not Found device = ${deviceUniqueId} for home = ${homeUniqueId}`,
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
          device_id: true,
          data: true,
          timestamp: true,
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
          users: {
            select: {
              user: {
                select: {
                  id: true,
                  attributes: true,
                }
              }
            }
          }
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
        // compare last data with new data
        await this.globalUserAttributesNotification(
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
    newSensorData: Pick<SensorData, 'data' | 'device_id'>,
    prevData: Pick<SensorData, 'data'>,
    home: {
      id: string;
      users: {
        user: {
          id: string;
          attributes: JsonValue;
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
      if (!user.attributes || typeof user.attributes !== 'object') continue;

      const userAttrObj = user.attributes as Record<string, any>;

      // Revisar cada atributo del usuario
      for (const [keyAttr, valueAttr] of Object.entries(userAttrObj)) {
        // Solo procesar si el atributo está activo (true) y es un atributo válido
        if (
          valueAttr === true &&
          Object.keys(userAttrKeys).includes(keyAttr)
        ) {
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
                await this.natsClient.emit<IUserSensorNotification>('mqtt-core.user.sensor-notification', {
                  userId: user.id,
                  homeId: home.id,
                  deviceId: newSensorData.device_id,
                  attributeKey: keyAttr,
                  sensorKey: key,
                  sensorValue: value,
                });
              }
            }
          }
        }
      }
    }
  }

  publishCommand(payload: { homeUniqueId: string; deviceUniqueId: string; command: any }) {
    this.mqttClient.publish(
      `home/id/${payload.homeUniqueId}/${payload.deviceUniqueId}/set`,
      JSON.stringify(payload.command),
      { qos: 1 },
    );
    return { ok: true };
  }
}
