import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BRIDGE_CONFIG, BridgeConfig } from '../config';
import { createDriver } from '../drivers/driver.factory';
import { buildBridgeConfig } from '../ha-config/build-bridge-config';
import { buildTvConfig } from '../ha-config/build-tv-config';
import { MqttService } from '../mqtt/mqtt.service';
import { PairingService } from '../pairing/pairing.service';
import { DeviceStoreService } from '../store/device-store.service';
import {
  DeviceDefinition,
  DeviceDriver,
  DriverCapabilities,
  DriverHost,
} from '../types';

/**
 * Orchestrator: one driver per managed device (persisted registry, seeded from
 * env, extended live by pairing). Publishes the retained HA-Discovery configs,
 * aggregate `…/state` JSON and `…/availability`, and routes incoming
 * `…/set/{property}` command messages to the owning driver.
 *
 * The bridge also registers ITSELF as a device (`buildBridgeConfig`) whose
 * `pairing` switch opens the on-demand discovery/pairing window.
 */
@Injectable()
export class BridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BridgeService.name);
  private readonly drivers = new Map<string, DeviceDriver>();
  private readonly definitions = new Map<string, DeviceDefinition>();
  private readonly stateCache = new Map<string, Record<string, unknown>>();
  private readonly capsCache = new Map<string, Partial<DriverCapabilities>>();
  /** The bridge's own device id (org-unique via the home id). */
  readonly bridgeId: string;

  constructor(
    @Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig,
    private readonly mqtt: MqttService,
    private readonly deviceStore: DeviceStoreService,
    private readonly pairing: PairingService,
  ) {
    this.bridgeId = `lanbridge_${config.homeUniqueId.slice(0, 8)}`;
  }

  onModuleInit(): void {
    this.mqtt.onMessage((topic, payload) => this.routeCommand(topic, payload));
    this.mqtt.subscribe(`home/id/${this.config.homeUniqueId}/wifi/+/set/+`);

    this.pairing.bind({
      isManaged: (id, ip) =>
        id === this.bridgeId ||
        this.deviceStore.has(id) ||
        this.deviceStore.hasIp(ip),
      onPaired: (def) => {
        this.deviceStore.add(def);
        this.attachDevice(def);
      },
      onStateChange: (state) => this.publishState(this.bridgeId, state),
    });

    this.publishBridgeDevice();
    for (const def of this.deviceStore.load()) this.attachDevice(def);
    this.publishState(this.bridgeId, {
      pairing: 'OFF',
      pairing_code: '',
      devices: this.drivers.size,
    });
  }

  onModuleDestroy(): void {
    this.publishAvailability(this.bridgeId, false);
    for (const [id, driver] of this.drivers) {
      this.publishAvailability(id, false);
      try {
        driver.stop();
      } catch (err: any) {
        this.logger.warn(`Driver ${id} stop failed: ${err?.message}`);
      }
    }
  }

  /** Create + start the driver for one device and publish its contract. */
  private attachDevice(def: DeviceDefinition): void {
    if (this.drivers.has(def.id)) return;
    const host: DriverHost = {
      publishState: (partial) => this.publishState(def.id, partial),
      publishAvailability: (online) => this.publishAvailability(def.id, online),
      capabilitiesChanged: (caps) => this.onCapabilities(def.id, caps),
    };
    const driver = createDriver(def, host, this.config.dataDir);
    this.definitions.set(def.id, def);
    this.drivers.set(def.id, driver);
    this.publishDiscoveryConfig(def.id);
    driver.start();
    this.publishAvailability(def.id, true);
    this.publishState(this.bridgeId, { devices: this.drivers.size });
    this.logger.log(`Driver ${def.type} started for ${def.id} (${def.ip})`);
  }

  private baseTopic(deviceId: string): string {
    return `home/id/${this.config.homeUniqueId}/wifi/${deviceId}`;
  }

  private publishBridgeDevice(): void {
    this.mqtt.publish(
      `home/id/${this.config.homeUniqueId}/discovery/device/${this.bridgeId}/config`,
      JSON.stringify(buildBridgeConfig(this.config.homeUniqueId, this.bridgeId)),
      { retain: true },
    );
    this.publishAvailability(this.bridgeId, true);
  }

  private publishDiscoveryConfig(deviceId: string): void {
    const def = this.definitions.get(deviceId);
    if (!def) return;
    const config = buildTvConfig(
      this.config.homeUniqueId,
      def,
      this.capsCache.get(deviceId) ?? {},
    );
    this.mqtt.publish(
      `home/id/${this.config.homeUniqueId}/discovery/device/${deviceId}/config`,
      JSON.stringify(config),
      { retain: true },
    );
  }

  private publishState(
    deviceId: string,
    partial: Record<string, unknown>,
  ): void {
    const merged = { ...this.stateCache.get(deviceId), ...partial };
    this.stateCache.set(deviceId, merged);
    this.mqtt.publish(
      `${this.baseTopic(deviceId)}/state`,
      JSON.stringify(merged),
      { retain: true },
    );
  }

  private publishAvailability(deviceId: string, online: boolean): void {
    this.mqtt.publish(
      `${this.baseTopic(deviceId)}/availability`,
      online ? 'online' : 'offline',
      { retain: true },
    );
  }

  private onCapabilities(
    deviceId: string,
    caps: Partial<DriverCapabilities>,
  ): void {
    const merged = { ...this.capsCache.get(deviceId), ...caps };
    this.capsCache.set(deviceId, merged);
    this.publishDiscoveryConfig(deviceId);
  }

  /** `home/id/{home}/wifi/{deviceId}/set/{property}` → driver / bridge action. */
  private routeCommand(topic: string, payload: Buffer): void {
    const parts = topic.split('/');
    if (
      parts.length !== 7 ||
      parts[0] !== 'home' ||
      parts[1] !== 'id' ||
      parts[2] !== this.config.homeUniqueId ||
      parts[3] !== 'wifi' ||
      parts[5] !== 'set'
    ) {
      return;
    }
    const deviceId = parts[4];
    const property = parts[6];
    const value = payload.toString();

    if (deviceId === this.bridgeId) {
      if (property === 'pairing') {
        this.pairing.setPairing(value.toUpperCase() === 'ON');
      } else if (property === 'pairing_code') {
        this.pairing.submitCode(value);
      }
      return;
    }

    const driver = this.drivers.get(deviceId);
    if (!driver) return;
    driver.handleCommand(property, value).catch((err: any) => {
      this.logger.error(
        `Command ${property}=${value} failed for ${deviceId}: ${err?.message}`,
      );
    });
  }
}
