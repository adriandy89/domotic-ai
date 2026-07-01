/**
 * Framework-agnostic mirrors of the Prisma enums this library reasons about.
 *
 * They are declared here — instead of importing from `generated/prisma` — so the
 * evaluator stays pure and can be vendored into the standalone edge engine (which
 * has no Prisma). The string values MUST match Prisma exactly: rules coming from
 * Postgres (central) carry plain strings like `"EQ"`, so `operation === Operation.EQ`
 * compares string-to-string and works no matter which enum object produced it.
 */

export const Operation = {
  EQ: 'EQ',
  GT: 'GT',
  GTE: 'GTE',
  LT: 'LT',
  LTE: 'LTE',
  INACTIVE: 'INACTIVE',
  STALE: 'STALE',
} as const;
export type Operation = (typeof Operation)[keyof typeof Operation];

export const RuleType = {
  ONCE: 'ONCE',
  RECURRENT: 'RECURRENT',
  SPECIFIC: 'SPECIFIC',
} as const;
export type RuleType = (typeof RuleType)[keyof typeof RuleType];

export const ResultType = {
  COMMAND: 'COMMAND',
  NOTIFICATION: 'NOTIFICATION',
} as const;
export type ResultType = (typeof ResultType)[keyof typeof ResultType];

export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'PUSH',
  TELEGRAM: 'TELEGRAM',
  WEBHOOK: 'WEBHOOK',
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const ScheduleFrequency = {
  ONCE: 'ONCE',
  DAILY: 'DAILY',
  CUSTOM: 'CUSTOM',
} as const;
export type ScheduleFrequency =
  (typeof ScheduleFrequency)[keyof typeof ScheduleFrequency];

export const ScheduleDays = {
  SUNDAY: 'SUNDAY',
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
} as const;
export type ScheduleDays = (typeof ScheduleDays)[keyof typeof ScheduleDays];
