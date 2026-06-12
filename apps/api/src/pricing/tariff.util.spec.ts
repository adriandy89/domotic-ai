import { resolveHourlyPrice } from './tariff.util';

// 2026-06-09 is a Tuesday; Europe/Madrid is UTC+2 (CEST) on that date.
const tueUtc = (hour: number) => new Date(Date.UTC(2026, 5, 9, hour, 0, 0));
// 2026-06-13 is a Saturday.
const satUtc = (hour: number) => new Date(Date.UTC(2026, 5, 13, hour, 0, 0));

const spanish20TD = {
  tariff_type: 'TOU' as const,
  kwh_price: 0.05,
  tariff_config: {
    timezone: 'Europe/Madrid',
    default_price: 0.1,
    periods: [
      {
        label: 'P1 mañana',
        days: [1, 2, 3, 4, 5],
        start: '10:00',
        end: '14:00',
        price: 0.2,
      },
      {
        label: 'P1 tarde',
        days: [1, 2, 3, 4, 5],
        start: '18:00',
        end: '22:00',
        price: 0.2,
      },
      {
        label: 'P2',
        days: [1, 2, 3, 4, 5],
        start: '08:00',
        end: '10:00',
        price: 0.15,
      },
      {
        label: 'P3 noche',
        days: [0, 1, 2, 3, 4, 5, 6],
        start: '00:00',
        end: '08:00',
        price: 0.08,
      },
    ],
  },
};

describe('resolveHourlyPrice', () => {
  it('returns kwh_price for FIXED homes', () => {
    const home = {
      tariff_type: 'FIXED' as const,
      kwh_price: 0.1234,
      tariff_config: null,
    };
    expect(resolveHourlyPrice(home, tueUtc(10))).toBe(0.1234);
  });

  it('prices a weekday peak hour with the matching TOU period', () => {
    // 09:00 UTC = 11:00 Madrid → P1 (10:00-14:00)
    expect(resolveHourlyPrice(spanish20TD, tueUtc(9))).toBe(0.2);
  });

  it('treats period start as inclusive and end as exclusive', () => {
    // 08:00 UTC = 10:00 Madrid → P1 starts exactly at 10:00
    expect(resolveHourlyPrice(spanish20TD, tueUtc(8))).toBe(0.2);
    // 12:00 UTC = 14:00 Madrid → P1 ended (exclusive); no period covers 14-18 → default
    expect(resolveHourlyPrice(spanish20TD, tueUtc(12))).toBe(0.1);
  });

  it('falls back to default_price on uncovered weekend hours', () => {
    // Saturday 09:00 UTC = 11:00 Madrid → weekday periods don't apply
    expect(resolveHourlyPrice(spanish20TD, satUtc(9))).toBe(0.1);
  });

  it('matches all-days periods on weekends', () => {
    // Saturday 01:00 UTC = 03:00 Madrid → P3 noche (00:00-08:00, all days)
    expect(resolveHourlyPrice(spanish20TD, satUtc(1))).toBe(0.08);
  });

  it('falls back to kwh_price when no period matches and no default_price', () => {
    const home = {
      tariff_type: 'TOU' as const,
      kwh_price: 0.0567,
      tariff_config: {
        timezone: 'Europe/Madrid',
        periods: [
          { label: 'P1', days: [1], start: '10:00', end: '14:00', price: 0.2 },
        ],
      },
    };
    expect(resolveHourlyPrice(home, satUtc(9))).toBe(0.0567);
  });

  it('handles periods that wrap past midnight', () => {
    const home = {
      tariff_type: 'TOU' as const,
      kwh_price: 0.05,
      tariff_config: {
        timezone: 'Europe/Madrid',
        default_price: 0.15,
        periods: [
          {
            label: 'Valle nocturno',
            days: [0, 1, 2, 3, 4, 5, 6],
            start: '22:00',
            end: '08:00',
            price: 0.07,
          },
        ],
      },
    };
    // 21:00 UTC Tue = 23:00 Madrid → inside wrap
    expect(resolveHourlyPrice(home, tueUtc(21))).toBe(0.07);
    // 01:00 UTC Tue = 03:00 Madrid → inside wrap
    expect(resolveHourlyPrice(home, tueUtc(1))).toBe(0.07);
    // 10:00 UTC Tue = 12:00 Madrid → outside
    expect(resolveHourlyPrice(home, tueUtc(10))).toBe(0.15);
  });

  it('first matching period wins on overlap', () => {
    const home = {
      tariff_type: 'TOU' as const,
      kwh_price: 0.05,
      tariff_config: {
        timezone: 'Europe/Madrid',
        periods: [
          { label: 'A', days: [2], start: '10:00', end: '14:00', price: 0.3 },
          { label: 'B', days: [2], start: '10:00', end: '14:00', price: 0.2 },
        ],
      },
    };
    expect(resolveHourlyPrice(home, tueUtc(9))).toBe(0.3);
  });

  it('resolves local time correctly across the spring DST jump', () => {
    // Europe/Madrid 2026-03-29: clocks jump 02:00 → 03:00 (01:00 UTC).
    // 01:00 UTC = 03:00 CEST → night period
    const home = {
      tariff_type: 'TOU' as const,
      kwh_price: 0.05,
      tariff_config: {
        timezone: 'Europe/Madrid',
        default_price: 0.15,
        periods: [
          {
            label: 'Noche',
            days: [0, 1, 2, 3, 4, 5, 6],
            start: '00:00',
            end: '08:00',
            price: 0.08,
          },
        ],
      },
    };
    expect(
      resolveHourlyPrice(home, new Date(Date.UTC(2026, 2, 29, 1, 0, 0))),
    ).toBe(0.08);
    // 07:00 UTC = 09:00 CEST → outside the night period despite being 08:00 in winter offset
    expect(
      resolveHourlyPrice(home, new Date(Date.UTC(2026, 2, 29, 7, 0, 0))),
    ).toBe(0.15);
  });

  it('defaults TOU timezone to Europe/Madrid when missing', () => {
    const home = {
      tariff_type: 'TOU' as const,
      kwh_price: 0.05,
      tariff_config: {
        periods: [
          { label: 'P1', days: [2], start: '10:00', end: '14:00', price: 0.2 },
        ],
      },
    };
    expect(resolveHourlyPrice(home, tueUtc(9))).toBe(0.2);
  });

  it('falls back to kwh_price for TOU homes with malformed config', () => {
    const home = {
      tariff_type: 'TOU' as const,
      kwh_price: 0.11,
      tariff_config: null,
    };
    expect(resolveHourlyPrice(home, tueUtc(9))).toBe(0.11);
  });
});
