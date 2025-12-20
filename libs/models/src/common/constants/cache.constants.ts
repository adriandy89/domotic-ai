//  =============== home ===================

export const getKeyHomeUniqueIdDevicesUniqueIds = (homeUniqueId: string) => {
  if (!homeUniqueId)
    throw new Error('Home unique ID is required to generate cache key');
  return `h-uniqueid:${homeUniqueId}:devices-uniqueids` as const;
};

export const getKeyHomeUniqueIdOrgId = (homeUniqueId: string) => {
  if (!homeUniqueId)
    throw new Error('Home unique ID is required to generate cache key');
  return `h-uniqueid:${homeUniqueId}:org-id` as const;
};

export const getKeyHomeUniqueIdsDisconnected = () => {
  return `h-uniqueids-disconnected` as const;
};

//  =============== device ===================

// export const getKeyDeviceIdLastData = (deviceId: string) => {
//   if (!deviceId) throw new Error('Device ID is required to generate cache key');
//   return `d-id:${deviceId}:last-data` as const;
// };

// ! ========================================

// `rule:${created.id}:users`; // create rule cache key
// export const getDataKeyRuleIdUsers = (ruleId: string) => {
//   if (!ruleId) throw new Error('Rule ID is required to generate cache key');
//   return `rule:${ruleId}:users` as const;
// };
// export const getDataKeyRuleIdUsersAll = () => `rule:*:users` as const;

// ! ========================================

// phone - userId cache
export const getKeyPhoneUserId = (phone: string) => {
  if (!phone) throw new Error('Phone number is required to generate cache key');
  return `phone:${phone}:user-id` as const;
};

export const getKeyWSUserIdLast24h = (id: string) => {
  if (!id) throw new Error('User ID is required to generate cache key');
  return `ws-user:${id}:last24h` as const;
};
