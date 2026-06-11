import { CostSeriesPointDto, CostSeriesTotalsDto } from '@app/models';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface HourlyEnergyRow {
  /** Hour start (UTC) from `sensor_hourly`. */
  bucket: Date;
  /** Consumption in the hour (kWh), i.e. `energy_max - energy_min`. */
  energy: number;
}

export interface HourlyPriceLookup {
  /** Hour start (epoch ms, UTC) → price in currency/kWh. */
  priceByHour: Map<number, number>;
  /** Hours priced with the kwh_price fallback. */
  fallbackHours: Set<number>;
}

/**
 * Costing always happens at hourly resolution (prices vary within a day);
 * `bucket='day'` only changes the rollup of the already-priced hours. Days
 * are UTC days, matching the `sensor_daily` continuous aggregate.
 */
export function rollupCostSeries(
  rows: HourlyEnergyRow[],
  prices: HourlyPriceLookup,
  bucket: 'hour' | 'day',
): { points: CostSeriesPointDto[]; totals: CostSeriesTotalsDto } {
  const grouped = new Map<number, { energy: number; cost: number }>();
  const totals = { energy_kwh: 0, cost: 0, priced_hours: 0, fallback_hours: 0 };

  for (const row of rows) {
    const hour = Math.floor(row.bucket.getTime() / HOUR_MS) * HOUR_MS;
    const price = prices.priceByHour.get(hour);
    const isFallback = price == null || prices.fallbackHours.has(hour);
    const cost = row.energy * (price ?? 0);

    if (isFallback) totals.fallback_hours += 1;
    else totals.priced_hours += 1;
    totals.energy_kwh += row.energy;
    totals.cost += cost;

    const key = bucket === 'day' ? Math.floor(hour / DAY_MS) * DAY_MS : hour;
    const entry = grouped.get(key) ?? { energy: 0, cost: 0 };
    entry.energy += row.energy;
    entry.cost += cost;
    grouped.set(key, entry);
  }

  const points: CostSeriesPointDto[] = [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, entry]) => ({
      bucket: new Date(key).toISOString(),
      energy_kwh: round6(entry.energy),
      price_kwh: entry.energy > 0 ? round6(entry.cost / entry.energy) : null,
      cost: round6(entry.cost),
    }));

  return {
    points,
    totals: {
      energy_kwh: round6(totals.energy_kwh),
      cost: round6(totals.cost),
      priced_hours: totals.priced_hours,
      fallback_hours: totals.fallback_hours,
    },
  };
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
