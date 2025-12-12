export const NATS_QUEUE = {
  INIT: 'init_queue',
  API_GATEWAY: 'api_gateway_queue',
  AUTH: 'auth_queue',
  DEVICES: 'devices_queue',
  CORE_MQTT: 'core_mqtt_queue',
  GEOFENCES: 'geofences_queue',
  NOTIFICATIONS: 'notifications_queue',
  RULE_ENGINE: 'rule_engine_queue',
  SCHEDULES: 'schedules_queue',
  SEARCH_ENGINE: 'search_engine_queue',
  AI_SERVICE: 'ai_service_queue',
} as const;

// Patterns para análisis y reportes en Search Engine
export const SEARCH_ENGINE_PATTERNS = {
  // Análisis existentes
  ANALYSIS_REQUEST: 'analysis.request',
  ANALYSIS_LIST: 'analysis.list',
  ANALYSIS_STATUS: 'analysis.status',
  ANALYSIS_RESULT: 'analysis.result',

  // Nuevos patterns para reportes
  REPORTS_GENERATE: 'reports.generate',
  REPORTS_HISTORY: 'reports.history',
  REPORTS_DELETE: 'reports.delete',
  REPORTS_QUICK: 'reports.quick',
  REPORTS_TEMPLATES: 'reports.templates',
  REPORTS_STATISTICS: 'reports.statistics',
} as const;

// Patterns para schedules (reportes programados)
export const SCHEDULES_PATTERNS = {
  CREATE_SCHEDULE: 'schedules.create',
  LIST_SCHEDULES: 'schedules.list',
  GET_SCHEDULE: 'schedules.get',
  UPDATE_SCHEDULE: 'schedules.update',
  DELETE_SCHEDULE: 'schedules.delete',
  EXECUTE_SCHEDULE: 'schedules.execute',
  SCHEDULE_STATS: 'schedules.stats',
} as const;

// Patterns para notificaciones de errores del sistema
export const SYSTEM_ERROR_PATTERNS = {
  SYSTEM_ERROR: 'system.error.notify',
} as const;
