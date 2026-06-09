// Per-protocol edge configuration templates shown in the home "Integrations" panel.
//
// A home has ONE MQTT credential (username = home unique_id). Each protocol only
// differs by its topic namespace (`home/id/{uuid}/{protocol}`), its client_id
// (`{uuid}-{protocol}`) and — for the HA-Discovery protocols — the per-home
// discovery prefix (`home/id/{uuid}/discovery`). Adding a protocol here is the only
// frontend change needed: append an entry to PROTOCOL_CATALOG and a case in
// buildIntegrationConfig.

export type Protocol = 'zigbee' | 'zwave' | 'wifi' | 'ble';

export interface ProtocolInfo {
  protocol: Protocol;
  label: string;
  /** Official upstream image / firmware (never forked). */
  image: string;
  docsUrl: string;
  description: string;
}

export const PROTOCOL_CATALOG: ProtocolInfo[] = [
  {
    protocol: 'zigbee',
    label: 'Zigbee',
    image: 'koenkk/zigbee2mqtt',
    docsUrl: 'https://www.zigbee2mqtt.io/',
    description: 'Zigbee devices via zigbee2mqtt (native exposes).',
  },
  {
    protocol: 'zwave',
    label: 'Z-Wave',
    image: 'zwavejs/zwave-js-ui',
    docsUrl: 'https://zwave-js.github.io/zwave-js-ui/',
    description: 'Z-Wave devices via zwave-js-ui (MQTT gateway + HA discovery).',
  },
  {
    protocol: 'wifi',
    label: 'WiFi',
    image: 'domotic-ai firmware',
    docsUrl: 'https://domotic-ai.com',
    description:
      'WiFi devices with native MQTT firmware — HA device-based discovery (cmps).',
  },
  {
    protocol: 'ble',
    label: 'BLE',
    image: 'theengs/gateway',
    docsUrl: 'https://gateway.theengs.io/',
    description: 'Bluetooth LE sensors via Theengs Gateway (read-only).',
  },
];

export interface IntegrationParams {
  host: string;
  port: number;
  username: string; // home unique_id
  password: string;
  uniqueId: string; // home unique_id
}

export interface IntegrationConfig {
  /** Topic namespace this protocol publishes/receives under. */
  baseTopic: string;
  /** HA-Discovery prefix (empty for Zigbee, which uses native bridge/devices). */
  discoveryPrefix: string;
  clientId: string;
  /** Syntax-highlight hint for the rendered code block. */
  language: 'yaml' | 'ini' | 'text';
  /** Where this snippet goes. */
  target: string;
  /** Ready-to-copy configuration snippet. */
  snippet: string;
}

export function buildIntegrationConfig(
  protocol: Protocol,
  p: IntegrationParams,
): IntegrationConfig {
  const baseTopic = `home/id/${p.uniqueId}/${protocol}`;
  const discoveryPrefix = `home/id/${p.uniqueId}/discovery`;
  const clientId = `${p.uniqueId}-${protocol}`;
  const broker = `mqtt://${p.host}:${p.port}`;

  switch (protocol) {
    case 'zigbee':
      return {
        baseTopic,
        discoveryPrefix: '',
        clientId,
        language: 'yaml',
        target: 'zigbee2mqtt → configuration.yaml',
        snippet: [
          'mqtt:',
          `  base_topic: ${baseTopic}`,
          `  server: ${broker}`,
          '  version: 5',
          `  client_id: ${clientId}`,
          `  user: ${p.username}`,
          `  password: ${p.password}`,
        ].join('\n'),
      };

    case 'zwave':
      return {
        baseTopic,
        discoveryPrefix,
        clientId,
        language: 'text',
        target: 'zwave-js-ui → Settings (UI)',
        snippet: [
          '# Settings → MQTT',
          `Host:       ${broker}`,
          `Username:   ${p.username}`,
          `Password:   ${p.password}`,
          `Name:       ${baseTopic}      # gateway prefix`,
          `Client ID:  ${clientId}`,
          '',
          '# Settings → Home Assistant',
          'MQTT Discovery:   ON',
          `Discovery Prefix: ${discoveryPrefix}`,
        ].join('\n'),
      };

    case 'wifi':
      return {
        baseTopic,
        discoveryPrefix,
        clientId,
        language: 'text',
        target: 'firmware nativo (config MQTT + topics)',
        snippet: [
          '# Broker MQTT (misma credencial del hogar)',
          `Host:       ${p.host}`,
          `Port:       ${p.port}`,
          `Username:   ${p.username}`,
          `Password:   ${p.password}`,
          `Client ID:  ${clientId}-<device>   # único por dispositivo`,
          '',
          '# Topics a publicar (<device> = id estable por dispositivo):',
          `Discovery:    ${discoveryPrefix}/device/<device>/config   # retenido, HA device-based (cmps)`,
          `State:        ${baseTopic}/<device>/state                 # un JSON con todos los campos`,
          `Availability: ${baseTopic}/<device>/availability          # {"state":"online"|"offline"}`,
        ].join('\n'),
      };

    case 'ble':
      return {
        baseTopic,
        discoveryPrefix,
        clientId,
        language: 'ini',
        target: 'theengs/gateway → docker environment',
        snippet: [
          `MQTT_HOST=${p.host}`,
          `MQTT_PORT=${p.port}`,
          `MQTT_USERNAME=${p.username}`,
          `MQTT_PASSWORD=${p.password}`,
          `MQTT_PUB_TOPIC=${baseTopic}/BTtoMQTT`,
          'DISCOVERY=true',
          `DISCOVERY_TOPIC=${discoveryPrefix}`,
        ].join('\n'),
      };
  }
}
