import { ScheduleDays, ScheduleFrequency } from './enums';

export interface ScheduleTiming {
  frequency: ScheduleFrequency;
  date: Date | null;
  days: ScheduleDays[];
}

export type JobTiming =
  | { kind: 'once'; delayMs: number }
  | { kind: 'repeat'; pattern: string; tz: string }
  | { kind: 'invalid'; reason: string };

const DOW_MAP: Record<string, number> = {
  [ScheduleDays.SUNDAY]: 0,
  [ScheduleDays.MONDAY]: 1,
  [ScheduleDays.TUESDAY]: 2,
  [ScheduleDays.WEDNESDAY]: 3,
  [ScheduleDays.THURSDAY]: 4,
  [ScheduleDays.FRIDAY]: 5,
  [ScheduleDays.SATURDAY]: 6,
};

export function buildJobTiming(
  schedule: ScheduleTiming,
  now: Date = new Date(),
): JobTiming {
  if (!schedule.date) {
    return { kind: 'invalid', reason: 'schedule has no date' };
  }

  if (schedule.frequency === ScheduleFrequency.ONCE) {
    const delayMs = schedule.date.getTime() - now.getTime();
    if (delayMs <= 0) {
      return { kind: 'invalid', reason: 'ONCE schedule date is in the past' };
    }
    return { kind: 'once', delayMs };
  }

  // The schedule date is stored as UTC. Use UTC HH:MM and tz=UTC for cron.
  // The UI converts to the user's local zone for display.
  const minute = schedule.date.getUTCMinutes();
  const hour = schedule.date.getUTCHours();

  if (schedule.frequency === ScheduleFrequency.DAILY) {
    return { kind: 'repeat', pattern: `${minute} ${hour} * * *`, tz: 'UTC' };
  }

  if (schedule.frequency === ScheduleFrequency.CUSTOM) {
    if (!schedule.days || schedule.days.length === 0) {
      return { kind: 'invalid', reason: 'CUSTOM schedule has no days' };
    }
    const dows = schedule.days
      .map((d) => DOW_MAP[d])
      .filter((d) => d !== undefined)
      .sort((a, b) => a - b)
      .join(',');
    return {
      kind: 'repeat',
      pattern: `${minute} ${hour} * * ${dows}`,
      tz: 'UTC',
    };
  }

  return {
    kind: 'invalid',
    reason: `unknown frequency: ${schedule.frequency}`,
  };
}
