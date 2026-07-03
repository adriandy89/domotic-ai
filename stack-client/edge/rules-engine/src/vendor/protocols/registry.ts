import { ProtocolAdapter } from './protocol-adapter.interface';
import { DeviceProtocol } from './types';
import { ZigbeeAdapter } from './zigbee/zigbee.adapter';
import { HaDiscoveryAdapter } from './hadiscovery/hadiscovery.adapter';

/**
 * Protocol → adapter registry. The single place that wires a protocol to its
 * implementation. Adding a protocol = implement {@link ProtocolAdapter} and
 * `registerAdapter(...)` it here (or at runtime); no consumer changes.
 */
const REGISTRY = new Map<string, ProtocolAdapter>();

export function registerAdapter(
  protocol: string,
  adapter: ProtocolAdapter,
): void {
  REGISTRY.set(protocol, adapter);
}

/** Resolve the adapter for a protocol. Throws on unknown protocol. */
export function getAdapter(protocol: string): ProtocolAdapter {
  const adapter = REGISTRY.get(protocol);
  if (!adapter) {
    throw new Error(
      `Unknown device protocol: "${protocol}". Known: ${[...REGISTRY.keys()].join(', ')}.`,
    );
  }
  return adapter;
}

export function isKnownProtocol(protocol: string): boolean {
  return REGISTRY.has(protocol);
}

export function listProtocols(): string[] {
  return [...REGISTRY.keys()];
}

// ── Built-in adapters ────────────────────────────────────────────────────────
// Zigbee speaks its native zigbee2mqtt `exposes`; Z-Wave/WiFi/BLE share the one
// Home Assistant MQTT Discovery adapter.
const haDiscovery = new HaDiscoveryAdapter();
registerAdapter(DeviceProtocol.ZIGBEE, new ZigbeeAdapter());
registerAdapter(DeviceProtocol.ZWAVE, haDiscovery);
registerAdapter(DeviceProtocol.WIFI, haDiscovery);
registerAdapter(DeviceProtocol.BLE, haDiscovery);
