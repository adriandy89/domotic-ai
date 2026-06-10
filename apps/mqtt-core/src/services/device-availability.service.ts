import { DbService } from '@app/db';
import {
  deriveAvailability,
  HaDeviceAttributes,
  IDeviceAvailability,
} from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger } from '@nestjs/common';
import { HomeRegistryService } from './home-registry.service';

/**
 * Device availability (online/offline) from retained
 * `home/id/{uuid}/{protocol}/{deviceId}/availability` messages, interpreted
 * via the device's stored availability contract.
 */
@Injectable()
export class DeviceAvailabilityService {
  private readonly logger = new Logger(DeviceAvailabilityService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
    private readonly homeRegistry: HomeRegistryService,
  ) {}

  /**
   * Handle a retained availability message on
   * `home/id/{uuid}/{protocol}/{deviceId}/availability`. Interprets the payload via
   * the device's stored availability contract (`{"state":"online"}`, or a plain
   * `online`/`offline` string), flips `Device.online` and emits
   * `mqtt-core.device.availability` only when the state actually changes.
   */
  async handleDeviceAvailability(
    homeUniqueId: string,
    protocol: string,
    deviceUniqueId: string,
    bufferMsg: Buffer,
  ) {
    const raw = bufferMsg
      .toString()
      .replace(/\u0000/g, '')
      .trim();
    if (!raw) return; // cleared/retained-null

    const organizationId =
      await this.homeRegistry.resolveHomeOrgId(homeUniqueId);
    if (!organizationId) {
      this.logger.error(`Not Found Organization ID for home = ${homeUniqueId}`);
      return;
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
        online: true,
        attributes: true,
        home: { select: { id: true, users: { select: { user_id: true } } } },
      },
    });
    // Availability can arrive before the device is registered (retained ordering);
    // a later state/discovery message creates it and future updates apply.
    if (!device?.home) return;

    const online = this.interpretAvailability(raw, device.attributes);
    if (online === undefined) {
      this.logger.warn(
        `Unrecognized availability payload "${raw}" for device=${deviceUniqueId} home=${homeUniqueId} protocol=${protocol}`,
      );
      return;
    }
    if (device.online === online) return; // no change

    await this.dbService.device.update({
      where: { id: device.id },
      data: { online },
    });

    await this.natsClient.emit<IDeviceAvailability>(
      'mqtt-core.device.availability',
      {
        homeId: device.home.id,
        userIds: device.home.users.map((u) => u.user_id),
        deviceId: device.id,
        online,
      },
    );
  }

  /**
   * Map a raw availability payload to online/offline using the device's stored
   * availability contract. Returns `undefined` when the token matches neither the
   * online nor the offline payload.
   */
  private interpretAvailability(
    raw: string,
    attributes: unknown,
  ): boolean | undefined {
    const config = (attributes as HaDeviceAttributes | null)?.config;
    const avail = deriveAvailability(config);
    const payloadOnline = avail?.payloadOnline ?? 'online';
    const payloadOffline = avail?.payloadOffline ?? 'offline';

    let token = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        token = String(
          (parsed as Record<string, unknown>)[avail?.field ?? 'state'],
        );
      } else {
        token = String(parsed);
      }
    } catch {
      token = raw; // plain string payload (e.g. "online")
    }

    if (token === payloadOnline) return true;
    if (token === payloadOffline) return false;
    return undefined;
  }
}
