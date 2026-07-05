/** Driver types the bridge knows how to instantiate. */
export type DriverType = 'webos';

/** One LAN device the bridge manages, as declared in DEVICES / DEVICES_FILE. */
export interface DeviceDefinition {
  type: DriverType;
  /** Device unique id — becomes the MQTT topic segment and the platform `unique_id`. */
  id: string;
  name: string;
  ip: string;
  /** MAC address; enables Wake-on-LAN power-on (TVs can't be woken over their own socket). */
  mac?: string;
}

/** Select options discovered at runtime (TV inputs, installed apps). */
export interface DriverCapabilities {
  inputs: string[];
  apps: string[];
}

/**
 * Callbacks a driver uses to surface device changes; the bridge turns them into
 * the retained MQTT messages the platform ingests.
 */
export interface DriverHost {
  /** Partial state; the bridge merges it into the device's aggregate `…/state` JSON. */
  publishState(partial: Record<string, unknown>): void;
  publishAvailability(online: boolean): void;
  /** New select options known → the bridge republishes the discovery config. */
  capabilitiesChanged(caps: Partial<DriverCapabilities>): void;
}

/** A running protocol driver bound to one device. */
export interface DeviceDriver {
  readonly definition: DeviceDefinition;
  start(): void;
  stop(): void;
  /** Execute one command property (topic `…/set/{property}`, payload = value). */
  handleCommand(property: string, value: string): Promise<void>;
}
