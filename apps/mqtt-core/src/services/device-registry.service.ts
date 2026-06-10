import { DbService } from '@app/db';
import {
  DeviceProtocol,
  HaDeviceAttributes,
  synthesizeConfig,
} from '@app/models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { MqttClient } from 'mqtt';
import { IngestDevice } from '../mqtt-core.types';

/**
 * Device registration shared by every ingestion path: organization quota
 * enforcement and auto-registration of devices that publish state before any
 * discovery message (plus the retained-topic refreshes that enrich them).
 */
@Injectable()
export class DeviceRegistryService {
  private readonly logger = new Logger(DeviceRegistryService.name);

  constructor(
    private readonly dbService: DbService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: MqttClient,
  ) {}

  /** True if the organization is below its device quota (false also logs). */
  async hasDeviceQuota(
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

  async autoRegisterDevice(input: {
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

    // HA-protocol devices persist canonical `source:'hadiscovery'` attributes (with a
    // synthesized raw config) so getReadableAttributes/getAvailableActions work and a
    // later discovery config can merge cleanly. Zigbee leaves attributes for the
    // bridge/devices refresh to fill in.
    const isHaProtocol = protocol !== DeviceProtocol.ZIGBEE;
    const attributes: HaDeviceAttributes | undefined =
      isHaProtocol && stateTopic
        ? {
            source: 'hadiscovery',
            protocol,
            config: synthesizeConfig(
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
          online: true,
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
}
