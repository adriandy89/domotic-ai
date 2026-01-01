export const NATS_QUEUE = {
  INIT: 'init_queue',
  API_GATEWAY: 'api_gateway_queue',
  CORE_MQTT: 'core_mqtt_queue',
  RULE_ENGINE: 'rule_engine_queue',
  SCHEDULES: 'schedules_queue',
  AI_SERVICE: 'ai_service_queue',
} as const;

// export const SCHEDULES_PATTERNS = {
//   CREATE_SCHEDULE: 'schedules.create',
//   LIST_SCHEDULES: 'schedules.list',
//   GET_SCHEDULE: 'schedules.get',
//   UPDATE_SCHEDULE: 'schedules.update',
//   DELETE_SCHEDULE: 'schedules.delete',
//   EXECUTE_SCHEDULE: 'schedules.execute',
//   SCHEDULE_STATS: 'schedules.stats',
// } as const;
