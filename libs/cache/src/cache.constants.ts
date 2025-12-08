export enum CacheServiceName {
  SESSION = 'session',
  DATA = 'data',
}

export interface CacheOptions {
  redisUrl: string; // URL of the Redis instance. E.g., 'redis://localhost:6379/0' or 'redis://another-host:6380/0'
  password?: string; // Optional password for Redis authentication
  name?: string; // Name to identify this cache instance (useful for logs)
  // Here you can add other client-specific Redis configuration options if needed
}

// ! Data Cache Keys

export const getDataKeyDeviceUniqueId = (deviceUniqueId: string) => {
  if (!deviceUniqueId)
    throw new Error('Device unique ID is required to generate cache key');
  return `unique_id:${deviceUniqueId}` as const;
};
export const getDataKeyDeviceUniqueIdAll = () => `unique_id:*` as const;

// `rule:${created.id}:users`; // create rule cache key
export const getDataKeyRuleIdUsers = (ruleId: string) => {
  if (!ruleId) throw new Error('Rule ID is required to generate cache key');
  return `rule:${ruleId}:users` as const;
};
export const getDataKeyRuleIdUsersAll = () => `rule:*:users` as const;

// Optimized cache keys for rule groups
export const getDataKeyRuleGroup = (ruleGroupId: string) => {
  if (!ruleGroupId) throw new Error('Rule Group ID is required to generate cache key');
  return `rule_group:${ruleGroupId}:data` as const;
};
export const getDataKeyRuleGroupAll = () => `rule_group:*:data` as const;

export const getDataKeyDeviceRuleGroups = (deviceId: string) => {
  if (!deviceId) throw new Error('Device ID is required to generate cache key');
  return `device:${deviceId}:rule_groups` as const;
};
export const getDataKeyDeviceRuleGroupsAll = () => `device:*:rule_groups` as const;

// ! Session Cache Keys

export const getSessionKeyDeviceIdUsers = (deviceId: string) => {
  if (!deviceId) throw new Error('Device ID is required to generate cache key');
  return `device:${deviceId}:users` as const;
};
export const getSessionKeyDeviceIdUsersAll = () => `device:*:users` as const;

export const getSessionKeyDeviceIdGeofences = (deviceId: string) => {
  if (!deviceId) throw new Error('Device ID is required to generate cache key');
  return `device:${deviceId}:geofences` as const;
};
export const getSessionKeyDeviceIdGeofencesAll = () =>
  `device:*:geofences` as const;

export const getSessionKeyGeofenceIdUsers = (geofenceId: string) => {
  if (!geofenceId)
    throw new Error('Geofence ID is required to generate cache key');
  return `geofence:${geofenceId}:users` as const;
};
export const getSessionKeyGeofenceIdUsersAll = () =>
  `geofence:*:users` as const;

export const getSessionKeyAuth = (sessionId: string) => {
  if (!sessionId)
    throw new Error('Session ID is required to generate cache key');
  return `auth:${sessionId}` as const;
};
export const getSessionKeyAuthAll = () => `auth:*` as const;
export const getSessionKeyAuthPrefix = () => `auth:` as const;

export const getSessionKeySessionUser = (id: string) => {
  if (!id) throw new Error('User ID is required to generate cache key');
  return `session:${id}` as const;
};
export const getSessionKeySessionUserAll = () => `session:*` as const;

export const getSessionKeyUserFmcTokens = (id: string) => {
  if (!id) throw new Error('User ID is required to generate cache key');
  return `user:${id}:fmc-tokens` as const;
};
export const getSessionKeyUserFmcTokensAll = () => `user:*:fmc-tokens` as const;

// phone - userId cache
export const getPhoneKeyUserId = (phone: string) => {
  if (!phone) throw new Error('Phone number is required to generate cache key');
  return `phone:${phone}:userId` as const;
};
export const getPhoneKeyUserIdAll = () => `phone:*:userId` as const;