import { RawPricePoint } from './providers/price-provider.interface';
import {
  addDays,
  groupPointsToHourly,
  isoDay,
  zonedDayStartUtc,
} from './time.util';

describe('zonedDayStartUtc', () => {
  it('resolves Madrid midnight in summer (UTC+2)', () => {
    expect(zonedDayStartUtc('2026-06-11', 'Europe/Madrid').toISOString()).toBe(
      '2026-06-10T22:00:00.000Z',
    );
  });

  it('resolves Madrid midnight in winter (UTC+1)', () => {
    expect(zonedDayStartUtc('2026-01-15', 'Europe/Madrid').toISOString()).toBe(
      '2026-01-14T23:00:00.000Z',
    );
  });

  it('resolves the 23-hour spring DST day correctly', () => {
    // 2026-03-29: Madrid jumps 02:00 → 03:00; the civil day starts at 23:00Z previous day
    const start = zonedDayStartUtc('2026-03-29', 'Europe/Madrid');
    const next = zonedDayStartUtc('2026-03-30', 'Europe/Madrid');
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect((next.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});

describe('isoDay / addDays', () => {
  it('formats and offsets civil days', () => {
    expect(isoDay(new Date('2026-06-11T05:00:00Z'), 'Europe/Madrid')).toBe(
      '2026-06-11',
    );
    // 23:30 Madrid summer = 21:30Z same day; local day is still the 11th
    expect(isoDay(new Date('2026-06-11T21:30:00Z'), 'Europe/Madrid')).toBe(
      '2026-06-11',
    );
    // 22:30Z = 00:30 Madrid next day
    expect(isoDay(new Date('2026-06-11T22:30:00Z'), 'Europe/Madrid')).toBe(
      '2026-06-12',
    );
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('groupPointsToHourly', () => {
  const quarter = (iso: string, price: number): RawPricePoint => ({
    ts: new Date(iso),
    durationMin: 15,
    priceKwh: price,
    currency: 'EUR',
  });

  it('averages quarter-hour points into their UTC hour', () => {
    const points = [
      quarter('2026-06-10T22:00:00Z', 0.1),
      quarter('2026-06-10T22:15:00Z', 0.2),
      quarter('2026-06-10T22:30:00Z', 0.3),
      quarter('2026-06-10T22:45:00Z', 0.4),
      quarter('2026-06-10T23:00:00Z', 0.08),
      quarter('2026-06-10T23:15:00Z', 0.08),
      quarter('2026-06-10T23:30:00Z', 0.08),
      quarter('2026-06-10T23:45:00Z', 0.12),
    ];
    const hourly = groupPointsToHourly(points);
    expect(hourly).toHaveLength(2);
    expect(hourly[0].ts.toISOString()).toBe('2026-06-10T22:00:00.000Z');
    expect(hourly[0].priceKwh).toBeCloseTo(0.25, 10);
    expect(hourly[1].ts.toISOString()).toBe('2026-06-10T23:00:00.000Z');
    expect(hourly[1].priceKwh).toBeCloseTo(0.09, 10);
    expect(hourly[0].currency).toBe('EUR');
  });

  it('passes hourly points through unchanged', () => {
    const points: RawPricePoint[] = [
      {
        ts: new Date('2026-06-10T22:00:00Z'),
        durationMin: 60,
        priceKwh: 0.15,
        currency: 'EUR',
      },
    ];
    const hourly = groupPointsToHourly(points);
    expect(hourly).toHaveLength(1);
    expect(hourly[0].priceKwh).toBe(0.15);
  });

  it('returns hours sorted by timestamp', () => {
    const points = [
      quarter('2026-06-10T23:00:00Z', 0.2),
      quarter('2026-06-10T22:00:00Z', 0.1),
    ];
    const hourly = groupPointsToHourly(points);
    expect(hourly.map((h) => h.ts.toISOString())).toEqual([
      '2026-06-10T22:00:00.000Z',
      '2026-06-10T23:00:00.000Z',
    ]);
  });
});
