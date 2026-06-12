// Pure helpers for the on-device scheduler some WiFi firmwares publish as a
// `schedule` array: [{id, days, time, action, enabled}, ...]. `days` is a
// 7-bit day-of-week bitmask (127 = every day). No JSX here, mirroring format.ts.

/** One firmware schedule rule (e.g. ESP32 relay on-board scheduler). */
export interface ScheduleEntry {
  id?: number;
  /** 7-bit day-of-week bitmask; 127 = every day. */
  days: number;
  /** "HH:mm" (24h), zero-padded after normalization. */
  time: string;
  /** Opaque action label, e.g. "ON"/"OFF". */
  action: string;
  enabled: boolean;
}

/**
 * Bit order of the `days` bitmask. Index = bit position, value = JS
 * `Date.getDay()` day (0=Sun..6=Sat). The firmware's bit order is unconfirmed;
 * if it turns out to be bit0=Monday, flip ONLY this constant to
 * [1, 2, 3, 4, 5, 6, 0] — every mask below derives from it.
 */
const BIT_TO_JS_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** Short day names indexed by JS `Date.getDay()`. */
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Mon-first ordering for display, as JS days. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const EVERY_DAY = 0b1111111;

const maskForJsDays = (jsDays: number[]): number =>
  jsDays.reduce((mask, d) => mask | (1 << BIT_TO_JS_DAY.indexOf(d)), 0);

const WEEKDAYS_MASK = maskForJsDays([1, 2, 3, 4, 5]);
const WEEKEND_MASK = maskForJsDays([0, 6]);

const hasJsDay = (mask: number, jsDay: number): boolean =>
  (mask & (1 << BIT_TO_JS_DAY.indexOf(jsDay))) !== 0;

/** Human label for a days bitmask: "Every day", "Weekdays", "Mon, Wed, Fri"… */
export function formatScheduleDays(mask: number): string {
  const m = mask & EVERY_DAY;
  if (m === EVERY_DAY) return 'Every day';
  if (m === WEEKDAYS_MASK) return 'Weekdays';
  if (m === WEEKEND_MASK) return 'Weekends';
  if (m === 0) return 'Never';
  return DISPLAY_ORDER.filter((d) => hasJsDay(m, d))
    .map((d) => DAY_SHORT[d])
    .join(', ');
}

const TIME_RE = /^\d{1,2}:\d{2}$/;

const padTime = (time: string): string =>
  time.length === 4 ? `0${time}` : time;

function normalizeEntry(raw: unknown): ScheduleEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const e = raw as Record<string, unknown>;
  if (typeof e.time !== 'string' || !TIME_RE.test(e.time)) return null;
  return {
    id: typeof e.id === 'number' ? e.id : undefined,
    days: Number(e.days) || 0,
    time: padTime(e.time),
    action: String(e.action ?? ''),
    enabled: e.enabled !== false,
  };
}

/**
 * Parse a device `schedule` value into normalized entries sorted by time.
 * Accepts an array or a JSON string (HA `text` components may publish text).
 * Returns [] for an empty schedule, and null when the value isn't
 * schedule-shaped at all (caller falls back to a generic display).
 */
export function parseScheduleValue(value: unknown): ScheduleEntry[] | null {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('[')) return null;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  const entries = raw
    .map(normalizeEntry)
    .filter((e): e is ScheduleEntry => e !== null);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Earliest upcoming occurrence among enabled entries, scanning today..+7 days.
 * Null when nothing is scheduled (no enabled entries, or all masks are 0).
 */
export function nextScheduleOccurrence(
  entries: ScheduleEntry[],
  now: Date = new Date(),
): { entry: ScheduleEntry; date: Date } | null {
  let best: { entry: ScheduleEntry; date: Date } | null = null;
  for (const entry of entries) {
    if (!entry.enabled) continue;
    const [hours, minutes] = entry.time.split(':').map(Number);
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(hours, minutes, 0, 0);
      if (candidate <= now) continue;
      if (!hasJsDay(entry.days, candidate.getDay())) continue;
      if (!best || candidate < best.date) best = { entry, date: candidate };
      break;
    }
  }
  return best;
}

/** "ON 19:00" (today) / "ON 05:00 tmrw" / "ON Mon 05:00". */
export function formatNextOccurrence(
  occ: { entry: ScheduleEntry; date: Date },
  now: Date = new Date(),
): string {
  const { entry, date } = occ;
  if (date.toDateString() === now.toDateString()) {
    return `${entry.action} ${entry.time}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return `${entry.action} ${entry.time} tmrw`;
  }
  return `${entry.action} ${DAY_SHORT[date.getDay()]} ${entry.time}`;
}
