import { useEffect, useMemo, useState } from 'react';
import {
  bucketForRange,
  HeatmapChart,
  KPICard,
  presetRange,
  RangeSelector,
  TimeSeriesChart,
  type RangeValue,
} from '../../components/charts';
import DeviceSelector from '../../components/reports/DeviceSelector';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { useDevicesStore } from '../../store/useDevicesStore';
import { useHomesStore } from '../../store/useHomesStore';
import {
  useReportsStore,
  type HeatmapPoint,
  type ReportMetric,
  type SeriesResponse,
} from '../../store/useReportsStore';
import { formatNumber } from '../../lib/format';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

const ACTIVITY_OPTIONS: {
  value: ReportMetric;
  label: string;
  expose: string;
}[] = [
  { value: 'contact_open', label: 'Door / window opens', expose: 'contact' },
  { value: 'occupancy', label: 'Occupancy', expose: 'occupancy' },
  { value: 'presence', label: 'Presence', expose: 'presence' },
  { value: 'motion', label: 'Motion', expose: 'motion' },
  { value: 'vibration', label: 'Vibration', expose: 'vibration' },
  { value: 'smoke', label: 'Smoke', expose: 'smoke' },
  { value: 'water_leak', label: 'Water leak', expose: 'water_leak' },
  { value: 'tamper', label: 'Tamper', expose: 'tamper' },
];

export default function SecurityReportPage() {
  const { devices } = useDevicesStore();
  const { homes, homeIds } = useHomesStore();
  const { fetchSeries, fetchHeatmap, fetchAggregate } = useReportsStore();

  const [homeId, setHomeId] = useState<string | null>(null);
  const [metric, setMetric] = useState<ReportMetric>('contact_open');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeValue>(presetRange('30d'));

  const exposeName =
    ACTIVITY_OPTIONS.find((o) => o.value === metric)?.expose ?? 'contact';

  const eligibleDevices = useMemo(
    () =>
      Object.values(devices).filter((d) => {
        if (d.disabled) return false;
        if (homeId && d.home_id !== homeId) return false;
        return hasExpose(d.attributes?.definition?.exposes ?? [], [exposeName]);
      }),
    [devices, homeId, exposeName],
  );

  useEffect(() => {
    if (eligibleDevices.length > 0 && !eligibleDevices.find((d) => d.id === deviceId)) {
      setDeviceId(eligibleDevices[0].id);
    } else if (eligibleDevices.length === 0) {
      setDeviceId(null);
    }
  }, [eligibleDevices, deviceId]);

  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [aggregate, setAggregate] = useState<Record<
    string,
    number | null
  > | null>(null);

  useEffect(() => {
    if (!deviceId) {
      setSeries(null);
      setHeatmap([]);
      setAggregate(null);
      return;
    }
    fetchSeries({
      device_id: deviceId,
      metric,
      from: range.from,
      to: range.to,
      bucket: bucketForRange(range),
    }).then(setSeries);
    fetchHeatmap({
      device_id: deviceId,
      metric,
      from: range.from,
      to: range.to,
    }).then(setHeatmap);
    fetchAggregate({
      device_id: deviceId,
      from: range.from,
      to: range.to,
    }).then((agg) => setAggregate(agg?.metrics ?? null));
  }, [deviceId, metric, range, fetchSeries, fetchHeatmap, fetchAggregate]);

  const totalEvents = useMemo(() => {
    if (!aggregate) return 0;
    const counterKey = `${metric === 'contact_open' ? 'contact_open' : metric}_count`;
    return Number(aggregate[counterKey] ?? 0);
  }, [aggregate, metric]);

  const lastEvent = useMemo(() => {
    const points = (series?.points ?? []).slice().reverse();
    const last = points.find((p) => (p.value ?? 0) > 0);
    return last?.bucket ?? null;
  }, [series]);

  // Days without alarm-style events
  const daysSinceLast = useMemo(() => {
    if (!lastEvent) return null;
    const ms = Date.now() - new Date(lastEvent).getTime();
    return Math.floor(ms / 86_400_000);
  }, [lastEvent]);

  const isAlarmMetric = ['smoke', 'water_leak', 'tamper'].includes(metric);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Home
          </label>
          <select
            value={homeId ?? ''}
            onChange={(e) => setHomeId(e.target.value || null)}
            className="h-9 px-3 rounded-md border border-border bg-background/50 text-sm"
          >
            <option value="">All homes</option>
            {homeIds.map((id) => (
              <option key={id} value={id}>
                {homes[id]?.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Activity
          </label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as ReportMetric)}
            className="h-9 px-3 rounded-md border border-border bg-background/50 text-sm"
          >
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Device
          </label>
          <DeviceSelector
            value={deviceId}
            onChange={setDeviceId}
            hasProperty={exposeName}
            homeId={homeId}
          />
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Events in period"
          value={formatNumber(totalEvents, 0)}
          accentColor="#f59e0b"
          icon={<ShieldAlert className="w-4 h-4" />}
        />
        <KPICard
          label="Last event"
          value={lastEvent ? new Date(lastEvent).toLocaleString() : '—'}
          accentColor="#3b82f6"
        />
        {isAlarmMetric && (
          <KPICard
            label="Days without alarm"
            value={daysSinceLast == null ? '∞' : String(daysSinceLast)}
            accentColor="#10b981"
            icon={<ShieldCheck className="w-4 h-4" />}
          />
        )}
      </div>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Events over time</CardTitle>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            data={(series?.points ?? []).map((p) => ({
              bucket: p.bucket,
              events: p.value,
            }))}
            series={[
              { key: 'events', label: 'Events', color: '#f59e0b' },
            ]}
            height={260}
            type="area"
          />
        </CardContent>
      </Card>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Heatmap (day × hour)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex">
            <div className="flex flex-col justify-around mr-2 text-[10px] text-muted-foreground/70 py-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="flex-1">
              <HeatmapChart data={heatmap} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ExposeShape {
  name?: string;
  property?: string;
  features?: ExposeShape[];
}
function hasExpose(exposes: ExposeShape[], names: string[]): boolean {
  for (const e of exposes) {
    const id = e.property ?? e.name;
    if (id && names.includes(id)) return true;
    if (e.features && hasExpose(e.features, names)) return true;
  }
  return false;
}
