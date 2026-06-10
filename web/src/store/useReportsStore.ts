import { create } from 'zustand';
import { api } from '../lib/api';

export type ReportMetric =
  | 'temperature'
  | 'humidity'
  | 'pressure'
  | 'illuminance'
  | 'power'
  | 'energy'
  | 'voltage'
  | 'current'
  | 'contact_open'
  | 'occupancy'
  | 'presence'
  | 'motion'
  | 'vibration'
  | 'smoke'
  | 'water_leak'
  | 'tamper'
  | 'action'
  | 'co2'
  | 'voc'
  | 'pm25'
  | 'pm10'
  | 'battery'
  | 'lqi';

export type ReportBucket = 'raw' | 'hour' | 'day';

export interface SeriesPoint {
  bucket: string;
  value: number | null;
  min?: number | null;
  max?: number | null;
  count?: number | null;
}

export interface SeriesResponse {
  device_id: string;
  metric: ReportMetric;
  bucket: ReportBucket;
  from: string;
  to: string;
  points: SeriesPoint[];
  unit?: string | null;
}

export interface AggregateResponse {
  device_id: string;
  from: string;
  to: string;
  metrics: Record<string, number | null>;
}

/** One device state transition (logbook): relay OFF→ON, trigger change… */
export interface StateEvent {
  timestamp: string;
  property: string;
  prev_value: string | null;
  value: string;
}

export interface StateEventsResponse {
  device_id: string;
  from: string;
  to: string;
  events: StateEvent[];
}

/** Series for ANY numeric payload field (sensor_field_hourly/daily backed). */
export interface FieldSeriesResponse {
  device_id: string;
  field: string;
  bucket: ReportBucket;
  from: string;
  to: string;
  points: SeriesPoint[];
  unit?: string | null;
  deviceClass?: string | null;
  stateClass?: string | null;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 50;

interface ReportsState {
  series: Map<string, CacheEntry<SeriesResponse>>;
  fieldSeries: Map<string, CacheEntry<FieldSeriesResponse>>;
  stateEvents: Map<string, CacheEntry<StateEventsResponse>>;
  aggregate: Map<string, CacheEntry<AggregateResponse>>;
  loading: boolean;
  error: string | null;

  fetchSeries: (params: {
    device_id: string;
    metric: ReportMetric;
    from: Date;
    to: Date;
    bucket?: ReportBucket;
  }) => Promise<SeriesResponse | null>;

  fetchFieldSeries: (params: {
    device_id: string;
    field: string;
    from: Date;
    to: Date;
    bucket?: ReportBucket;
  }) => Promise<FieldSeriesResponse | null>;

  fetchStateEvents: (params: {
    device_id: string;
    from: Date;
    to: Date;
    field?: string;
  }) => Promise<StateEventsResponse | null>;

  fetchMultiSeries: (params: {
    device_ids: string[];
    metric: ReportMetric;
    from: Date;
    to: Date;
    bucket?: ReportBucket;
  }) => Promise<SeriesResponse[]>;

  fetchAggregate: (params: {
    device_id: string;
    from: Date;
    to: Date;
  }) => Promise<AggregateResponse | null>;

  exportCsv: (params: {
    device_id: string;
    metric: ReportMetric;
    from: Date;
    to: Date;
    bucket?: ReportBucket;
  }) => Promise<void>;

  fetchHeatmap: (params: {
    device_id: string;
    metric: ReportMetric;
    from: Date;
    to: Date;
  }) => Promise<HeatmapPoint[]>;

  fetchDevicesHealth: () => Promise<DevicesHealthResponse | null>;

  fetchAutomations: (range: {
    from: Date;
    to: Date;
  }) => Promise<AutomationsReport | null>;

  fetchAiUsage: (range: {
    from: Date;
    to: Date;
  }) => Promise<AiUsageReport | null>;

  invalidate: () => void;
}

export interface AutomationsReport {
  rule_executions_daily: {
    day: string;
    conditions_met: number;
    executed: number;
  }[];
  rule_top: { rule_id: string; name: string; executions: number }[];
  commands_by_source_daily: {
    day: string;
    api: number;
    ai: number;
    rule: number;
    schedule: number;
  }[];
  commands_top_devices: {
    device_id: string;
    name: string;
    commands: number;
  }[];
  totals: {
    rule_executions: number;
    rule_executions_failed: number;
    commands_total: number;
    commands_failed: number;
  };
}

export interface AiUsageReport {
  daily: { day: string; total_tokens: number; calls: number }[];
  by_provider: {
    provider: string;
    total_tokens: number;
    calls: number;
    avg_latency_ms: number;
  }[];
  by_model: { model: string; total_tokens: number; calls: number }[];
  totals: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    tool_calls: number;
    conversations: number;
    errors: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
  };
}

export interface HeatmapPoint {
  dayOfWeek: number;
  hour: number;
  value: number;
}

export interface DeviceHealth {
  device_id: string;
  name: string;
  battery: number | null;
  battery_trend_pct_per_day: number | null;
  lqi_avg: number | null;
  last_seen: string | null;
  uptime_pct_30d: number | null;
}

export interface DevicesHealthResponse {
  devices: DeviceHealth[];
}

function key(parts: Array<string | number>): string {
  return parts.join('|');
}

function evict<T>(map: Map<string, CacheEntry<T>>) {
  if (map.size > CACHE_MAX) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  series: new Map(),
  fieldSeries: new Map(),
  stateEvents: new Map(),
  aggregate: new Map(),
  loading: false,
  error: null,

  fetchSeries: async ({ device_id, metric, from, to, bucket = 'hour' }) => {
    const cacheKey = key([
      'series',
      device_id,
      metric,
      from.toISOString(),
      to.toISOString(),
      bucket,
    ]);
    const cached = get().series.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    set({ loading: true, error: null });
    try {
      const { data } = await api.get<SeriesResponse>('/reports/series', {
        params: {
          device_id,
          metric,
          from: from.toISOString(),
          to: to.toISOString(),
          bucket,
        },
      });
      const next = new Map(get().series);
      next.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      evict(next);
      set({ series: next, loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch series';
      set({ error: message, loading: false });
      return null;
    }
  },

  fetchFieldSeries: async ({ device_id, field, from, to, bucket = 'hour' }) => {
    const cacheKey = key([
      'fieldseries',
      device_id,
      field,
      from.toISOString(),
      to.toISOString(),
      bucket,
    ]);
    const cached = get().fieldSeries.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    set({ loading: true, error: null });
    try {
      const { data } = await api.get<FieldSeriesResponse>(
        '/reports/field-series',
        {
          params: {
            device_id,
            field,
            from: from.toISOString(),
            to: to.toISOString(),
            bucket,
          },
        },
      );
      const next = new Map(get().fieldSeries);
      next.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      evict(next);
      set({ fieldSeries: next, loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch field series';
      set({ error: message, loading: false });
      return null;
    }
  },

  fetchStateEvents: async ({ device_id, from, to, field }) => {
    const cacheKey = key([
      'stateevents',
      device_id,
      from.toISOString(),
      to.toISOString(),
      field ?? '*',
    ]);
    const cached = get().stateEvents.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    set({ loading: true, error: null });
    try {
      const { data } = await api.get<StateEventsResponse>(
        '/reports/state-events',
        {
          params: {
            device_id,
            from: from.toISOString(),
            to: to.toISOString(),
            ...(field && { field }),
          },
        },
      );
      const next = new Map(get().stateEvents);
      next.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      evict(next);
      set({ stateEvents: next, loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch state events';
      set({ error: message, loading: false });
      return null;
    }
  },

  fetchMultiSeries: async ({
    device_ids,
    metric,
    from,
    to,
    bucket = 'hour',
  }) => {
    if (device_ids.length === 0) return [];
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<{ series: SeriesResponse[] }>(
        '/reports/multi-series',
        {
          params: {
            device_ids,
            metric,
            from: from.toISOString(),
            to: to.toISOString(),
            bucket,
          },
          paramsSerializer: { indexes: null },
        },
      );
      set({ loading: false });
      return data.series ?? [];
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch multi-series';
      set({ error: message, loading: false });
      return [];
    }
  },

  fetchAggregate: async ({ device_id, from, to }) => {
    const cacheKey = key([
      'agg',
      device_id,
      from.toISOString(),
      to.toISOString(),
    ]);
    const cached = get().aggregate.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    set({ loading: true, error: null });
    try {
      const { data } = await api.get<AggregateResponse>('/reports/aggregate', {
        params: {
          device_id,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      });
      const next = new Map(get().aggregate);
      next.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      evict(next);
      set({ aggregate: next, loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch aggregate';
      set({ error: message, loading: false });
      return null;
    }
  },

  exportCsv: async ({ device_id, metric, from, to, bucket = 'hour' }) => {
    try {
      const response = await api.get('/reports/export', {
        params: {
          device_id,
          metric,
          from: from.toISOString(),
          to: to.toISOString(),
          bucket,
        },
        responseType: 'blob',
      });
      const blob = new Blob([response.data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${metric}-${device_id.slice(0, 8)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV export failed', e);
    }
  },

  fetchHeatmap: async ({ device_id, metric, from, to }) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<HeatmapPoint[]>('/reports/heatmap', {
        params: {
          device_id,
          metric,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      });
      set({ loading: false });
      return data ?? [];
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch heatmap';
      set({ error: message, loading: false });
      return [];
    }
  },

  fetchDevicesHealth: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<DevicesHealthResponse>(
        '/reports/devices-health',
      );
      set({ loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch devices health';
      set({ error: message, loading: false });
      return null;
    }
  },

  fetchAutomations: async ({ from, to }) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<AutomationsReport>(
        '/reports/automations',
        {
          params: { from: from.toISOString(), to: to.toISOString() },
        },
      );
      set({ loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch automations report';
      set({ error: message, loading: false });
      return null;
    }
  },

  fetchAiUsage: async ({ from, to }) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<AiUsageReport>('/reports/ai-usage', {
        params: { from: from.toISOString(), to: to.toISOString() },
      });
      set({ loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch AI usage report';
      set({ error: message, loading: false });
      return null;
    }
  },

  invalidate: () =>
    set({
      series: new Map(),
      fieldSeries: new Map(),
      stateEvents: new Map(),
      aggregate: new Map(),
    }),
}));
