import { ScheduleDays } from 'generated/prisma/client';

/**
 * Optional "when to execute" gate for a rule. A rule may only ACT (fire its
 * results) when "now" — evaluated in the home's timezone — falls within the
 * allowed weekdays and time-of-day range. This is a gate, not a trigger: the
 * rule still evaluates its conditions normally; it just won't fire outside the
 * window.
 */
export interface ExecutionWindow {
  window_active: boolean;
  window_days: ScheduleDays[];
  window_all_day: boolean;
  window_start: number | null; // minute-of-day 0..1439
  window_end: number | null; // minute-of-day 0..1439
}

const MINUTES_PER_DAY = 24 * 60;

// ScheduleDays enum -> JS getDay() index (0 = Sunday .. 6 = Saturday).
const DOW_INDEX: Record<ScheduleDays, number> = {
  [ScheduleDays.SUNDAY]: 0,
  [ScheduleDays.MONDAY]: 1,
  [ScheduleDays.TUESDAY]: 2,
  [ScheduleDays.WEDNESDAY]: 3,
  [ScheduleDays.THURSDAY]: 4,
  [ScheduleDays.FRIDAY]: 5,
  [ScheduleDays.SATURDAY]: 6,
};

// Intl weekday short name -> JS getDay() index.
const WEEKDAY_NAME_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Resolve the wall-clock weekday and minute-of-day for `now` in `timezone`.
 * Uses Intl (full ICU in Node 18+), so no extra dependency. Falls back to UTC
 * when the timezone is missing or invalid.
 */
function localParts(
  now: Date,
  timezone: string | null,
): { weekday: number; minutes: number } {
  const tz = timezone || 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    // Invalid timezone string → fall back to UTC.
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  }

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = WEEKDAY_NAME_INDEX[get('weekday')] ?? now.getUTCDay();
  // hour12:false can emit "24" at midnight on some ICU versions → normalize.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return { weekday, minutes: hour * 60 + minute };
}

/**
 * True when the rule is allowed to fire right now. Returns true when no window
 * is configured (default behaviour) so callers can gate unconditionally.
 */
export function isWithinExecutionWindow(
  w: ExecutionWindow,
  now: Date,
  timezone: string | null,
): boolean {
  if (!w.window_active) return true;

  const { weekday, minutes } = localParts(now, timezone);

  // Day gate: empty list = every day.
  const days = w.window_days ?? [];
  if (days.length > 0) {
    const allowed = days.map((d) => DOW_INDEX[d]);
    if (!allowed.includes(weekday)) return false;
  }

  // Time-of-day gate.
  if (!w.window_all_day) {
    const start = w.window_start ?? 0;
    const end = w.window_end ?? MINUTES_PER_DAY;
    if (start === end) return false; // zero-length window never matches
    if (start < end) {
      // Same-day range: [start, end).
      if (minutes < start || minutes >= end) return false;
    } else {
      // Overnight range (wraps midnight): [start, 1440) ∪ [0, end).
      if (minutes < start && minutes >= end) return false;
    }
  }

  return true;
}
