import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import {
  DeviceProtocol,
  getAdapter,
  getKeyHomeNotifiedDisconnections,
  getKeyHomeUniqueIdOrgId,
  getKeyHomeUniqueIdsDisconnected,
  HaDeviceAttributes,
  synthesizeEntities,
  isHaProtocol,
  IHomeConnectedEvent,
  IHomeConnectionNotification,
  IRulesSensorData,
  ISensorData,
  IUserSensorNotification,
  userAttr,
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
import {
  NotificationChannel,
  Prisma,
  SensorData,
} from 'generated/prisma/client';
import { MqttClient } from 'mqtt';

const SAFE_DEVICE_ID_REGEX = /^[a-zA-Z0-9_\-:.]+$/;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 2;
const RATE_LIMIT_SWEEP_MS = 30_000;

/** Device record shape needed to ingest a state message. */
interface IngestDevice {
  id: string;
  name: string;
  disabled: boolean | null;
  conditions: { rule_id: string }[];
}

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

  /**
   * HA-Discovery state-topic → device index, built from retained discovery
   * messages. Z-Wave/WiFi/BLE entities publish state on arbitrary topics declared
   * in their discovery config, so we can't map them to a device by topic position
   * (as Zigbee does). Rebuilt automatically on reconnect from retained configs.
   */
  private readonly haStateIndex = new Map<
    string,
    { deviceId: string; property: string }
  >();

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

  /**
   * Routes an incoming MQTT message by topic shape:
   *   home/id/{home}/{protocol}/bridge/devices        → Zigbee discovery
   *   home/id/{home}/discovery/<component>/.../config  → HA-Discovery (zwave/wifi/ble)
   *   home/id/{home}/zigbee/{device}                   → Zigbee state
   *   home/id/{home}/{protocol}/...                    → HA state (via index)
   */
  async handleMessage(topic: string, bufferMsg: Buffer) {
    try {
      const parts = topic.split('/');
      if (parts.length < 4) return;
      const homeUniqueId = parts[2];
      const seg3 = parts[3];

      if (seg3 === 'discovery') {
        return this.handleHaDiscovery(homeUniqueId, parts.slice(4), bufferMsg);
      }

      const protocol = seg3;
      const isBridgeDevices =
        parts[4] === 'bridge' && parts[5] === 'devices' && parts.length === 6;
      if (isBridgeDevices) {
        if (protocol !== DeviceProtocol.ZIGBEE) return;
        return this.handleZigbeeBridgeDevices(homeUniqueId, bufferMsg);
      }

      if (protocol === DeviceProtocol.ZIGBEE) {
        // Device state lives exactly at home/id/{home}/zigbee/{device}.
        // Sub-topics (availability, bridge/*) are ignored.
        if (parts.length !== 5) return;
        return this.handleZigbeeState(homeUniqueId, parts[4], bufferMsg);
      }

      // Z-Wave / WiFi / BLE state — resolved via the HA-Discovery index.
      return this.handleHaState(topic, homeUniqueId, bufferMsg);
    } catch (error: any) {
      console.log('Error handling message:', error);
    }
  }

  // ── Zigbee discovery (bridge/devices) ──────────────────────────────────────
  private async handleZigbeeBridgeDevices(
    homeUniqueId: string,
    bufferMsg: Buffer,
  ) {
    let homeBridgeDevices: any[];
    try {
      const parsed = JSON.parse(bufferMsg.toString());
      if (!Array.isArray(parsed)) {
        this.logger.error(`bridge/devices payload is not an array`);
        return;
      }
      homeBridgeDevices = parsed;
    } catch (err) {
      this.logger.error(`Failed to parse bridge/devices JSON: ${err}`);
      return;
    }

    const foundHome = await this.dbService.home.findUnique({
      where: { unique_id: homeUniqueId, disabled: false },
      select: {
        unique_id: true,
        id: true,
        name: true,
        organization_id: true,
        users: {
          select: {
            user_id: true,
            user: {
              select: {
                id: true,
                channels: true,
                telegram_chat_id: true,
                email: true,
                is_active: true,
              },
            },
          },
        },
        connected: true,
      },
    });
    if (!foundHome) {
      this.logger.error(`Not Found home bridge = ${homeUniqueId}`);
      return;
    }
    if (!foundHome.connected) {
      await this.markHomeConnected(foundHome);
    }

    const adapter = getAdapter(DeviceProtocol.ZIGBEE);
    await Promise.all(
      homeBridgeDevices.map(async (item) => {
        try {
          const discovered = adapter.parseDiscovery(item);
          if (!discovered) return; // coordinator / invalid

          const trimmedDescription =
            typeof item.description === 'string' ? item.description.trim() : '';
          const sanitized = sanitizeInput({
            unique_id: discovered.uniqueId,
            name: discovered.name,
            model: discovered.model,
            attributes: discovered.attributes,
            description: trimmedDescription
              ? trimmedDescription.substring(0, 512)
              : undefined,
          });

          const deviceFound = await this.dbService.device.findUnique({
            where: {
              unique_id_organization_id: {
                organization_id: foundHome.organization_id,
                unique_id: sanitized.unique_id,
              },
            },
            select: { id: true },
          });

          if (deviceFound) {
            await this.dbService.device.update({
              where: { id: deviceFound.id },
              data: {
                model: sanitized.model,
                attributes: sanitized.attributes,
                ...(sanitized.description !== undefined && {
                  description: sanitized.description,
                }),
              },
            });
            return;
          }

          if (
            !(await this.hasDeviceQuota(
              foundHome.organization_id,
              sanitized.unique_id,
            ))
          )
            return;

          await this.dbService.device.create({
            data: {
              unique_id: sanitized.unique_id,
              name: sanitized.name,
              model: sanitized.model,
              protocol: DeviceProtocol.ZIGBEE,
              attributes: sanitized.attributes,
              home_id: foundHome.id,
              organization_id: foundHome.organization_id,
              disabled: true,
              ...(sanitized.description !== undefined && {
                description: sanitized.description,
              }),
            },
          });
        } catch (error: any) {
          this.logger.error(`Error: ${error}`);
        }
      }),
    );
  }

  // ── Zigbee state ───────────────────────────────────────────────────────────
  private async handleZigbeeState(
    homeUniqueId: string,
    deviceUniqueId: string,
    bufferMsg: Buffer,
  ) {
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

    const homeOrgId = await this.cacheService.get<string>(
      getKeyHomeUniqueIdOrgId(homeUniqueId),
    );
    if (!homeOrgId) {
      this.logger.error(
        `Not Found Organization ID for home = ${homeUniqueId}`,
      );
      return;
    }

    const existingDevice = await this.dbService.device.findUnique({
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
        conditions: { select: { rule_id: true } },
      },
    });

    const device =
      existingDevice ??
      (await this.autoRegisterDevice({
        homeUniqueId,
        deviceUniqueId,
        organizationId: homeOrgId,
        protocol: DeviceProtocol.ZIGBEE,
      }));

    if (!device?.id) return;
    if (device.disabled) {
      this.logger.warn(
        `Device = ${deviceUniqueId} for home = ${homeUniqueId} is disabled`,
      );
      return;
    }

    this.logger.verbose(`Incoming Message: ${deviceUniqueId}`);
    await this.ingestSensorData(device, message, homeUniqueId);
  }

  // ── HA-Discovery (zwave/wifi/ble) ──────────────────────────────────────────
  private async handleHaDiscovery(
    homeUniqueId: string,
    rest: string[],
    bufferMsg: Buffer,
  ) {
    // rest = [<component>, (<node_id>)?, <object_id>, 'config']
    if (rest[rest.length - 1] !== 'config') return;

    const str = bufferMsg.toString().replace(/\u0000/g, '');
    if (!str.trim()) return; // cleared/retained-null = entity removed (no-op)

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(str);
    } catch (err) {
      this.logger.error(`Failed to parse HA discovery config: ${err}`);
      return;
    }

    // Any HA protocol key resolves to the shared HA-Discovery adapter.
    const adapter = getAdapter(DeviceProtocol.WIFI);
    const discovered = adapter.parseDiscovery({ topicParts: rest, payload });
    if (!discovered) return;

    // The protocol MUST come from the route (inferred from the entity topics) —
    // never defaulted. If it couldn't be inferred, do nothing but warn.
    const protocol = discovered.protocol;
    if (!protocol) {
      this.logger.warn(
        `HA discovery ignored: protocol not inferable from entity topics — uniqueId=${discovered.uniqueId} home=${homeUniqueId}`,
      );
      return;
    }

    const home = await this.dbService.home.findUnique({
      where: { unique_id: homeUniqueId, disabled: false },
      select: { id: true, organization_id: true },
    });
    if (!home) {
      this.logger.error(`HA discovery: home not found = ${homeUniqueId}`);
      return;
    }
    const existing = await this.dbService.device.findUnique({
      where: {
        unique_id_organization_id: {
          organization_id: home.organization_id,
          unique_id: discovered.uniqueId,
        },
      },
      select: { id: true, attributes: true },
    });

    let deviceId: string;
    if (existing) {
      const attributes = adapter.mergeDiscovery
        ? adapter.mergeDiscovery(existing.attributes, discovered)
        : discovered.attributes;
      await this.dbService.device.update({
        where: { id: existing.id },
        data: {
          model: discovered.model,
          protocol,
          attributes: attributes as Prisma.InputJsonValue,
        },
      });
      deviceId = existing.id;
    } else {
      if (
        !(await this.hasDeviceQuota(home.organization_id, discovered.uniqueId))
      )
        return;
      const created = await this.dbService.device.create({
        data: {
          unique_id: discovered.uniqueId,
          name: discovered.name,
          model: discovered.model,
          protocol,
          attributes: discovered.attributes as Prisma.InputJsonValue,
          home_id: home.id,
          organization_id: home.organization_id,
          disabled: true,
        },
        select: { id: true },
      });
      deviceId = created.id;
    }

    this.indexHaStateTopics(deviceId, discovered.attributes);
  }

  /** Register every entity's state_topic so its state messages resolve to this device. */
  private indexHaStateTopics(deviceId: string, attributes: unknown) {
    const attrs = attributes as HaDeviceAttributes | undefined;
    if (!attrs || attrs.source !== 'hadiscovery' || !attrs.entities) return;
    for (const entity of Object.values(attrs.entities)) {
      if (entity.stateTopic) {
        this.haStateIndex.set(entity.stateTopic, {
          deviceId,
          property: entity.property,
        });
      }
    }
  }

  // ── HA state ───────────────────────────────────────────────────────────────
  private async handleHaState(
    topic: string,
    homeUniqueId: string,
    bufferMsg: Buffer,
  ) {
    const entry = this.haStateIndex.get(topic);
    if (!entry) {
      // No per-entity discovery for this topic. If it's the canonical aggregate
      // shape `home/id/{uuid}/{protocol}/{deviceId}/state`, auto-register from the
      // payload (like Zigbee); otherwise ignore.
      const parts = topic.split('/');
      if (parts.length === 6 && parts[5] === 'state') {
        return this.handleHaAggregateState(
          homeUniqueId,
          parts[3],
          parts[4],
          bufferMsg,
        );
      }
      return;
    }

    const raw = bufferMsg.toString().replace(/\u0000/g, '');
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw; // plain string state (e.g. "ON")
    }

    const device = await this.dbService.device.findUnique({
      where: { id: entry.deviceId },
      select: {
        id: true,
        name: true,
        disabled: true,
        conditions: { select: { rule_id: true } },
      },
    });
    if (!device || device.disabled) return;

    await this.ingestSensorData(
      device,
      { [entry.property]: value },
      homeUniqueId,
    );
  }

  // ── HA aggregate state (single JSON payload, no per-entity discovery) ───────
  /**
   * Handles an HA-protocol device that publishes its whole state as one JSON object
   * on `home/id/{uuid}/{protocol}/{deviceId}/state`. Mirrors {@link handleZigbeeState}:
   * resolve-or-auto-register the device, then ingest the full payload. A later
   * HA-Discovery `config` enriches the same device via {@link handleHaDiscovery}.
   */
  private async handleHaAggregateState(
    homeUniqueId: string,
    protocol: string,
    deviceUniqueId: string,
    bufferMsg: Buffer,
  ) {
    // The protocol MUST come from the topic route — never defaulted. If the route
    // segment isn't a known HA protocol, do nothing but warn.
    if (!isHaProtocol(protocol)) {
      this.logger.warn(
        `Aggregate state ignored: unknown protocol "${protocol}" — home=${homeUniqueId} device=${deviceUniqueId}`,
      );
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(
        bufferMsg.toString().replace(new RegExp(String.fromCharCode(0), 'g'), ''),
      );
    } catch (err) {
      this.logger.error(
        `Failed to parse aggregate state for device=${deviceUniqueId} home=${homeUniqueId}: ${err}`,
      );
      return;
    }
    if (!message || typeof message !== 'object') {
      this.logger.error(
        `Invalid aggregate state (not an object) for device=${deviceUniqueId} home=${homeUniqueId}`,
      );
      return;
    }

    const organizationId = await this.resolveHomeOrgId(homeUniqueId);
    if (!organizationId) {
      this.logger.error(`Not Found Organization ID for home = ${homeUniqueId}`);
      return;
    }

    const stateTopic = `home/id/${homeUniqueId}/${protocol}/${deviceUniqueId}/state`;

    const existingDevice = await this.dbService.device.findUnique({
      where: {
        unique_id_organization_id: {
          organization_id: organizationId,
          unique_id: deviceUniqueId,
        },
      },
      select: {
        id: true,
        name: true,
        disabled: true,
        protocol: true,
        attributes: true,
        conditions: { select: { rule_id: true } },
      },
    });

    // Self-heal: a device created earlier with the wrong protocol (e.g. the DB
    // default) is corrected from the route here, and its attributes backfilled.
    if (existingDevice && existingDevice.protocol !== protocol) {
      const needsAttrs =
        (existingDevice.attributes as HaDeviceAttributes | null)?.source !==
        'hadiscovery';
      await this.dbService.device.update({
        where: { id: existingDevice.id },
        data: {
          protocol,
          ...(needsAttrs && {
            attributes: {
              source: 'hadiscovery',
              protocol,
              device: { identifiers: deviceUniqueId, name: deviceUniqueId },
              entities: synthesizeEntities(
                deviceUniqueId,
                stateTopic,
                message as Record<string, unknown>,
              ),
            } as unknown as Prisma.InputJsonValue,
          }),
        },
      });
      this.logger.log(
        `Reconciled protocol for device=${deviceUniqueId} home=${homeUniqueId}: ${existingDevice.protocol} -> ${protocol}`,
      );
    }

    const device =
      existingDevice ??
      (await this.autoRegisterDevice({
        homeUniqueId,
        deviceUniqueId,
        organizationId,
        protocol,
        stateTopic,
        statePayload: message as Record<string, unknown>,
      }));

    if (!device?.id) return;
    if (device.disabled) {
      this.logger.warn(
        `Device = ${deviceUniqueId} for home = ${homeUniqueId} is disabled`,
      );
      return;
    }

    await this.ingestSensorData(device, message as object, homeUniqueId);
  }

  // ── Shared state ingestion (protocol-agnostic) ─────────────────────────────
  private async ingestSensorData(
    device: IngestDevice,
    message: object,
    homeUniqueId: string,
  ) {
    await this.dbService.sensorData.create({
      data: { device_id: device.id, data: message as Prisma.InputJsonValue },
      select: { device_id: true, data: true, timestamp: true },
    });

    const prevSensorData = await this.dbService.sensorDataLast.findUnique({
      where: { device_id: device.id },
      select: { data: true },
    });

    const newSensorData = await this.dbService.sensorDataLast.upsert({
      where: { device_id: device.id },
      create: { device_id: device.id, data: message as Prisma.InputJsonValue },
      update: { data: message as Prisma.InputJsonValue },
      select: { device_id: true, data: true, timestamp: true },
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
      await this.globalUserAttributesNotification(
        device.name,
        newSensorData,
        prevSensorData,
        updatedHome,
      );
    }
  }

  /** Mark a home as connected and emit the connection notifications. */
  private async markHomeConnected(foundHome: {
    id: string;
    unique_id: string;
    name: string;
    users: {
      user_id: string;
      user: {
        id: string;
        channels: NotificationChannel[];
        telegram_chat_id: string | null;
        email: string | null;
        is_active: boolean;
      };
    }[];
  }) {
    await this.dbService.home.update({
      where: { id: foundHome.id },
      data: { connected: true },
    });
    await this.cacheService.sRem(
      getKeyHomeUniqueIdsDisconnected(),
      foundHome.unique_id,
    );
    const wasNotified = await this.cacheService.sIsMember(
      getKeyHomeNotifiedDisconnections(),
      foundHome.unique_id,
    );
    if (wasNotified) {
      await this.cacheService.sRem(
        getKeyHomeNotifiedDisconnections(),
        foundHome.unique_id,
      );
    }
    await this.natsClient.emit<IHomeConnectedEvent>('mqtt-core.home.connected', {
      homeId: foundHome.id,
      userIds: foundHome.users.map((user) => user.user_id),
      connected: true,
    });
    await this.natsClient.emit<IHomeConnectionNotification>(
      'notification.home-connection',
      {
        homeId: foundHome.id,
        homeName: foundHome.name,
        connected: true,
        users: foundHome.users.map((u) => ({
          id: u.user.id,
          channels: u.user.channels,
          telegram_chat_id: u.user.telegram_chat_id,
          email: u.user.email,
          is_active: u.user.is_active,
        })),
      },
    );
  }

  /** True if the organization is below its device quota (false also logs). */
  private async hasDeviceQuota(
    organizationId: string,
    deviceUniqueId: string,
  ): Promise<boolean> {
    const organization = await this.dbService.organization.findUnique({
      where: { id: organizationId },
      select: { max_devices: true },
    });
    if (!organization) {
      this.logger.error(`Organization not found id=${organizationId}`);
      return false;
    }
    const totalDevices = await this.dbService.device.count({
      where: { organization_id: organizationId },
    });
    if (totalDevices >= organization.max_devices) {
      this.logger.error(
        `Max devices reached for organization=${organizationId} (device=${deviceUniqueId})`,
      );
      return false;
    }
    return true;
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

      for (const [keyAttr, valueAttr] of Object.entries(userAttrObj)) {
        if (valueAttr === true && Object.keys(userAttrKeys).includes(keyAttr)) {
          for (const { key, value } of changes) {
            if (userAttrKeys[keyAttr as userAttr] === key) {
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
    /** Origin of the command — used for the audit trail. */
    source?: 'api' | 'ai' | 'rule' | 'schedule';
    /** Optional originating user id for the audit trail. */
    userId?: string;
  }): Promise<PublishCommandResult> {
    const {
      homeUniqueId,
      deviceUniqueId,
      organizationId,
      command,
      source = 'api',
      userId,
    } = payload;

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
        protocol: true,
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

    const adapter = getAdapter(device.protocol);
    const actions = adapter.getAvailableActions(device.attributes);
    const { command: normalized } = adapter.normalizeCommand(command, actions);

    if (actions.length > 0) {
      const validation = adapter.validateCommand(normalized, actions);
      if (!validation.valid) {
        const result: PublishCommandResult = {
          ok: false,
          code: 'INVALID_COMMAND',
          error: 'command does not match device capabilities',
          validationErrors: validation.errors,
        };
        await this.recordCommandExecution({
          deviceId: device.id,
          userId,
          source,
          command,
          result,
        });
        return result;
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
      const result: PublishCommandResult = {
        ok: false,
        code: 'RATE_LIMITED',
        error: `Max ${RATE_LIMIT_MAX_PER_WINDOW} commands per second per device`,
        retryAfterMs: Math.max(0, oldest + RATE_LIMIT_WINDOW_MS - now),
      };
      await this.recordCommandExecution({
        deviceId: device.id,
        userId,
        source,
        command,
        result,
      });
      return result;
    }
    fresh.push(now);
    this.commandTimestamps.set(limitKey, fresh);

    const messages = adapter.buildCommandMessages(
      {
        homeUniqueId,
        deviceUniqueId,
        protocol: device.protocol as DeviceProtocol,
        attributes: device.attributes,
      },
      normalized,
    );

    if (messages.length === 0) {
      const result: PublishCommandResult = {
        ok: false,
        code: 'INVALID_COMMAND',
        error: 'command did not map to any device action',
      };
      await this.recordCommandExecution({
        deviceId: device.id,
        userId,
        source,
        command,
        result,
      });
      return result;
    }

    const publishResult = await this.publishAll(messages);

    await this.recordCommandExecution({
      deviceId: device.id,
      userId,
      source,
      command,
      result: publishResult,
    });
    return publishResult;
  }

  /** Publish every command message; fails fast on the first broker error. */
  private async publishAll(
    messages: { topic: string; payload: string }[],
  ): Promise<PublishCommandResult> {
    for (const msg of messages) {
      const result = await new Promise<PublishCommandResult>((resolve) => {
        this.mqttClient.publish(msg.topic, msg.payload, { qos: 1 }, (err) => {
          if (err) {
            this.logger.error(
              `MQTT publish failed for ${msg.topic}: ${err.message}`,
            );
            resolve({ ok: false, code: 'PUBLISH_FAILED', error: err.message });
            return;
          }
          resolve({ ok: true });
        });
      });
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  /**
   * Resolve a home's organization id. Cache fast-path (telemetry is frequent); on a
   * cache miss fall back to the DB and re-warm the cache. Returns null if no such
   * enabled home exists. Prevents dropping data when the cache is cold/flushed.
   */
  private async resolveHomeOrgId(homeUniqueId: string): Promise<string | null> {
    const cached = await this.cacheService.get<string>(
      getKeyHomeUniqueIdOrgId(homeUniqueId),
    );
    if (cached) return cached;

    const home = await this.dbService.home.findUnique({
      where: { unique_id: homeUniqueId, disabled: false },
      select: { organization_id: true },
    });
    if (!home) return null;

    await this.cacheService.set(
      getKeyHomeUniqueIdOrgId(homeUniqueId),
      home.organization_id,
    );
    return home.organization_id;
  }

  private async autoRegisterDevice(input: {
    homeUniqueId: string;
    deviceUniqueId: string;
    organizationId: string;
    /** REQUIRED — always taken from the topic route; never defaulted. */
    protocol: string;
    /** For HA aggregate-state devices: the canonical state topic + first payload, used to
     *  synthesize read-only sensor entities so the device exposes readable attributes. */
    stateTopic?: string;
    statePayload?: Record<string, unknown>;
  }): Promise<IngestDevice | null> {
    const {
      homeUniqueId,
      deviceUniqueId,
      organizationId,
      protocol,
      stateTopic,
      statePayload,
    } = input;

    const home = await this.dbService.home.findUnique({
      where: { unique_id: homeUniqueId, disabled: false },
      select: { id: true, organization_id: true },
    });
    if (!home) {
      this.logger.error(
        `Auto-register skipped: home not found unique_id=${homeUniqueId} device=${deviceUniqueId}`,
      );
      return null;
    }
    if (home.organization_id !== organizationId) {
      this.logger.error(
        `Auto-register skipped: organization mismatch home=${homeUniqueId} cacheOrg=${organizationId} dbOrg=${home.organization_id}`,
      );
      return null;
    }

    if (!(await this.hasDeviceQuota(organizationId, deviceUniqueId))) {
      return null;
    }

    // HA-protocol devices persist canonical `source:'hadiscovery'` attributes (with
    // synthesized read-only entities) so getReadableAttributes/getAvailableActions work
    // and a later discovery config can merge cleanly. Zigbee leaves attributes for the
    // bridge/devices refresh to fill in.
    const isHaProtocol = protocol !== DeviceProtocol.ZIGBEE;
    const attributes: HaDeviceAttributes | undefined =
      isHaProtocol && stateTopic
        ? {
            source: 'hadiscovery',
            protocol,
            device: { identifiers: deviceUniqueId, name: deviceUniqueId },
            entities: synthesizeEntities(
              deviceUniqueId,
              stateTopic,
              statePayload ?? {},
            ),
          }
        : undefined;

    try {
      const created = await this.dbService.device.create({
        data: {
          unique_id: deviceUniqueId,
          name: deviceUniqueId,
          protocol,
          home_id: home.id,
          organization_id: organizationId,
          disabled: false,
          ...(attributes && {
            attributes: attributes as unknown as Prisma.InputJsonValue,
          }),
        },
        select: {
          id: true,
          name: true,
          disabled: true,
          conditions: { select: { rule_id: true } },
        },
      });
      this.logger.log(
        `Auto-registered device: id=${created.id} unique_id=${deviceUniqueId} protocol=${protocol} home=${homeUniqueId} organization=${organizationId}`,
      );
      if (isHaProtocol) {
        // Pull any retained discovery configs to enrich this device.
        this.refreshHaDiscovery(homeUniqueId);
      } else {
        this.refreshBridgeDevices(homeUniqueId);
      }
      return created;
    } catch (err) {
      this.logger.error(
        `Auto-register failed for device=${deviceUniqueId} home=${homeUniqueId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // Re-subscribe to the home's retained Zigbee bridge/devices topic so the broker
  // re-delivers the latest device list, enriching the new device with attributes.
  private refreshBridgeDevices(homeUniqueId: string) {
    const topic = `home/id/${homeUniqueId}/${DeviceProtocol.ZIGBEE}/bridge/devices`;
    this.mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        this.logger.warn(
          `Failed to re-subscribe ${topic} for metadata refresh: ${err.message}`,
        );
      }
    });
  }

  // Re-subscribe to the home's retained HA-Discovery config topics so the broker
  // re-delivers them, enriching an aggregate-state auto-registered device with the
  // proper entity metadata (units, command topics, names) when a bridge published them.
  private refreshHaDiscovery(homeUniqueId: string) {
    const topic = `home/id/${homeUniqueId}/discovery/#`;
    this.mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        this.logger.warn(
          `Failed to re-subscribe ${topic} for discovery refresh: ${err.message}`,
        );
      }
    });
  }

  /**
   * Best-effort: record a command execution for the audit log. Never throws —
   * the audit is observability, not a hard dependency of the user's request.
   */
  private async recordCommandExecution(input: {
    deviceId: string;
    userId?: string;
    source: 'api' | 'ai' | 'rule' | 'schedule';
    command: Record<string, unknown>;
    result: PublishCommandResult;
  }): Promise<void> {
    try {
      await this.dbService.commandExecution.create({
        data: {
          device_id: input.deviceId,
          user_id: input.userId ?? null,
          source: input.source,
          command: input.command as Prisma.InputJsonValue,
          ok: input.result.ok,
          code: input.result.code ?? null,
          error: input.result.error ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `command_executions insert failed: ${(err as Error).message}`,
      );
    }
  }
}
