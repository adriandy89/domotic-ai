import { ScheduleDays, ScheduleFrequency } from './enums';

export interface ScheduleTiming {
  frequency: ScheduleFrequency;
  date: Date | null;
  days: ScheduleDays[];
  /**
   * The home's IANA timezone (e.g. "Europe/Madrid"). Recurring schedules fire at
   * the chosen LOCAL wall-clock time, so the cron is anchored to this zone — not
   * UTC — which keeps a "daily at 08:00" from drifting ±1h across DST. Missing or
   * invalid → UTC fallback (legacy behaviour).
   */
  timezone?: string | null;
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

/**
 * The stored `date` is an absolute instant that encodes the chosen local time.
 * Render its wall-clock HH:MM in `timezone` (full ICU via Intl, like the rule
 * execution-window gate) so the recurring cron reflects the intended local time.
 * Falls back to the UTC wall time when the timezone is missing or invalid.
 */
function wallClock(
  date: Date,
  timezone: string | null | undefined,
): { hour: number; minute: number; tz: string } {
  const tz = timezone || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? '';
    // hour12:false can emit "24" at midnight on some ICU versions → normalize.
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    if (Number.isNaN(hour) || Number.isNaN(minute)) throw new Error('NaN');
    return { hour, minute, tz };
  } catch {
    // Invalid timezone string → UTC wall time.
    return {
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      tz: 'UTC',
    };
  }
}

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

  // Recurring: anchor the cron to the home's local wall time (DST-stable).
  const { hour, minute, tz } = wallClock(schedule.date, schedule.timezone);

  if (schedule.frequency === ScheduleFrequency.DAILY) {
    return { kind: 'repeat', pattern: `${minute} ${hour} * * *`, tz };
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
      tz,
    };
  }

  return {
    kind: 'invalid',
    reason: `unknown frequency: ${schedule.frequency}`,
  };
}
