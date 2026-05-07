export const RC = {
  userId: 'userId',
  organizationId: 'organizationId',
  userRole: 'userRole',
  timeZone: 'timeZone',
  dbService: 'dbService',
  natsClient: 'natsClient',
} as const;

export type RcKey = (typeof RC)[keyof typeof RC];
