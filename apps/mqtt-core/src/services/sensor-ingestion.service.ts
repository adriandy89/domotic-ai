import { DbService } from '@app/db';
import {
  detectStateTransitions,
  IDeviceAvailability,
  IRulesSensorData,
  ISensorData,
  IUserSensorNotification,
  userAttr,
} from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger } from '@nestjs/common';
import { JsonValue } from '@prisma/client/runtime/client';
import {
  NotificationChannel,
  Prisma,
  SensorData,
} from 'generated/prisma/client';
import { IngestDevice } from '../mqtt-core.types';

/** Narrow a stored JSON value to a plain object payload. */
function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

/**
 * Shared, protocol-agnostic state ingestion: persists the payload
 * (sensor_data + sensor_data_last), records logbook state transitions, and
 * fans out the NATS events (sensor data, device revival, rules, user
 * attribute notifications). Both the Zigbee and HA paths end here.
 */
@Injectable()
export class SensorIngestionService {
  private readonly logger = new Logger(SensorIngestionService.name);

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly dbService: DbService,
  ) {}

  async ingestSensorData(
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

    if (prevSensorData) {
      await this.recordStateEvents(
        device.id,
        prevSensorData.data,
        newSensorData.data,
        newSensorData.timestamp,
      );
    }

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

    // A fresh state message means the device is alive: revive it if a previous
    // availability/staleness check had flipped it offline. Only on the transition,
    // so the hot path stays a single read + no write when already online.
    if (device.online === false) {
      await this.dbService.device.update({
        where: { id: device.id },
        data: { online: true },
      });
      await this.natsClient.emit<IDeviceAvailability>(
        'mqtt-core.device.availability',
        {
          homeId: updatedHome.id,
          userIds: updatedHome.users.map((user) => user.user.id),
          deviceId: device.id,
          online: true,
        },
      );
    }

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

  /**
   * Logbook: persist the state transitions between the previous and the new
   * payload (non-numeric scalar states only — see detectStateTransitions).
   * Heartbeats with unchanged values write nothing. Never breaks ingestion.
   */
  private async recordStateEvents(
    deviceId: string,
    prevData: JsonValue,
    newData: JsonValue,
    timestamp: Date,
  ) {
    try {
      if (!isJsonObject(prevData) || !isJsonObject(newData)) return;
      const transitions = detectStateTransitions(prevData, newData);
      if (transitions.length === 0) return;

      await this.dbService.deviceStateEvent.createMany({
        data: transitions.map((t) => ({
          device_id: deviceId,
          property: t.property,
          prev_value: t.prevValue,
          value: t.value,
          timestamp,
        })),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record state events for device=${deviceId}: ${err}`,
      );
    }
  }

  private async globalUserAttributesNotification(
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
}
