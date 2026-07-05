import * as fs from 'fs';
import { DeviceDefinition, DriverType } from './types';

/** Environment-derived configuration for the LAN bridge. */
export interface BridgeConfig {
  homeUniqueId: string;
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttClientId: string;
  /** Where pairing secrets (webOS client keys, …) are persisted. */
  dataDir: string;
  devices: DeviceDefinition[];
  /** Periodic SSDP scan that logs TVs found on the LAN but not yet configured. */
  discoveryEnabled: boolean;
}

const DRIVER_TYPES: ReadonlySet<string> = new Set<DriverType>(['webos']);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Devices come from DEVICES_FILE (JSON file path) or the DEVICES env var (JSON
 * array). Example entry:
 *   { "type": "webos", "id": "tv_salon", "name": "TV Salón", "ip": "192.168.1.50", "mac": "AA:BB:CC:DD:EE:FF" }
 */
function loadDevices(): DeviceDefinition[] {
  const file = process.env.DEVICES_FILE;
  const raw = file ? fs.readFileSync(file, 'utf8') : (process.env.DEVICES ?? '[]');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`DEVICES is not valid JSON: ${err}`);
  }
  if (!Array.isArray(parsed)) throw new Error('DEVICES must be a JSON array');

  return parsed.map((entry, i) => {
    const d = entry as Partial<DeviceDefinition>;
    if (!d.type || !DRIVER_TYPES.has(d.type))
      throw new Error(`DEVICES[${i}]: unknown type "${d.type}"`);
    if (!d.id || !/^[a-zA-Z0-9_-]+$/.test(d.id))
      throw new Error(`DEVICES[${i}]: "id" must be a topic-safe slug`);
    if (!d.ip) throw new Error(`DEVICES[${i}]: "ip" is required`);
    return {
      type: d.type,
      id: d.id,
      name: d.name ?? d.id,
      ip: d.ip,
      mac: d.mac,
    };
  });
}

export function loadConfig(): BridgeConfig {
  const homeUniqueId = required('HOME_UNIQUE_ID');
  return {
    homeUniqueId,
    mqttUrl: process.env.MQTT_URL ?? 'mqtt://mosquitto:1883',
    mqttUsername: process.env.MQTT_USERNAME,
    mqttPassword: process.env.MQTT_PASSWORD,
    mqttClientId: process.env.MQTT_CLIENT_ID ?? `${homeUniqueId}-lan-bridge`,
    dataDir: process.env.DATA_DIR ?? '/data',
    devices: loadDevices(),
    discoveryEnabled: process.env.DISCOVERY_ENABLED !== 'false',
  };
}

export const BRIDGE_CONFIG = 'BRIDGE_CONFIG';
