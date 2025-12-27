//  =============== home ===================

export const getKeyHomeUniqueIdsDisconnected = () => {
  return `h-uniqueids-disconnected` as const;
};

export const getKeyHomeNotifiedDisconnections = () => {
  return `h-notified-disconnections` as const;
};

export const getKeyHomeUniqueIdOrgId = (homeUniqueId: string) => {
  if (!homeUniqueId)
    throw new Error('Home unique ID is required to generate cache key');
  return `h-uniqueid:${homeUniqueId}:org-id` as const;
};

export const getKeyDeviceData = (deviceId: string) => {
  if (!deviceId)
    throw new Error('Device ID is required to generate cache key');
  return `d-sensor:${deviceId}:data` as const;
};

// ! ========================================

// // phone - userId cache
// export const getKeyPhoneUserId = (phone: string) => {
//   if (!phone) throw new Error('Phone number is required to generate cache key');
//   return `phone:${phone}:user-id` as const;
// };

// export const getKeyWSUserIdLast24h = (id: string) => {
//   if (!id) throw new Error('User ID is required to generate cache key');
//   return `ws-user:${id}:last24h` as const;
// };
