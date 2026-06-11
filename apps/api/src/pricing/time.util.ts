import { RawPricePoint } from './providers/price-provider.interface';

const partsCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsCache.set(timeZone, fmt);
  }
  return fmt;
}

function utcOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** UTC instant when the civil day (YYYY-MM-DD) starts in `timeZone`. */
export function zonedDayStartUtc(day: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Two passes converge even across DST transitions.
  let guess = new Date(utcMidnight);
  for (let i = 0; i < 2; i++) {
    guess = new Date(utcMidnight - utcOffsetMinutes(guess, timeZone) * 60_000);
  }
  return guess;
}

/** Civil day (YYYY-MM-DD) of a UTC instant in `timeZone`. */
export function isoDay(date: Date, timeZone: string): string {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface HourlyPrice {
  ts: Date;
  priceKwh: number;
  currency: string;
}

/**
 * Averages market points (quarter-hourly or hourly) into UTC hours. Grouping
 * by UTC hour is naturally DST-safe: 23/25-hour local days produce 23/25 rows.
 */
export function groupPointsToHourly(points: RawPricePoint[]): HourlyPrice[] {
  const buckets = new Map<
    number,
    { sum: number; count: number; currency: string }
  >();
  for (const point of points) {
    const hour = Math.floor(point.ts.getTime() / 3_600_000) * 3_600_000;
    const bucket = buckets.get(hour) ?? {
      sum: 0,
      count: 0,
      currency: point.currency,
    };
    bucket.sum += point.priceKwh;
    bucket.count += 1;
    buckets.set(hour, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, bucket]) => ({
      ts: new Date(hour),
      priceKwh: bucket.sum / bucket.count,
      currency: bucket.currency,
    }));
}
