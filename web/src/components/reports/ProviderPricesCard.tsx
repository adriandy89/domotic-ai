import { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { TimeSeriesChart, type SeriesDef, type SeriesPoint } from '../charts';
import {
  usePricingStore,
  type PricingProvider,
} from '../../store/usePricingStore';
import { useHomesStore } from '../../store/useHomesStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const PALETTE = ['#22d3ee', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
const SHORT_PROVIDER: Record<string, string> = {
  esios_pvpc: 'PVPC',
  entsoe: 'ENTSO-E',
};

interface ProviderPricesCardProps {
  /** Selected home, or null for "All homes". */
  homeId: string | null;
  from: Date;
  to: Date;
}

/** Distinct (source, zone) combos configured across the in-scope dynamic homes. */
interface Combo {
  source: string;
  zone: string;
}

/**
 * Historical market price for the selected period, one line per configured
 * provider/zone. With "All homes" it overlays every distinct provider in use;
 * with a single home it shows just that home's provider. Hidden when no home in
 * scope has a dynamic (market) tariff.
 */
export default function ProviderPricesCard({
  homeId,
  from,
  to,
}: ProviderPricesCardProps) {
  const { homes, homeIds } = useHomesStore();
  const { fetchProviderPrices, fetchProviders } = usePricingStore();

  const [providers, setProviders] = useState<PricingProvider[]>([]);
  const [loaded, setLoaded] = useState<{
    key: string;
    data: SeriesPoint[];
    series: SeriesDef[];
    currency: string;
  } | null>(null);

  // Distinct provider/zone combos for the homes in scope.
  const combos = useMemo<Combo[]>(() => {
    const ids = homeId ? [homeId] : homeIds;
    const seen = new Set<string>();
    const out: Combo[] = [];
    for (const id of ids) {
      const home = homes[id];
      if (!home || home.tariff_type !== 'DYNAMIC') continue;
      const cfg = home.tariff_config as
        | { provider?: string; zone?: string }
        | null
        | undefined;
      if (!cfg?.provider || !cfg?.zone) continue;
      const key = `${cfg.provider}|${cfg.zone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source: cfg.provider, zone: cfg.zone });
    }
    return out;
  }, [homeId, homeIds, homes]);

  useEffect(() => {
    void fetchProviders().then(setProviders);
  }, [fetchProviders]);

  const combosKey = combos.map((c) => `${c.source}|${c.zone}`).join(',');
  const viewKey = `${combosKey}|${from.toISOString()}|${to.toISOString()}`;

  useEffect(() => {
    if (combos.length === 0) return;
    let cancelled = false;
    void Promise.all(
      combos.map((c) =>
        fetchProviderPrices({ source: c.source, zone: c.zone, from, to }),
      ),
    ).then((results) => {
      if (cancelled) return;
      // Merge every series into rows keyed by timestamp.
      const byTs = new Map<string, SeriesPoint>();
      const series: SeriesDef[] = [];
      let currency = 'EUR';
      combos.forEach((c, i) => {
        const res = results[i];
        const key = `s${i}`;
        const zoneLabel =
          providers
            .find((p) => p.source === c.source)
            ?.zones.find((z) => z.id === c.zone)?.label ?? c.zone;
        series.push({
          key,
          label: `${SHORT_PROVIDER[c.source] ?? c.source} · ${zoneLabel}`,
          color: PALETTE[i % PALETTE.length],
          unit: res?.currency ?? currency,
        });
        if (res?.currency) currency = res.currency;
        for (const pt of res?.points ?? []) {
          const row = byTs.get(pt.ts) ?? { bucket: pt.ts };
          row[key] = pt.price_kwh;
          byTs.set(pt.ts, row);
        }
      });
      const data = [...byTs.values()].sort(
        (a, b) =>
          new Date(a.bucket).getTime() - new Date(b.bucket).getTime(),
      );
      setLoaded({ key: viewKey, data, series, currency });
    });
    return () => {
      cancelled = true;
    };
    // `viewKey` captures combos + range; `providers` only refines labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, fetchProviderPrices, providers]);

  const view = loaded?.key === viewKey ? loaded : null;

  if (combos.length === 0) {
    return (
      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Market prices by provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No market-priced homes in scope. Set a dynamic tariff (PVPC /
            ENTSO-E) in Settings → Energy to compare provider prices here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-primary" />
          Market prices by provider
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hourly market price over the selected period ·{' '}
          {view?.currency ?? 'EUR'}/kWh
        </p>
      </CardHeader>
      <CardContent>
        <TimeSeriesChart
          data={view?.data ?? []}
          series={view?.series ?? []}
          type="line"
          yUnit={view?.currency ?? 'EUR'}
          height={300}
          isLoading={!view}
          emptyLabel="No published prices for this period yet."
        />
      </CardContent>
    </Card>
  );
}
