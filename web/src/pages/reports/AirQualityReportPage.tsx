import { useEffect, useMemo, useState } from 'react';
import {
  bucketForRange,
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
  type ReportMetric,
  type SeriesResponse,
} from '../../store/useReportsStore';
import { formatWithUnit } from '../../lib/format';
import { Wind } from 'lucide-react';

// WHO/EPA-aligned thresholds, used to draw band reference lines and color KPIs.
const THRESHOLDS = {
  co2: { good: 1000, warn: 1500, unit: 'ppm' }, // ASHRAE indoor
  voc: { good: 220, warn: 660, unit: 'ppb' },
  pm25: { good: 12, warn: 35, unit: 'µg/m³' }, // 24h WHO
  pm10: { good: 45, warn: 100, unit: 'µg/m³' }, // 24h WHO 2021
};

const METRICS: { metric: ReportMetric; label: string; expose: string }[] = [
  { metric: 'co2', label: 'CO₂', expose: 'co2' },
  { metric: 'voc', label: 'VOC', expose: 'voc' },
  { metric: 'pm25', label: 'PM2.5', expose: 'pm25' },
  { metric: 'pm10', label: 'PM10', expose: 'pm10' },
];

function bandColor(
  value: number | null | undefined,
  thr: { good: number; warn: number },
): string {
  if (value == null) return '#6b7280';
  if (value <= thr.good) return '#10b981';
  if (value <= thr.warn) return '#f59e0b';
  return '#ef4444';
}

export default function AirQualityReportPage() {
  const { devices } = useDevicesStore();
  const { homes, homeIds } = useHomesStore();
  const { fetchSeries, fetchAggregate } = useReportsStore();

  const [homeId, setHomeId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeValue>(presetRange('7d'));

  const candidates = useMemo(
    () =>
      Object.values(devices).filter((d) => {
        if (d.disabled) return false;
        if (homeId && d.home_id !== homeId) return false;
        return hasExpose(d, ['co2', 'voc', 'pm25', 'pm10']);
      }),
    [devices, homeId],
  );

  useEffect(() => {
    if (!deviceId && candidates.length > 0) setDeviceId(candidates[0].id);
  }, [deviceId, candidates]);

  const [seriesByMetric, setSeriesByMetric] = useState<
    Record<string, SeriesResponse | null>
  >({});
  const [aggregate, setAggregate] = useState<Record<
    string,
    number | null
  > | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    const bucket = bucketForRange(range);
    Promise.all(
      METRICS.map((m) =>
        fetchSeries({
          device_id: deviceId,
          metric: m.metric,
          from: range.from,
          to: range.to,
          bucket,
        }).then((s) => [m.metric, s] as const),
      ),
    ).then((entries) => {
      const next: Record<string, SeriesResponse | null> = {};
      for (const [k, v] of entries) next[k] = v;
      setSeriesByMetric(next);
    });
    fetchAggregate({
      device_id: deviceId,
      from: range.from,
      to: range.to,
    }).then((a) => setAggregate(a?.metrics ?? null));
  }, [deviceId, range, fetchSeries, fetchAggregate]);

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
            Sensor
          </label>
          <DeviceSelector
            value={deviceId}
            onChange={setDeviceId}
            hasProperty="co2"
            homeId={homeId}
            placeholder="Pick an air quality sensor"
          />
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => {
          const value = aggregate?.[`${m.metric}_avg`] ?? null;
          const thr = THRESHOLDS[m.metric as keyof typeof THRESHOLDS];
          return (
            <KPICard
              key={m.metric}
              label={m.label}
              value={formatWithUnit(value, thr.unit, 0)}
              subtitle={`good ≤ ${thr.good} ${thr.unit}`}
              accentColor={bandColor(value, thr)}
              icon={<Wind className="w-4 h-4" />}
            />
          );
        })}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {METRICS.map((m) => {
          const s = seriesByMetric[m.metric];
          const thr = THRESHOLDS[m.metric as keyof typeof THRESHOLDS];
          return (
            <Card key={m.metric} className="bg-card/40 border-border">
              <CardHeader>
                <CardTitle className="text-base">
                  {m.label}
                  <span className="text-xs text-muted-foreground ml-2">
                    ({thr.unit})
                  </span>
                </CardTitle>
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
                      unit: thr.unit,
                      color: '#22d3ee',
                    },
                  ]}
                  yUnit={thr.unit}
                  referenceLines={[
                    { value: thr.good, label: 'good', color: '#10b981' },
                    { value: thr.warn, label: 'warn', color: '#ef4444' },
                  ]}
                  height={220}
                  type="area"
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

