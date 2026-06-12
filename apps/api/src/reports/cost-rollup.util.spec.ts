import { rollupCostSeries } from './cost-rollup.util';

const H = 3_600_000;
const day1 = Date.UTC(2026, 5, 10, 0, 0, 0);

const prices = (entries: [number, number][], fallback: number[] = []) => ({
  priceByHour: new Map(entries),
  fallbackHours: new Set(fallback),
});

describe('rollupCostSeries', () => {
  it('multiplies hourly energy by the hourly price', () => {
    const rows = [
      { bucket: new Date(day1), energy: 1 },
      { bucket: new Date(day1 + H), energy: 2 },
    ];
    const { points, totals } = rollupCostSeries(
      rows,
      prices([
        [day1, 0.1],
        [day1 + H, 0.2],
      ]),
      'hour',
    );
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      bucket: new Date(day1).toISOString(),
      energy_kwh: 1,
      price_kwh: 0.1,
      cost: 0.1,
    });
    expect(points[1].cost).toBeCloseTo(0.4, 10);
    expect(totals.energy_kwh).toBeCloseTo(3, 10);
    expect(totals.cost).toBeCloseTo(0.5, 10);
    expect(totals.priced_hours).toBe(2);
    expect(totals.fallback_hours).toBe(0);
  });

  it('rolls hours up into UTC days with a weighted average price', () => {
    const rows = [
      { bucket: new Date(day1), energy: 1 }, // 1 kWh @ 0.10
      { bucket: new Date(day1 + 5 * H), energy: 3 }, // 3 kWh @ 0.20
      { bucket: new Date(day1 + 25 * H), energy: 2 }, // next day, 2 kWh @ 0.30
    ];
    const { points, totals } = rollupCostSeries(
      rows,
      prices([
        [day1, 0.1],
        [day1 + 5 * H, 0.2],
        [day1 + 25 * H, 0.3],
      ]),
      'day',
    );
    expect(points).toHaveLength(2);
    expect(points[0].bucket).toBe(new Date(day1).toISOString());
    expect(points[0].energy_kwh).toBeCloseTo(4, 10);
    expect(points[0].cost).toBeCloseTo(0.7, 10);
    // weighted: 0.70 / 4 kWh
    expect(points[0].price_kwh).toBeCloseTo(0.175, 10);
    expect(points[1].cost).toBeCloseTo(0.6, 10);
    expect(totals.cost).toBeCloseTo(1.3, 10);
  });

  it('counts fallback hours separately and still costs them', () => {
    const rows = [
      { bucket: new Date(day1), energy: 1 },
      { bucket: new Date(day1 + H), energy: 1 },
    ];
    const { totals } = rollupCostSeries(
      rows,
      prices(
        [
          [day1, 0.2],
          [day1 + H, 0.05], // kwh_price fallback
        ],
        [day1 + H],
      ),
      'hour',
    );
    expect(totals.cost).toBeCloseTo(0.25, 10);
    expect(totals.priced_hours).toBe(1);
    expect(totals.fallback_hours).toBe(1);
  });

  it('treats hours missing from the price map as zero-cost fallback', () => {
    const rows = [{ bucket: new Date(day1), energy: 2 }];
    const { points, totals } = rollupCostSeries(rows, prices([]), 'hour');
    expect(points[0].cost).toBe(0);
    expect(totals.fallback_hours).toBe(1);
  });

  it('reports null price for buckets without consumption', () => {
    const rows = [{ bucket: new Date(day1), energy: 0 }];
    const { points } = rollupCostSeries(rows, prices([[day1, 0.1]]), 'day');
    expect(points[0].price_kwh).toBeNull();
    expect(points[0].cost).toBe(0);
  });

  it('returns empty series for no rows', () => {
    const { points, totals } = rollupCostSeries([], prices([]), 'day');
    expect(points).toEqual([]);
    expect(totals).toEqual({ energy_kwh: 0, cost: 0, priced_hours: 0, fallback_hours: 0 });
  });
});
