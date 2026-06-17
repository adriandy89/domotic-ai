import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  type SeriesResponse,
} from '../../store/useReportsStore';
import { formatNumber, formatPercent, formatWithUnit } from '../../lib/format';
import { Droplets, Thermometer } from 'lucide-react';

export default function ClimateReportPage() {
  const { t } = useTranslation();
  const { devices } = useDevicesStore();
  const { homes, homeIds } = useHomesStore();
  const { fetchSeries, fetchAggregate } = useReportsStore();

  const [homeId, setHomeId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeValue>(presetRange('7d'));

  const tempDevices = useMemo(
    () =>
      Object.values(devices).filter((d) => {
        if (d.disabled) return false;
        if (homeId && d.home_id !== homeId) return false;
        return hasExpose(d, ['temperature', 'humidity']);
      }),
    [devices, homeId],
  );

  const [tempSeries, setTempSeries] = useState<SeriesResponse | null>(null);
  const [humSeries, setHumSeries] = useState<SeriesResponse | null>(null);
  const [aggregate, setAggregate] = useState<Record<
    string,
    number | null
  > | null>(null);

  useEffect(() => {
    if (!deviceId && tempDevices.length > 0) setDeviceId(tempDevices[0].id);
  }, [deviceId, tempDevices]);

  const bucket = bucketForRange(range);
  useEffect(() => {
    if (!deviceId) return;
    fetchSeries({
      device_id: deviceId,
      metric: 'temperature',
      from: range.from,
      to: range.to,
      bucket,
    }).then(setTempSeries);
    fetchSeries({
      device_id: deviceId,
      metric: 'humidity',
      from: range.from,
      to: range.to,
      bucket,
    }).then(setHumSeries);
    fetchAggregate({
      device_id: deviceId,
      from: range.from,
      to: range.to,
    }).then((agg) => setAggregate(agg?.metrics ?? null));
  }, [deviceId, range, bucket, fetchSeries, fetchAggregate]);

  const home = homeId ? homes[homeId] : null;
  const comfortMin = home?.comfort_min_temp
    ? Number(home.comfort_min_temp)
    : 19;
  const comfortMax = home?.comfort_max_temp
    ? Number(home.comfort_max_temp)
    : 24;

  // % time in comfort = (samples in [min,max] / total samples) — approximation
  // using min/max of the range. Without per-bucket histograms we use a simple
  // heuristic: count buckets whose AVG is in range.
  const comfortPct = useMemo(() => {
    const points = tempSeries?.points ?? [];
    if (points.length === 0) return null;
    const inside = points.filter(
      (p) =>
        p.value != null && p.value >= comfortMin && p.value <= comfortMax,
    ).length;
    return (inside / points.length) * 100;
  }, [tempSeries, comfortMin, comfortMax]);

  const overlay = useMemo(() => {
    const tempPoints = tempSeries?.points ?? [];
    const humByBucket = new Map(
      (humSeries?.points ?? []).map((p) => [p.bucket, p.value]),
    );
    return tempPoints.map((p) => ({
      bucket: p.bucket,
      temperature: p.value,
      humidity: humByBucket.get(p.bucket) ?? null,
    }));
  }, [tempSeries, humSeries]);

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
            {t('reports.filters.sensor')}
          </label>
          <DeviceSelector
            value={deviceId}
            onChange={setDeviceId}
            hasProperty="temperature"
            homeId={homeId}
            placeholder={t('reports.deviceSelector.pickClimateSensor')}
          />
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t('reports.climate.avgTemperature')}
          value={formatWithUnit(aggregate?.temperature_avg, '°C', 1)}
          accentColor="#f59e0b"
          icon={<Thermometer className="w-4 h-4" />}
        />
        <KPICard
          label={t('reports.climate.minMax')}
          value={`${formatNumber(aggregate?.temperature_min, 1)} / ${formatNumber(aggregate?.temperature_max, 1)} °C`}
          accentColor="#3b82f6"
        />
        <KPICard
          label={t('reports.climate.avgHumidity')}
          value={formatWithUnit(aggregate?.humidity_avg, '%', 0)}
          accentColor="#22d3ee"
          icon={<Droplets className="w-4 h-4" />}
        />
        <KPICard
          label={t('reports.climate.timeInComfort')}
          value={formatPercent(comfortPct, 0)}
          subtitle={`${comfortMin}°C – ${comfortMax}°C`}
          accentColor="#10b981"
        />
      </div>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            {t('reports.climate.tempHumidity')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            data={overlay}
            series={[
              {
                key: 'temperature',
                label: t('reports.climate.series.temperature'),
                unit: '°C',
                color: '#f59e0b',
              },
              {
                key: 'humidity',
                label: t('reports.climate.series.humidity'),
                unit: '%',
                color: '#22d3ee',
              },
            ]}
            referenceLines={[
              {
                value: comfortMin,
                label: t('reports.climate.comfortMin'),
                color: '#10b981',
              },
              {
                value: comfortMax,
                label: t('reports.climate.comfortMax'),
                color: '#10b981',
              },
            ]}
            height={320}
          />
        </CardContent>
      </Card>
    </div>
  );
}

