import { evaluateCondition } from './evaluate-condition';
import { evaluateRule } from './evaluate-rule';
import { buildCommandUnified } from './build-command';
import { buildJobTiming } from './cron-from-schedule';
import { isStale, isInactive, isFresh, isActiveValue, parseForSeconds } from './watchdog';
import { Operation, ScheduleFrequency, ScheduleDays } from './enums';

describe('evaluateCondition', () => {
  const cond = (operation: Operation, value: any) => ({ operation, data: { value } });

  it('returns false for null/undefined incoming value', () => {
    expect(evaluateCondition(cond(Operation.EQ, 1), undefined)).toBe(false);
    expect(evaluateCondition(cond(Operation.EQ, 1), null)).toBe(false);
  });

  it('EQ / GT / GTE / LT / LTE', () => {
    expect(evaluateCondition(cond(Operation.EQ, 5), 5)).toBe(true);
    expect(evaluateCondition(cond(Operation.GT, 5), 6)).toBe(true);
    expect(evaluateCondition(cond(Operation.GT, 5), 5)).toBe(false);
    expect(evaluateCondition(cond(Operation.GTE, 5), 5)).toBe(true);
    expect(evaluateCondition(cond(Operation.LT, 5), 4)).toBe(true);
    expect(evaluateCondition(cond(Operation.LTE, 5), 5)).toBe(true);
  });

  it('coerces a numeric string target when the incoming value is a number', () => {
    expect(evaluateCondition(cond(Operation.EQ, '10.6'), 10.6)).toBe(true);
    expect(evaluateCondition(cond(Operation.GT, '10'), 11)).toBe(true);
  });

  it('absence operators are not handled here (return false)', () => {
    expect(evaluateCondition(cond(Operation.STALE, 30), 1)).toBe(false);
    expect(evaluateCondition(cond(Operation.INACTIVE, 30), 1)).toBe(false);
  });
});

describe('evaluateRule', () => {
  const c = (device_id: string, attribute: string, value: any) => ({
    id: `${device_id}-${attribute}`,
    device_id,
    attribute,
    operation: Operation.EQ,
    data: { value },
  });

  it('no conditions → true', () => {
    expect(evaluateRule({ all: true, conditions: [] }, 'd1', {})).toBe(true);
  });

  it('OR mode: any current-device condition matches', () => {
    const rule = { all: false, conditions: [c('d1', 'a', 1), c('d1', 'b', 2)] };
    expect(evaluateRule(rule, 'd1', { a: 1, b: 99 })).toBe(true);
    expect(evaluateRule(rule, 'd1', { a: 9, b: 9 })).toBe(false);
  });

  it('AND mode: current-device conditions must all pass', () => {
    const rule = { all: true, conditions: [c('d1', 'a', 1), c('d1', 'b', 2)] };
    expect(evaluateRule(rule, 'd1', { a: 1, b: 2 })).toBe(true);
    expect(evaluateRule(rule, 'd1', { a: 1, b: 9 })).toBe(false);
  });

  it('AND mode: cross-device conditions use supplied otherDevicesData', () => {
    const rule = { all: true, conditions: [c('d1', 'a', 1), c('d2', 'x', 7)] };
    const others = new Map([['d2', { x: 7 }]]);
    expect(evaluateRule(rule, 'd1', { a: 1 }, others)).toBe(true);
    expect(evaluateRule(rule, 'd1', { a: 1 }, new Map([['d2', { x: 0 }]]))).toBe(false);
    // missing data for a referenced device fails the rule
    expect(evaluateRule(rule, 'd1', { a: 1 }, new Map())).toBe(false);
  });
});

describe('buildCommandUnified', () => {
  it('wraps attribute + data.value', () => {
    expect(buildCommandUnified({ attribute: 'state', data: { value: 'ON' } })).toEqual({
      state: 'ON',
    });
  });
  it('returns data verbatim when no attribute', () => {
    expect(buildCommandUnified({ attribute: null, data: { brightness: 50 } })).toEqual({
      brightness: 50,
    });
  });
});

describe('buildJobTiming', () => {
  const now = new Date(Date.UTC(2026, 5, 25, 12, 0, 0));

  it('ONCE in the future → delayMs', () => {
    const date = new Date(now.getTime() + 60_000);
    expect(buildJobTiming({ frequency: ScheduleFrequency.ONCE, date, days: [] }, now)).toEqual({
      kind: 'once',
      delayMs: 60_000,
    });
  });

  it('ONCE in the past → invalid', () => {
    const date = new Date(now.getTime() - 60_000);
    expect(
      buildJobTiming({ frequency: ScheduleFrequency.ONCE, date, days: [] }, now).kind,
    ).toBe('invalid');
  });

  it('DAILY → UTC cron pattern', () => {
    const date = new Date(Date.UTC(2026, 5, 25, 8, 30, 0));
    expect(buildJobTiming({ frequency: ScheduleFrequency.DAILY, date, days: [] }, now)).toEqual({
      kind: 'repeat',
      pattern: '30 8 * * *',
      tz: 'UTC',
    });
  });

  it('CUSTOM → weekday cron pattern (sorted)', () => {
    const date = new Date(Date.UTC(2026, 5, 25, 8, 30, 0));
    const days = [ScheduleDays.FRIDAY, ScheduleDays.MONDAY];
    expect(buildJobTiming({ frequency: ScheduleFrequency.CUSTOM, date, days }, now)).toEqual({
      kind: 'repeat',
      pattern: '30 8 * * 1,5',
      tz: 'UTC',
    });
  });
});

describe('watchdog helpers', () => {
  it('isStale / isInactive threshold', () => {
    const now = 1_000_000;
    expect(isStale(now, now - 40_000, 30_000)).toBe(true);
    expect(isStale(now, now - 20_000, 30_000)).toBe(false);
    expect(isInactive(now, now - 40_000, 30_000)).toBe(true);
  });

  it('isFresh re-arms only after recovery past the last alert', () => {
    expect(isFresh(null, 500)).toBe(true); // never alerted
    expect(isFresh(1000, 1500)).toBe(true); // recovered after alert
    expect(isFresh(1000, 800)).toBe(false); // no recovery since alert
  });

  it('isActiveValue matches target and canonical tokens', () => {
    expect(isActiveValue('ON', true)).toBe(true);
    expect(isActiveValue('detected')).toBe(true);
    expect(isActiveValue('off')).toBe(false);
    expect(isActiveValue('closed', 'open')).toBe(false);
  });

  it('parseForSeconds validates', () => {
    expect(parseForSeconds({ forSeconds: 30 })).toBe(30);
    expect(parseForSeconds({ forSeconds: 0 })).toBeNull();
    expect(parseForSeconds({})).toBeNull();
  });
});
