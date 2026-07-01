export const NATS_QUEUE = {
  INIT: 'init_queue',
  API_GATEWAY: 'api_gateway_queue',
  CORE_MQTT: 'core_mqtt_queue',
  RULE_ENGINE: 'rule_engine_queue',
  SCHEDULES: 'schedules_queue',
  AI_SERVICE: 'ai_service_queue',
  INTEGRATIONS: 'integrations_queue',
} as const;

export const SCHEDULES_PATTERNS = {
  UPSERT: 'schedules.upsert',
  DELETE: 'schedules.delete',
} as const;

export const XIAOZHI_PATTERNS = {
  UPSERTED: 'integrations.xiaozhi.upserted',
  DELETED: 'integrations.xiaozhi.deleted',
  TEST: 'integrations.xiaozhi.test',
} as const;

export const EDGE_PATTERNS = {
  // Rebuild + publish the retained offline rules bundle for a home. Emitted by
  // the API whenever a run_offline rule/schedule or home.edge_enabled changes.
  PUBLISH_BUNDLE: 'edge.bundle.publish',
} as const;
