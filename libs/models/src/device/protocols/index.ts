// Canonical, protocol-agnostic capability model + adapter registry.
export * from './types';
export * from './protocol-adapter.interface';
export * from './registry';
export * from './shared/validate-command';

// Zigbee (native zigbee2mqtt exposes).
export * from './zigbee/exposes.types';
export * from './zigbee/parse-exposes';
export * from './zigbee/normalize-command';
export * from './zigbee/zigbee.adapter';

// Home Assistant MQTT Discovery (Z-Wave / WiFi / BLE).
export * from './hadiscovery/ha-config.types';
export * from './hadiscovery/parse-ha-config';
export * from './hadiscovery/evaluate-value-template';
export * from './hadiscovery/transform-ha-state';
export * from './hadiscovery/hadiscovery.adapter';
