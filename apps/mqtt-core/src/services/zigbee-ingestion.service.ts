import { DbService } from '@app/db';
import { DeviceProtocol, getAdapter } from '@app/models';
import { Injectable, Logger } from '@nestjs/common';
import { DeviceRegistryService } from './device-registry.service';
import { HomeRegistryService } from './home-registry.service';
import { SensorIngestionService } from './sensor-ingestion.service';

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

/**
 * Zigbee ingestion: the retained `bridge/devices` discovery list and the
 * per-device state messages published by zigbee2mqtt.
 */
@Injectable()
export class ZigbeeIngestionService {
  private readonly logger = new Logger(ZigbeeIngestionService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly homeRegistry: HomeRegistryService,
    private readonly deviceRegistry: DeviceRegistryService,
    private readonly sensorIngestion: SensorIngestionService,
  ) {}

  // ── Zigbee discovery (bridge/devices) ──────────────────────────────────────
  async handleZigbeeBridgeDevices(homeUniqueId: string, bufferMsg: Buffer) {
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
                language: true,
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
      await this.homeRegistry.markHomeConnected(foundHome);
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
            !(await this.deviceRegistry.hasDeviceQuota(
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
  async handleZigbeeState(
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

    // Cache fast-path with DB fallback (same contract as the HA/availability
    // paths) so a cold/flushed cache never drops zigbee telemetry.
    const homeOrgId = await this.homeRegistry.resolveHomeOrgId(homeUniqueId);
    if (!homeOrgId) {
      this.logger.error(`Not Found Organization ID for home = ${homeUniqueId}`);
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
        online: true,
        conditions: { select: { rule_id: true } },
      },
    });

    const device =
      existingDevice ??
      (await this.deviceRegistry.autoRegisterDevice({
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
    await this.sensorIngestion.ingestSensorData(device, message, homeUniqueId);
  }
}
