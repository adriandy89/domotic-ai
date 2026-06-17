import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  bucketForRange,
  KPICard,
  presetRange,
  type RangeValue,
  RangeSelector,
  TimeSeriesChart,
  BarChartCmp,
} from '../../components/charts';
import DeviceSelector from '../../components/reports/DeviceSelector';
import PriceCurveCard from '../../components/reports/PriceCurveCard';
import ProviderPricesCard from '../../components/reports/ProviderPricesCard';
import { Button } from '../../components/ui/button';
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
import {
  usePricingStore,
  type CostSeries,
} from '../../store/usePricingStore';
import {
  formatCurrency,
  formatNumber,
  formatWithUnit,
} from '../../lib/format';
import { Download, Zap } from 'lucide-react';

export default function EnergyReportPage() {
  const { t } = useTranslation();
  const { devices, devicesByHome } = useDevicesStore();
  const { homes, homeIds } = useHomesStore();
  const { fetchSeries, fetchAggregate, fetchMultiSeries, exportCsv } =
    useReportsStore();

  const [homeId, setHomeId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeValue>(presetRange('7d'));

  // Power-capable devices in the chosen home (or all homes).
  const powerDevices = useMemo(() => {
    return Object.values(devices).filter((d) => {
      if (d.disabled) return false;
      if (homeId && d.home_id !== homeId) return false;
      return hasExpose(d, ['power', 'energy']);
    });
  }, [devices, homeId]);

  const { fetchCostSeries } = usePricingStore();

  const [powerSeries, setPowerSeries] = useState<SeriesResponse | null>(null);
  const [energySeries, setEnergySeries] = useState<SeriesResponse | null>(null);
  const [costSeries, setCostSeries] = useState<CostSeries | null>(null);
  const [previousCostTotal, setPreviousCostTotal] = useState<number | null>(null);
  const [aggregate, setAggregate] = useState<Record<
    string,
    number | null
  > | null>(null);
  const [previousAggregate, setPreviousAggregate] = useState<Record<
    string,
    number | null
  > | null>(null);
  const [topConsumers, setTopConsumers] = useState<
    { device_id: string; name: string; energy: number }[]
  >([]);

  // Pre-select first power device when none chosen.
  useEffect(() => {
    if (!deviceId && powerDevices.length > 0) {
      setDeviceId(powerDevices[0].id);
    }
  }, [deviceId, powerDevices]);

  const bucket = bucketForRange(range);

  // Load series for the selected device.
  useEffect(() => {
    if (!deviceId) return;
    fetchSeries({
      device_id: deviceId,
      metric: 'power',
      from: range.from,
      to: range.to,
      bucket,
    }).then(setPowerSeries);
    fetchSeries({
      device_id: deviceId,
      metric: 'energy',
      from: range.from,
      to: range.to,
      bucket,
    }).then(setEnergySeries);
    fetchAggregate({
      device_id: deviceId,
      from: range.from,
      to: range.to,
    }).then((agg) => setAggregate(agg?.metrics ?? null));

    // Previous period for delta.
    const span = range.to.getTime() - range.from.getTime();
    const prevFrom = new Date(range.from.getTime() - span);
    const prevTo = new Date(range.from.getTime());
    fetchAggregate({
      device_id: deviceId,
      from: prevFrom,
      to: prevTo,
    }).then((agg) => setPreviousAggregate(agg?.metrics ?? null));

    // Tariff-aware cost (fixed / TOU / dynamic market prices).
    const costBucket = bucket === 'day' ? 'day' : 'hour';
    fetchCostSeries({
      device_id: deviceId,
      from: range.from,
      to: range.to,
      bucket: costBucket,
    }).then(setCostSeries);
    fetchCostSeries({
      device_id: deviceId,
      from: prevFrom,
      to: prevTo,
      bucket: costBucket,
    }).then((prev) => setPreviousCostTotal(prev?.totals.cost ?? null));
  }, [deviceId, range, bucket, fetchSeries, fetchAggregate, fetchCostSeries]);

  // Top consumers across the home / org.
  useEffect(() => {
    const ids = (homeId ? devicesByHome[homeId] ?? [] : Object.keys(devices))
      .filter((id) => {
        const d = devices[id];
        if (!d || d.disabled) return false;
        return hasExpose(d, ['energy']);
      })
      .slice(0, 20);
    if (ids.length === 0) {
      setTopConsumers([]);
      return;
    }
    fetchMultiSeries({
      device_ids: ids,
      metric: 'energy',
      from: range.from,
      to: range.to,
      bucket: 'day',
    }).then((multi) => {
      const top = multi
        .map((s) => {
          const energy = s.points.reduce((acc, p) => acc + (p.value ?? 0), 0);
          return {
            device_id: s.device_id,
            name: devices[s.device_id]?.name ?? s.device_id.slice(0, 8),
            energy,
          };
        })
        .filter((t) => t.energy > 0)
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 5);
      setTopConsumers(top);
    });
  }, [homeId, range, devices, devicesByHome, fetchMultiSeries]);

  // Home for the price curve: explicit selection, else the device's home.
  const effectiveHomeId = homeId ?? (deviceId ? devices[deviceId]?.home_id ?? null : null);
  const home = effectiveHomeId ? homes[effectiveHomeId] : null;
  const kwhPrice = Number(home?.kwh_price ?? 0);

  const energyKwh = aggregate?.energy_kwh ?? 0;
  const previousEnergy = previousAggregate?.energy_kwh ?? null;

  // Server-side tariff-aware cost; falls back to flat kwh_price × energy when
  // the cost series is unavailable (device without home, request failed…).
  const currency = (costSeries?.currency ?? home?.currency ?? 'USD') as string;
  const cost = costSeries?.totals.cost ?? energyKwh * kwhPrice;
  const previousCost =
    previousCostTotal ??
    (previousEnergy != null ? previousEnergy * kwhPrice : null);
  const tariffModeLabel =
    costSeries?.mode === 'dynamic'
      ? t('reports.energy.dynamicMode')
      : costSeries?.mode === 'tou'
        ? t('reports.energy.touMode')
        : null;
  const avgPrice =
    costSeries && costSeries.totals.energy_kwh > 0
      ? costSeries.totals.cost / costSeries.totals.energy_kwh
      : null;
  const isEstimate = (costSeries?.totals.fallback_hours ?? 0) > 0;

  const powerSparkline = useMemo(
    () =>
      (powerSeries?.points ?? []).map((p) => ({
        bucket: p.bucket,
        value: p.value,
      })),
    [powerSeries],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 justify-between">
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
              {t('common.device')}
            </label>
            <DeviceSelector
              value={deviceId}
              onChange={setDeviceId}
              hasProperty="power"
              homeId={homeId}
              placeholder={t('reports.deviceSelector.pickEnergyMeter')}
            />
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!deviceId}
          onClick={() =>
            deviceId &&
            exportCsv({
              device_id: deviceId,
              metric: 'energy',
              from: range.from,
              to: range.to,
              bucket,
            })
          }
        >
          <Download className="w-4 h-4 mr-1" />
          {t('reports.filters.exportCsv')}
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t('reports.energy.energyUsed')}
          value={formatWithUnit(energyKwh, 'kWh', 2)}
          subtitle={t('reports.energy.period')}
          current={energyKwh}
          previous={previousEnergy}
          inverse
          icon={<Zap className="w-4 h-4" />}
          accentColor="#8b5cf6"
        />
        <KPICard
          label={
            isEstimate
              ? t('reports.energy.estimatedCost')
              : t('reports.energy.energyCost')
          }
          value={formatCurrency(cost, currency)}
          subtitle={
            tariffModeLabel && avgPrice != null
              ? t('reports.energy.avgPriceSubtitle', {
                  mode: tariffModeLabel,
                  price: formatCurrency(avgPrice, currency, 4),
                })
              : kwhPrice > 0
                ? t('reports.energy.flatPriceSubtitle', {
                    price: formatCurrency(kwhPrice, currency, 4),
                  })
                : t('reports.energy.setTariff')
          }
          current={cost}
          previous={previousCost}
          inverse
          accentColor="#10b981"
        />
        <KPICard
          label={t('reports.energy.avgPower')}
          value={formatWithUnit(aggregate?.power_avg, 'W', 0)}
          subtitle={t('reports.energy.acrossPeriod')}
          current={aggregate?.power_avg ?? null}
          previous={previousAggregate?.power_avg ?? null}
          inverse
          sparkline={powerSparkline}
          accentColor="#22d3ee"
        />
        <KPICard
          label={t('reports.energy.peakPower')}
          value={formatWithUnit(aggregate?.power_max, 'W', 0)}
          subtitle={t('reports.energy.maxInPeriod')}
          accentColor="#ef4444"
        />
      </div>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            {t('reports.energy.powerOverTime')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            data={(powerSeries?.points ?? []).map((p) => ({
              bucket: p.bucket,
              power: p.value,
            }))}
            series={[
              {
                key: 'power',
                label: t('reports.energy.series.power'),
                unit: 'W',
                color: '#22d3ee',
              },
            ]}
            type="area"
            yUnit="W"
          />
        </CardContent>
      </Card>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            {t('reports.energy.energyConsumption')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarChartCmp
            data={(energySeries?.points ?? []).map((p) => ({
              bucket: p.bucket,
              energy: p.value,
            }))}
            xKey="bucket"
            series={[
              {
                key: 'energy',
                label: t('reports.energy.series.energy'),
                unit: 'kWh',
                color: '#8b5cf6',
              },
            ]}
            yUnit="kWh"
            xFormat={(v) => new Date(v).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {costSeries && costSeries.points.length > 0 && (
        <Card className="bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-lg">
              {isEstimate
                ? t('reports.energy.energyCostEstimate')
                : t('reports.energy.energyCostChart')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartCmp
              data={costSeries.points.map((p) => ({
                bucket: p.bucket,
                cost: p.cost,
              }))}
              xKey="bucket"
              series={[
                {
                  key: 'cost',
                  label: t('reports.energy.series.cost'),
                  unit: currency,
                  color: '#10b981',
                },
              ]}
              yUnit={currency}
              xFormat={(v) =>
                costSeries.bucket === 'day'
                  ? new Date(v).toLocaleDateString()
                  : new Date(v).toLocaleString(undefined, {
                      day: '2-digit',
                      hour: '2-digit',
                    })
              }
            />
            {isEstimate && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('reports.energy.fallbackNote', {
                  hours: costSeries.totals.fallback_hours,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {effectiveHomeId && <PriceCurveCard homeId={effectiveHomeId} />}

      <ProviderPricesCard homeId={homeId} from={range.from} to={range.to} />

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            {t('reports.energy.topConsumers')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topConsumers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('reports.energy.noMeters')}
            </p>
          ) : (
            <BarChartCmp
              data={topConsumers.map((c) => ({
                name: c.name,
                energy: Number(c.energy.toFixed(3)),
              }))}
              xKey="name"
              series={[
                {
                  key: 'energy',
                  label: t('reports.energy.series.energy'),
                  unit: 'kWh',
                  color: '#f59e0b',
                },
              ]}
              layout="vertical"
              yUnit="kWh"
              height={Math.max(180, topConsumers.length * 38)}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('reports.energy.totalSamples', {
          count: formatNumber(aggregate?.sample_count ?? 0, 0),
        })}
      </p>
    </div>
  );
}

