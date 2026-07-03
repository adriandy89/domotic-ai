/** Environment-derived configuration for the edge engine. */
export interface EdgeConfig {
  homeUniqueId: string;
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttClientId: string;
  rulesSyncTopic: string;
  centralApiUrl?: string;
  edgeAuthToken: string;
  sqlitePath: string;
  watchdogIntervalSeconds: number;
  timezone: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadConfig(): EdgeConfig {
  const homeUniqueId = required('HOME_UNIQUE_ID');
  return {
    homeUniqueId,
    mqttUrl: process.env.MQTT_URL ?? 'mqtt://mosquitto:1883',
    mqttUsername: process.env.MQTT_USERNAME,
    mqttPassword: process.env.MQTT_PASSWORD,
    mqttClientId: process.env.MQTT_CLIENT_ID ?? `${homeUniqueId}-edge-rules`,
    rulesSyncTopic:
      process.env.RULES_SYNC_TOPIC ?? `home/id/${homeUniqueId}/edge/rules`,
    centralApiUrl: process.env.CENTRAL_API_URL,
    edgeAuthToken: process.env.EDGE_AUTH_TOKEN ?? '',
    sqlitePath: process.env.SQLITE_PATH ?? '/data/edge.db',
    watchdogIntervalSeconds: Number(
      process.env.WATCHDOG_INTERVAL_SECONDS ?? 300,
    ),
    timezone: process.env.TZ ?? 'UTC',
  };
}

export const EDGE_CONFIG = 'EDGE_CONFIG';
