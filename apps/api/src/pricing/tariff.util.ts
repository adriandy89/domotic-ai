import { TouPeriodDto, TouTariffConfig } from '@app/models';

export const DEFAULT_TARIFF_TIMEZONE = 'Europe/Madrid';

/** Subset of the Home row needed to price an hour without market data. */
export interface TariffHomeFields {
  tariff_type: 'FIXED' | 'TOU' | 'DYNAMIC';
  tariff_config: unknown;
  kwh_price: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timezone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      fmt = getFormatter(DEFAULT_TARIFF_TIMEZONE);
    }
    formatterCache.set(timezone, fmt);
  }
  return fmt;
}

/** Day of week (0=Sunday..6=Saturday) and minutes since local midnight. */
export function localDayAndMinutes(
  date: Date,
  timezone: string,
): { day: number; minutes: number } {
  const parts = getFormatter(timezone).formatToParts(date);
  let weekday = '';
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
  }
  return { day: WEEKDAYS.indexOf(weekday), minutes: (hour % 24) * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * `days` refer to the day the period STARTS: a 22:00-08:00 period on Monday
 * still covers Tuesday 03:00.
 */
export function matchesPeriod(
  period: TouPeriodDto,
  day: number,
  minutes: number,
): boolean {
  const start = toMinutes(period.start);
  const end = toMinutes(period.end);
  if (start < end) {
    return period.days.includes(day) && minutes >= start && minutes < end;
  }
  if (minutes >= start) return period.days.includes(day);
  if (minutes < end) return period.days.includes((day + 6) % 7);
  return false;
}

/**
 * Price (currency/kWh) for the hour starting at `hourStartUtc`, without
 * touching the database: FIXED (and DYNAMIC, whose market prices are resolved
 * by PricingService) → `kwh_price`; TOU → first matching period →
 * `default_price` → `kwh_price`.
 */
export function resolveHourlyPrice(
  home: TariffHomeFields,
  hourStartUtc: Date,
): number {
  if (home.tariff_type !== 'TOU') return home.kwh_price;
  const config = home.tariff_config as Partial<TouTariffConfig> | null;
  const periods = Array.isArray(config?.periods) ? config.periods : null;
  if (!periods?.length) return home.kwh_price;

  const timezone =
    typeof config?.timezone === 'string' && config.timezone
      ? config.timezone
      : DEFAULT_TARIFF_TIMEZONE;
  const { day, minutes } = localDayAndMinutes(hourStartUtc, timezone);

  for (const period of periods) {
    if (matchesPeriod(period, day, minutes)) return period.price;
  }
  return config?.default_price ?? home.kwh_price;
}
