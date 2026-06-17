import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { hasExpose } from '../../lib/device-capabilities';
import { useHomesStore } from '../../store/useHomesStore';
import {
  useReportsStore,
  type HeatmapPoint,
  type ReportMetric,
  type SeriesResponse,
} from '../../store/useReportsStore';
import { formatNumber } from '../../lib/format';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

// `value` doubles as the i18n key under reports.security.activityOptions.
const ACTIVITY_OPTIONS: {
  value: ReportMetric;
  expose: string;
}[] = [
  { value: 'contact_open', expose: 'contact' },
  { value: 'occupancy', expose: 'occupancy' },
  { value: 'presence', expose: 'presence' },
  { value: 'motion', expose: 'motion' },
  { value: 'vibration', expose: 'vibration' },
  { value: 'smoke', expose: 'smoke' },
  { value: 'water_leak', expose: 'water_leak' },
  { value: 'tamper', expose: 'tamper' },
];

const HEATMAP_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default function SecurityReportPage() {
  const { t } = useTranslation();
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
        return hasExpose(d, [exposeName]);
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
            {t('common.home')}
          </label>
          <select
            value={homeId ?? ''}
            onChange={(e) => setHomeId(e.target.value || null)}
            className="h-9 px-3 rounded-md border border-border bg-background/50 text-sm"
          >
            <option value="">{t('common.allHomes')}</option>
            {homeIds.map((id) => (
              <option key={id} value={id}>
                {homes[id]?.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            {t('reports.filters.activity')}
          </label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as ReportMetric)}
            className="h-9 px-3 rounded-md border border-border bg-background/50 text-sm"
          >
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(`reports.security.activityOptions.${o.value}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            {t('common.device')}
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
          label={t('reports.security.eventsInPeriod')}
          value={formatNumber(totalEvents, 0)}
          accentColor="#f59e0b"
          icon={<ShieldAlert className="w-4 h-4" />}
        />
        <KPICard
          label={t('reports.security.lastEvent')}
          value={lastEvent ? new Date(lastEvent).toLocaleString() : '—'}
          accentColor="#3b82f6"
        />
        {isAlarmMetric && (
          <KPICard
            label={t('reports.security.daysWithoutAlarm')}
            value={daysSinceLast == null ? '∞' : String(daysSinceLast)}
            accentColor="#10b981"
            icon={<ShieldCheck className="w-4 h-4" />}
          />
        )}
      </div>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            {t('reports.security.eventsOverTime')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            data={(series?.points ?? []).map((p) => ({
              bucket: p.bucket,
              events: p.value,
            }))}
            series={[
              {
                key: 'events',
                label: t('reports.security.series.events'),
                color: '#f59e0b',
              },
            ]}
            height={260}
            type="area"
          />
        </CardContent>
      </Card>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            {t('reports.security.heatmap')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex">
            <div className="flex flex-col justify-around mr-2 text-[10px] text-muted-foreground/70 py-1">
              {HEATMAP_DAYS.map((d) => (
                <span key={d}>{t(`common.weekdayShort.${d}`)}</span>
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

