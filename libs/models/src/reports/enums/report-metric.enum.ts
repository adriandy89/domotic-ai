/**
 * Metric ids supported by the reports endpoints.
 *
 * Maps 1:1 to columns of `sensor_hourly` / `sensor_daily` aggregates.
 *  - `_avg` columns are queryable for averages over the bucket.
 *  - `_min` / `_max` are derived by taking min/max of the bucket.
 *  - `_count` is event-style (open events, motion events, ...).
 *  - `energy` is special: it's a monotonically increasing counter, so the
 *    "consumption per bucket" is `MAX - MIN` of the bucket, not SUM.
 */
export const ReportMetric = {
  // Climate (numeric, averaged)
  temperature: 'temperature',
  humidity: 'humidity',
  pressure: 'pressure',
  illuminance: 'illuminance',
  // Energy
  power: 'power', // instantaneous W (averaged)
  energy: 'energy', // accumulating kWh counter — derived
  voltage: 'voltage',
  current: 'current',
  // Activity / security (counters)
  contact_open: 'contact_open',
  occupancy: 'occupancy',
  presence: 'presence',
  motion: 'motion',
  vibration: 'vibration',
  smoke: 'smoke',
  water_leak: 'water_leak',
  tamper: 'tamper',
  action: 'action',
  // Air quality
  co2: 'co2',
  voc: 'voc',
  pm25: 'pm25',
  pm10: 'pm10',
  // Health
  battery: 'battery',
  lqi: 'lqi',
} as const;
export type ReportMetric = (typeof ReportMetric)[keyof typeof ReportMetric];

export const REPORT_METRICS: ReportMetric[] = Object.values(ReportMetric);

export const ReportBucket = {
  raw: 'raw',
  hour: 'hour',
  day: 'day',
} as const;
export type ReportBucket = (typeof ReportBucket)[keyof typeof ReportBucket];
