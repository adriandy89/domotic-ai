import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Battery, HeartPulse, SignalLow, WifiOff } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { KPICard } from '../../components/charts';
import {
  useReportsStore,
  type DeviceHealth,
} from '../../store/useReportsStore';
import { cn } from '../../lib/utils';
import { formatNumber } from '../../lib/format';
import { Loader2 } from 'lucide-react';

type SortKey = 'battery' | 'lqi' | 'last_seen' | 'uptime' | 'name';

export default function DevicesHealthReportPage() {
  const { t } = useTranslation();
  const { fetchDevicesHealth, loading } = useReportsStore();
  const [devices, setDevices] = useState<DeviceHealth[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('battery');

  useEffect(() => {
    fetchDevicesHealth().then((res) => {
      if (res?.devices) setDevices(res.devices);
    });
  }, [fetchDevicesHealth]);

  const sorted = useMemo(() => {
    const copy = [...devices];
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'battery':
          return (a.battery ?? 999) - (b.battery ?? 999);
        case 'lqi':
          return (a.lqi_avg ?? 999) - (b.lqi_avg ?? 999);
        case 'last_seen': {
          const aT = a.last_seen ? new Date(a.last_seen).getTime() : 0;
          const bT = b.last_seen ? new Date(b.last_seen).getTime() : 0;
          return aT - bT;
        }
        case 'uptime':
          return (a.uptime_pct_30d ?? 0) - (b.uptime_pct_30d ?? 0);
        case 'name':
          return a.name.localeCompare(b.name);
      }
    });
    return copy;
  }, [devices, sortKey]);

  const lowBattery = useMemo(
    () => devices.filter((d) => (d.battery ?? 100) < 20),
    [devices],
  );
  const weakSignal = useMemo(
    () => devices.filter((d) => (d.lqi_avg ?? 100) < 40),
    [devices],
  );
  const silent = useMemo(
    () =>
      devices.filter(
        (d) =>
          !d.last_seen ||
          Date.now() - new Date(d.last_seen).getTime() > 4 * 60 * 60 * 1000,
      ),
    [devices],
  );
  const lowUptime = useMemo(
    () =>
      devices.filter(
        (d) => d.uptime_pct_30d != null && d.uptime_pct_30d < 90,
      ),
    [devices],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t('reports.devicesHealth.lowBattery')}
          value={String(lowBattery.length)}
          subtitle={t('reports.devicesHealth.lowBatterySub')}
          accentColor="#f59e0b"
          icon={<Battery className="w-4 h-4" />}
        />
        <KPICard
          label={t('reports.devicesHealth.weakSignal')}
          value={String(weakSignal.length)}
          subtitle={t('reports.devicesHealth.weakSignalSub')}
          accentColor="#ef4444"
          icon={<SignalLow className="w-4 h-4" />}
        />
        <KPICard
          label={t('reports.devicesHealth.silent')}
          value={String(silent.length)}
          subtitle={t('reports.devicesHealth.silentSub')}
          accentColor="#6b7280"
          icon={<WifiOff className="w-4 h-4" />}
        />
        <KPICard
          label={t('reports.devicesHealth.lowUptime')}
          value={String(lowUptime.length)}
          subtitle={t('reports.devicesHealth.lowUptimeSub')}
          accentColor="#3b82f6"
          icon={<HeartPulse className="w-4 h-4" />}
        />
      </div>

      <Card className="bg-card/40 border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            {t('reports.devicesHealth.devices', { count: devices.length })}
          </CardTitle>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">
              {t('reports.devicesHealth.sort')}
            </span>
            {(
              [
                { k: 'battery', tk: 'battery' },
                { k: 'lqi', tk: 'lqi' },
                { k: 'last_seen', tk: 'lastSeen' },
                { k: 'uptime', tk: 'uptime' },
                { k: 'name', tk: 'name' },
              ] as { k: SortKey; tk: string }[]
            ).map((s) => (
              <Button
                key={s.k}
                size="sm"
                variant={sortKey === s.k ? 'default' : 'outline'}
                onClick={() => setSortKey(s.k)}
                className="h-7 text-xs"
              >
                {t(`reports.devicesHealth.sortBy.${s.tk}`)}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading && devices.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('reports.devicesHealth.noDevices')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border/50">
                    <th className="text-left py-2 px-2">
                      {t('reports.devicesHealth.columns.name')}
                    </th>
                    <th className="text-right py-2 px-2">
                      {t('reports.devicesHealth.columns.battery')}
                    </th>
                    <th className="text-right py-2 px-2">
                      {t('reports.devicesHealth.columns.trend')}
                    </th>
                    <th className="text-right py-2 px-2">
                      {t('reports.devicesHealth.columns.lqi')}
                    </th>
                    <th className="text-right py-2 px-2">
                      {t('reports.devicesHealth.columns.uptime')}
                    </th>
                    <th className="text-right py-2 px-2">
                      {t('reports.devicesHealth.columns.lastSeen')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d) => {
                    const days = daysOfBatteryLeft(d);
                    return (
                      <tr
                        key={d.device_id}
                        className="border-b border-border/30 hover:bg-accent/20"
                      >
                        <td className="py-2 px-2 truncate max-w-[220px]">
                          {d.name}
                        </td>
                        <td
                          className={cn(
                            'py-2 px-2 text-right tabular-nums font-medium',
                            d.battery == null
                              ? 'text-muted-foreground'
                              : d.battery < 10
                                ? 'text-red-500'
                                : d.battery < 20
                                  ? 'text-amber-500'
                                  : 'text-emerald-500',
                          )}
                        >
                          {d.battery == null ? '—' : `${d.battery}%`}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                          {days == null
                            ? '—'
                            : t('reports.devicesHealth.daysLeft', { days })}
                        </td>
                        <td
                          className={cn(
                            'py-2 px-2 text-right tabular-nums',
                            d.lqi_avg == null
                              ? 'text-muted-foreground'
                              : d.lqi_avg < 40
                                ? 'text-red-500'
                                : d.lqi_avg < 60
                                  ? 'text-amber-500'
                                  : 'text-emerald-500',
                          )}
                        >
                          {formatNumber(d.lqi_avg, 0)}
                        </td>
                        <td
                          className={cn(
                            'py-2 px-2 text-right tabular-nums',
                            d.uptime_pct_30d == null
                              ? 'text-muted-foreground'
                              : d.uptime_pct_30d < 80
                                ? 'text-red-500'
                                : d.uptime_pct_30d < 95
                                  ? 'text-amber-500'
                                  : 'text-emerald-500',
                          )}
                        >
                          {d.uptime_pct_30d == null
                            ? '—'
                            : `${d.uptime_pct_30d.toFixed(1)}%`}
                        </td>
                        <td className="py-2 px-2 text-right text-muted-foreground text-xs">
                          {d.last_seen
                            ? new Date(d.last_seen).toLocaleString()
                            : t('reports.devicesHealth.never')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function daysOfBatteryLeft(d: DeviceHealth): number | null {
  if (
    d.battery == null ||
    d.battery_trend_pct_per_day == null ||
    d.battery_trend_pct_per_day >= 0
  ) {
    return null;
  }
  const declinePerDay = -d.battery_trend_pct_per_day;
  if (declinePerDay < 0.01) return null;
  const days = Math.max(0, Math.floor(d.battery / declinePerDay));
  return days < 9999 ? days : null;
}
