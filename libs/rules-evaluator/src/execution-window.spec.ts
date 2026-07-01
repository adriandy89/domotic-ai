import { isWithinExecutionWindow } from './execution-window';
import { ExecutionWindow } from './types';
import { ScheduleDays } from './enums';

/**
 * Pure "when to execute" gate — exhaustive coverage.
 *
 * `now` is constructed as an absolute UTC instant; the gate resolves the local
 * wall-clock day/time in the given timezone. Tests pick instants whose UTC and
 * Madrid (UTC+2 in June, DST) wall clocks differ, to prove timezone handling.
 */

const base: ExecutionWindow = {
  window_active: true,
  window_days: [],
  window_all_day: true,
  window_start: null,
  window_end: null,
};

// 2026-06-25 is a Thursday.
const utc = (h: number, m = 0) =>
  new Date(Date.UTC(2026, 5, 25, h, m, 0)); // month is 0-based → 5 = June

describe('isWithinExecutionWindow', () => {
  it('returns true when the window is inactive (default behaviour)', () => {
    expect(
      isWithinExecutionWindow({ ...base, window_active: false }, utc(3), 'UTC'),
    ).toBe(true);
  });

  it('active + all day + no days = always allowed', () => {
    expect(isWithinExecutionWindow(base, utc(3), 'UTC')).toBe(true);
    expect(isWithinExecutionWindow(base, utc(23), 'UTC')).toBe(true);
  });

  describe('day gate', () => {
    it('allows when the current weekday is selected', () => {
      const w = { ...base, window_days: [ScheduleDays.THURSDAY] };
      expect(isWithinExecutionWindow(w, utc(12), 'UTC')).toBe(true);
    });
    it('blocks when the current weekday is not selected', () => {
      const w = { ...base, window_days: [ScheduleDays.MONDAY, ScheduleDays.FRIDAY] };
      expect(isWithinExecutionWindow(w, utc(12), 'UTC')).toBe(false);
    });
    it('respects the timezone when resolving the weekday', () => {
      // 2026-06-25 23:30 UTC is already Friday 01:30 in Madrid (UTC+2).
      const w = { ...base, window_days: [ScheduleDays.FRIDAY] };
      expect(isWithinExecutionWindow(w, utc(23, 30), 'Europe/Madrid')).toBe(true);
      expect(isWithinExecutionWindow(w, utc(23, 30), 'UTC')).toBe(false); // still Thursday in UTC
    });
  });

  describe('same-day time range (08:00-19:30)', () => {
    const w = {
      ...base,
      window_all_day: false,
      window_start: 8 * 60, // 480
      window_end: 19 * 60 + 30, // 1170
    };
    it('inside the range', () => {
      expect(isWithinExecutionWindow(w, utc(10), 'UTC')).toBe(true);
    });
    it('start boundary is inclusive', () => {
      expect(isWithinExecutionWindow(w, utc(8, 0), 'UTC')).toBe(true);
    });
    it('end boundary is exclusive', () => {
      expect(isWithinExecutionWindow(w, utc(19, 30), 'UTC')).toBe(false);
    });
    it('before and after the range', () => {
      expect(isWithinExecutionWindow(w, utc(7, 59), 'UTC')).toBe(false);
      expect(isWithinExecutionWindow(w, utc(20), 'UTC')).toBe(false);
    });
    it('evaluated in the home timezone, not UTC', () => {
      // 07:00 UTC = 09:00 Madrid → inside; same instant is outside in UTC.
      expect(isWithinExecutionWindow(w, utc(7), 'Europe/Madrid')).toBe(true);
      expect(isWithinExecutionWindow(w, utc(7), 'UTC')).toBe(false);
    });
  });

  describe('overnight range (22:00-06:00)', () => {
    const w = {
      ...base,
      window_all_day: false,
      window_start: 22 * 60, // 1320
      window_end: 6 * 60, // 360
    };
    it('inside late evening', () => {
      expect(isWithinExecutionWindow(w, utc(23), 'UTC')).toBe(true);
    });
    it('inside early morning', () => {
      expect(isWithinExecutionWindow(w, utc(0, 30), 'UTC')).toBe(true);
      expect(isWithinExecutionWindow(w, utc(5, 59), 'UTC')).toBe(true);
    });
    it('outside during the day', () => {
      expect(isWithinExecutionWindow(w, utc(12), 'UTC')).toBe(false);
      expect(isWithinExecutionWindow(w, utc(6, 0), 'UTC')).toBe(false); // end exclusive
    });
  });

  it('null timezone falls back to UTC', () => {
    const w = { ...base, window_all_day: false, window_start: 8 * 60, window_end: 18 * 60 };
    expect(isWithinExecutionWindow(w, utc(10), null)).toBe(true);
    expect(isWithinExecutionWindow(w, utc(20), null)).toBe(false);
  });

  it('invalid timezone falls back to UTC instead of throwing', () => {
    const w = { ...base, window_all_day: false, window_start: 8 * 60, window_end: 18 * 60 };
    expect(isWithinExecutionWindow(w, utc(10), 'Not/AZone')).toBe(true);
  });

  it('zero-length window never matches', () => {
    const w = { ...base, window_all_day: false, window_start: 600, window_end: 600 };
    expect(isWithinExecutionWindow(w, utc(10), 'UTC')).toBe(false);
  });

  it('combines day + time gates', () => {
    const w = {
      ...base,
      window_days: [ScheduleDays.THURSDAY],
      window_all_day: false,
      window_start: 8 * 60,
      window_end: 18 * 60,
    };
    expect(isWithinExecutionWindow(w, utc(10), 'UTC')).toBe(true); // Thu + inside
    expect(isWithinExecutionWindow(w, utc(20), 'UTC')).toBe(false); // Thu but outside time
  });
});
