import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Activity,
  Battery,
  Cpu,
  Download,
  Gauge,
  History,
  Home,
  Loader2,
  ShieldAlert,
  Thermometer,
  Wind,
  Zap,
} from 'lucide-react';
import {
  bucketForRange,
  KPICard,
  presetRange,
  RangeSelector,
  TimeSeriesChart,
  type RangeValue,
} from '../components/charts';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { useDevicesStore } from '../store/useDevicesStore';
import { getDeviceExposes, flattenExposes } from '../lib/device-capabilities';
import { useHomesStore } from '../store/useHomesStore';
import {
  useReportsStore,
  type FieldSeriesResponse,
  type ReportMetric,
  type SeriesResponse,
  type StateEvent,
} from '../store/useReportsStore';
import { formatWithUnit } from '../lib/format';
import { cn } from '../lib/utils';

interface TabSpec {
  id: string;
  label: string;
  icon: React.ElementType;
  metrics: {
    metric: ReportMetric;
    label: string;
    unit?: string;
    color?: string;
  }[];
}

const ALL_TABS: TabSpec[] = [
  {
    id: 'climate',
    label: 'Climate',
    icon: Thermometer,
    metrics: [
      {
        metric: 'temperature',
        label: 'Temperature',
        unit: '°C',
        color: '#f59e0b',
      },
      { metric: 'humidity', label: 'Humidity', unit: '%', color: '#22d3ee' },
      { metric: 'pressure', label: 'Pressure', unit: 'hPa', color: '#3b82f6' },
      {
        metric: 'illuminance',
        label: 'Illuminance',
        unit: 'lx',
        color: '#fbbf24',
      },
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    icon: Zap,
    metrics: [
      { metric: 'power', label: 'Power', unit: 'W', color: '#22d3ee' },
      { metric: 'energy', label: 'Energy', unit: 'kWh', color: '#8b5cf6' },
      { metric: 'voltage', label: 'Voltage', unit: 'V', color: '#10b981' },
      { metric: 'current', label: 'Current', unit: 'A', color: '#f59e0b' },
    ],
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: ShieldAlert,
    metrics: [
      { metric: 'contact_open', label: 'Contact opens', color: '#f59e0b' },
      { metric: 'occupancy', label: 'Occupancy', color: '#10b981' },
      { metric: 'presence', label: 'Presence', color: '#22d3ee' },
      { metric: 'motion', label: 'Motion', color: '#a855f7' },
      { metric: 'vibration', label: 'Vibration', color: '#ef4444' },
      { metric: 'action', label: 'Button presses', color: '#3b82f6' },
    ],
  },
  {
    id: 'air',
    label: 'Air quality',
    icon: Wind,
    metrics: [
      { metric: 'co2', label: 'CO₂', unit: 'ppm', color: '#22d3ee' },
      { metric: 'voc', label: 'VOC', unit: 'ppb', color: '#10b981' },
      { metric: 'pm25', label: 'PM2.5', unit: 'µg/m³', color: '#f59e0b' },
      { metric: 'pm10', label: 'PM10', unit: 'µg/m³', color: '#ef4444' },
    ],
  },
  {
    id: 'health',
    label: 'Health',
    icon: Activity,
    metrics: [
      { metric: 'battery', label: 'Battery', unit: '%', color: '#10b981' },
      { metric: 'lqi', label: 'Link Quality', color: '#3b82f6' },
    ],
  },
];

/** Series colors for the dynamic Measurements charts. */
const MEASUREMENT_COLORS = [
  '#22d3ee',
  '#f59e0b',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#3b82f6',
  '#eab308',
  '#14b8a6',
];

const PROPERTY_FOR_METRIC: Record<ReportMetric, string> = {
  temperature: 'temperature',
  humidity: 'humidity',
  pressure: 'pressure',
  illuminance: 'illuminance',
  power: 'power',
  energy: 'energy',
  voltage: 'voltage',
  current: 'current',
  contact_open: 'contact',
  occupancy: 'occupancy',
  presence: 'presence',
  motion: 'motion',
  vibration: 'vibration',
  smoke: 'smoke',
  water_leak: 'water_leak',
  tamper: 'tamper',
  action: 'action',
  co2: 'co2',
  voc: 'voc',
  pm25: 'pm25',
  pm10: 'pm10',
  battery: 'battery',
  lqi: 'linkquality',
};

/** Properties already served by the fixed report metrics above. */
const COVERED_PROPERTIES = new Set(Object.values(PROPERTY_FOR_METRIC));

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** Badge tint for a logbook state value (ON/true green, OFF/false muted). */
function stateBadgeClass(value: string): string {
  const v = value.toLowerCase();
  if (v === 'on' || v === 'true') return 'bg-emerald-500/15 text-emerald-500';
  if (v === 'off' || v === 'false') return 'bg-muted text-muted-foreground';
  return 'bg-primary/10 text-primary';
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { devices } = useDevicesStore();
  // Use selector to avoid re-renders when other devices' data updates via SSE
  const last = useDevicesStore((state) =>
    id ? state.devicesData[id]?.data : undefined,
  );
  const lastTimestamp = useDevicesStore((state) =>
    id ? state.devicesData[id]?.timestamp : undefined,
  );
  const { homes } = useHomesStore();
  const {
    fetchSeries,
    exportCsv,
    fetchAggregate,
    fetchFieldSeries,
    fetchStateEvents,
  } = useReportsStore();

  const device = id ? devices[id] : null;
  const home = device ? homes[device.home_id] : null;

  const [range, setRange] = useState<RangeValue>(presetRange('7d'));
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Detect available tabs from device exposes (or last data, as fallback).
  const availableTabs = useMemo(() => {
    if (!device) return [] as TabSpec[];
    const flat = flattenExposes(getDeviceExposes(device));
    const presentProps = new Set(
      flat.map((e) => e.property ?? e.name).filter(Boolean) as string[],
    );
    if (last) {
      Object.keys(last).forEach((k) => presentProps.add(k));
    }

    return ALL_TABS.filter((tab) =>
      tab.metrics.some((m) => presentProps.has(PROPERTY_FOR_METRIC[m.metric])),
    ).map((tab) => ({
      ...tab,
      metrics: tab.metrics.filter((m) =>
        presentProps.has(PROPERTY_FOR_METRIC[m.metric]),
      ),
    }));
  }, [device, last]);

  // Numeric exposes (state_class measurement / unit, or a numeric last value)
  // not covered by the fixed report metrics → charted from the generic
  // per-field statistics (sensor_field_hourly/daily) under a Measurements tab.
  const fieldExposes = useMemo(() => {
    if (!device) return [];
    const seen = new Set<string>();
    return flattenExposes(getDeviceExposes(device)).filter((e) => {
      const prop = e.property ?? e.name;
      if (!prop || seen.has(prop)) return false;
      if (COVERED_PROPERTIES.has(prop)) return false;
      if (
        e.device_class === 'timestamp' ||
        prop === 'ts' ||
        prop === 'timestamp'
      )
        return false;
      const numeric =
        e.type === 'numeric' ||
        (e.type === 'value' && typeof last?.[prop] === 'number');
      if (!numeric) return false;
      seen.add(prop);
      return true;
    });
  }, [device, last]);

  // Exposes whose state belongs in the logbook (non-numeric scalar states):
  // binary/enum components, or value/text whose last value is a non-numeric
  // string (e.g. the relay's `trigger`). Drives the History tab visibility.
  const loggableExposes = useMemo(() => {
    if (!device) return [];
    const seen = new Set<string>();
    return flattenExposes(getDeviceExposes(device)).filter((e) => {
      const prop = e.property ?? e.name;
      if (!prop || seen.has(prop)) return false;
      if (
        e.device_class === 'timestamp' ||
        prop === 'ts' ||
        prop === 'timestamp'
      )
        return false;
      const lastValue = last?.[prop];
      const loggable =
        e.type === 'binary' ||
        e.type === 'enum' ||
        (typeof lastValue === 'string' && !NUMERIC_TEXT.test(lastValue.trim()));
      if (!loggable) return false;
      seen.add(prop);
      return true;
    });
  }, [device, last]);

  const allTabs = useMemo(() => {
    const tabs = [...availableTabs];
    if (fieldExposes.length > 0) {
      tabs.push({
        id: 'measurements',
        label: 'Measurements',
        icon: Gauge,
        metrics: [],
      });
    }
    if (loggableExposes.length > 0) {
      tabs.push({ id: 'history', label: 'History', icon: History, metrics: [] });
    }
    return tabs;
  }, [availableTabs, fieldExposes, loggableExposes]);

  useEffect(() => {
    if (!activeTab && allTabs.length > 0) {
      setActiveTab(allTabs[0].id);
    }
  }, [activeTab, allTabs]);

  const tab = allTabs.find((t) => t.id === activeTab);

  // Series for each metric in the active tab.
  const [seriesByMetric, setSeriesByMetric] = useState<
    Record<string, SeriesResponse | null>
  >({});
  const [isLoadingSeriesByMetric, setIsLoadingSeriesByMetric] =
    useState<boolean>(false);

  useEffect(() => {
    if (!device || !tab) return;
    setSeriesByMetric({});
    setIsLoadingSeriesByMetric(true);
    const bucket = bucketForRange(range);
    Promise.all(
      tab.metrics.map(async (m) => {
        const s = await fetchSeries({
          device_id: device.id,
          metric: m.metric,
          from: range.from,
          to: range.to,
          bucket,
        });
        return [m.metric, s] as const;
      }),
    ).then((entries) => {
      const next: Record<string, SeriesResponse | null> = {};
      for (const [k, v] of entries) next[k] = v;
      setSeriesByMetric(next);
      setIsLoadingSeriesByMetric(false);
    });
  }, [device, tab, range, fetchSeries]);

  // Series for each generic numeric field in the Measurements tab.
  const [seriesByField, setSeriesByField] = useState<
    Record<string, FieldSeriesResponse | null>
  >({});
  const [isLoadingSeriesByField, setIsLoadingSeriesByField] =
    useState<boolean>(false);

  useEffect(() => {
    if (!device || activeTab !== 'measurements' || fieldExposes.length === 0)
      return;
    setSeriesByField({});
    setIsLoadingSeriesByField(true);
    const bucket = bucketForRange(range);
    Promise.all(
      fieldExposes.map(async (e) => {
        const field = (e.property ?? e.name) as string;
        const s = await fetchFieldSeries({
          device_id: device.id,
          field,
          from: range.from,
          to: range.to,
          bucket,
        });
        return [field, s] as const;
      }),
    ).then((entries) => {
      const next: Record<string, FieldSeriesResponse | null> = {};
      for (const [k, v] of entries) next[k] = v;
      setSeriesByField(next);
      setIsLoadingSeriesByField(false);
    });
  }, [device, activeTab, range, fieldExposes, fetchFieldSeries]);

  // State-change logbook for the History tab.
  const [stateEvents, setStateEvents] = useState<StateEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);
  const [eventFilter, setEventFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!device || activeTab !== 'history') return;
    setIsLoadingEvents(true);
    fetchStateEvents({
      device_id: device.id,
      from: range.from,
      to: range.to,
    }).then((res) => {
      setStateEvents(res?.events ?? []);
      setIsLoadingEvents(false);
    });
  }, [device, activeTab, range, fetchStateEvents]);

  // Events filtered by the selected property chip, grouped by calendar day
  // (events arrive newest first from the API).
  const eventsByDay = useMemo(() => {
    const groups: { day: string; events: StateEvent[] }[] = [];
    for (const ev of stateEvents) {
      if (eventFilter && ev.property !== eventFilter) continue;
      const day = new Date(ev.timestamp).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.day === day) lastGroup.events.push(ev);
      else groups.push({ day, events: [ev] });
    }
    return groups;
  }, [stateEvents, eventFilter]);

  const eventProperties = useMemo(
    () => [...new Set(stateEvents.map((e) => e.property))],
    [stateEvents],
  );

  // Aggregate for header KPIs.
  const [aggregate, setAggregate] = useState<Record<
    string,
    number | null
  > | null>(null);
  useEffect(() => {
    if (!device) return;
    fetchAggregate({
      device_id: device.id,
      from: range.from,
      to: range.to,
    }).then((agg) => setAggregate(agg?.metrics ?? null));
  }, [device, range, fetchAggregate]);

  if (!device) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const battery = (last?.battery as number | undefined) ?? null;
  const lqi = (last?.linkquality as number | undefined) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/devices')}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{device.name}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {device.model || device.unique_id}
            </span>
            {home && (
              <span className="flex items-center gap-1">
                <Home className="w-3 h-3" />
                {home.name}
              </span>
            )}
            {lastTimestamp && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Last update: {new Date(lastTimestamp).toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Battery"
          value={battery == null ? '—' : `${battery}%`}
          accentColor={battery != null && battery < 20 ? '#f59e0b' : '#10b981'}
          icon={<Battery className="w-4 h-4" />}
        />
        <KPICard
          label="Link quality"
          value={lqi == null ? '—' : String(lqi)}
          accentColor={lqi != null && lqi < 40 ? '#ef4444' : '#3b82f6'}
        />
        <KPICard
          label="Samples in range"
          value={String(aggregate?.sample_count ?? 0)}
          accentColor="#8b5cf6"
        />
        <KPICard
          label="Energy in range"
          value={
            aggregate?.energy_kwh
              ? formatWithUnit(aggregate.energy_kwh, 'kWh', 2)
              : '—'
          }
          accentColor="#f59e0b"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 border-b border-border w-full sm:w-auto">
          {allTabs.length === 0 ? (
            <span className="text-sm text-muted-foreground py-2">
              No measurable exposes for this device
            </span>
          ) : (
            allTabs.map((t) => {
              const Icon = t.icon;
              const isActive = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })
          )}
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {tab && tab.metrics.length > 0 && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {tab.metrics.map((m) => {
            const s = seriesByMetric[m.metric];
            return (
              <Card key={m.metric} className="bg-card/40 border-border">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {m.label}
                    {m.unit && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({m.unit})
                      </span>
                    )}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Export CSV"
                    onClick={() =>
                      exportCsv({
                        device_id: device.id,
                        metric: m.metric,
                        from: range.from,
                        to: range.to,
                        bucket: bucketForRange(range),
                      })
                    }
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    data={(s?.points ?? []).map((p) => ({
                      bucket: p.bucket,
                      [m.metric]: p.value,
                    }))}
                    series={[
                      {
                        key: m.metric,
                        label: m.label,
                        unit: m.unit,
                        color: m.color,
                      },
                    ]}
                    yUnit={m.unit}
                    height={220}
                    type="area"
                    isLoading={isLoadingSeriesByMetric}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === 'measurements' && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {fieldExposes.map((e, i) => {
            const field = (e.property ?? e.name) as string;
            const s = seriesByField[field];
            const unit = e.unit ?? s?.unit ?? undefined;
            const color = MEASUREMENT_COLORS[i % MEASUREMENT_COLORS.length];
            return (
              <Card key={field} className="bg-card/40 border-border">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {e.label || field}
                    {unit && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({unit})
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    data={(s?.points ?? []).map((p) => ({
                      bucket: p.bucket,
                      [field]: p.value,
                    }))}
                    series={[
                      { key: field, label: e.label || field, unit, color },
                    ]}
                    yUnit={unit}
                    height={220}
                    type="area"
                    isLoading={isLoadingSeriesByField}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === 'history' && (
        <Card className="bg-card/40 border-border">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              State history
            </CardTitle>
            {eventProperties.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setEventFilter(null)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs border transition-colors',
                    eventFilter === null
                      ? 'border-primary text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  All
                </button>
                {eventProperties.map((p) => (
                  <button
                    key={p}
                    onClick={() => setEventFilter(eventFilter === p ? null : p)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs border transition-colors',
                      eventFilter === p
                        ? 'border-primary text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoadingEvents ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : eventsByDay.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No state changes in this range
              </p>
            ) : (
              <div className="space-y-4">
                {eventsByDay.map((group) => (
                  <div key={group.day}>
                    <p className="text-xs font-medium text-muted-foreground border-b border-border pb-1 mb-1">
                      {group.day}
                    </p>
                    <div className="divide-y divide-border/50">
                      {group.events.map((ev, i) => (
                        <div
                          key={`${ev.timestamp}-${ev.property}-${i}`}
                          className="flex items-center gap-3 py-1.5 text-sm"
                        >
                          <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0">
                            {new Date(ev.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                          <span className="font-medium w-28 truncate shrink-0">
                            {ev.property}
                          </span>
                          {ev.prev_value != null && (
                            <>
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-xs',
                                  stateBadgeClass(ev.prev_value),
                                )}
                              >
                                {ev.prev_value}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                →
                              </span>
                            </>
                          )}
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs',
                              stateBadgeClass(ev.value),
                            )}
                          >
                            {ev.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
