import { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  usePricingStore,
  type PricingProvider,
} from '../../store/usePricingStore';
import { useHomesStore, type Home } from '../../store/useHomesStore';
import { formatCurrency } from '../../lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const SHORT_PROVIDER: Record<string, string> = {
  esios_pvpc: 'PVPC',
  entsoe: 'ENTSO-E',
};

const TONE_DOT: Record<'cheap' | 'mid' | 'expensive', string> = {
  cheap: '#10b981',
  mid: '#f59e0b',
  expensive: '#ef4444',
};

type Tone = 'cheap' | 'mid' | 'expensive';

interface PriceRow {
  homeId: string;
  name: string;
  typeLabel: string;
  detail: string | null;
  price: number | null;
  currency: string;
  tone: Tone | null;
  estimate: boolean;
}

/** A home is shown when it has a usable price source. */
function eligibleType(
  home: Home | undefined,
): 'DYNAMIC' | 'TOU' | 'FIXED' | null {
  if (!home) return null;
  if (home.tariff_type === 'DYNAMIC') {
    const cfg = home.tariff_config as { provider?: string; zone?: string } | null;
    return cfg?.provider && cfg?.zone ? 'DYNAMIC' : null;
  }
  if (home.tariff_type === 'TOU') return 'TOU';
  if (home.tariff_type === 'FIXED' && Number(home.kwh_price ?? 0) > 0) {
    return 'FIXED';
  }
  return null;
}

/**
 * Dashboard card: current electricity price per home, for every home with a
 * configured tariff (dynamic / time-of-use / fixed). Dynamic rows are tinted by
 * tercile (cheap / mid / expensive) against the day's published curve. The card
 * renders nothing when no home has a usable tariff.
 */
export default function ElectricityPricesCard() {
  const { homes, homeIds } = useHomesStore();
  const { fetchProviders, fetchPriceCurve } = usePricingStore();
  const [providers, setProviders] = useState<PricingProvider[]>([]);
  // Keyed by the eligible-homes signature so a stale set never flashes.
  const [loaded, setLoaded] = useState<{ sig: string; rows: PriceRow[] } | null>(
    null,
  );

  const eligible = useMemo(
    () =>
      homeIds
        .map((id) => ({ home: homes[id], type: eligibleType(homes[id]) }))
        .filter(
          (e): e is { home: Home; type: 'DYNAMIC' | 'TOU' | 'FIXED' } =>
            !!e.home && e.type !== null,
        ),
    [homeIds, homes],
  );

  // Re-fetch only when the eligible homes or their tariff config actually change.
  const signature = eligible
    .map(
      (e) =>
        `${e.home.id}:${e.type}:${e.home.kwh_price}:${e.home.currency}:${JSON.stringify(
          e.home.tariff_config,
        )}`,
    )
    .join('|');

  useEffect(() => {
    void fetchProviders().then(setProviders);
  }, [fetchProviders]);

  useEffect(() => {
    if (eligible.length === 0) return;
    let cancelled = false;
    void Promise.all(
      eligible.map(async ({ home, type }): Promise<PriceRow> => {
        const base = {
          homeId: home.id,
          name: home.name,
        };
        if (type === 'FIXED') {
          return {
            ...base,
            typeLabel: 'Fixed',
            detail: null,
            price: Number(home.kwh_price ?? 0),
            currency: home.currency ?? 'USD',
            tone: null,
            estimate: false,
          };
        }
        // DYNAMIC / TOU → resolve the live price (and tercile for dynamic).
        const curve = await fetchPriceCurve(home.id);
        const currency = curve?.currency ?? home.currency ?? 'EUR';
        let tone: Tone | null = null;
        let price = curve?.current_price ?? null;
        let estimate = false;
        if (type === 'DYNAMIC' && curve) {
          const prices = curve.points
            .map((p) => p.price_kwh)
            .sort((a, b) => a - b);
          if (price != null && prices.length > 0) {
            const t1 = prices[Math.floor(prices.length / 3)] ?? 0;
            const t2 = prices[Math.floor((prices.length * 2) / 3)] ?? 0;
            tone = price <= t1 ? 'cheap' : price <= t2 ? 'mid' : 'expensive';
          }
          // No published price for the current hour → fall back to kwh_price.
          if (price == null) {
            price = Number(home.kwh_price ?? 0) || null;
            estimate = price != null;
          }
        }
        const cfg =
          type === 'DYNAMIC'
            ? (home.tariff_config as { provider?: string; zone?: string } | null)
            : null;
        const detail =
          type === 'DYNAMIC' && cfg?.provider
            ? `${SHORT_PROVIDER[cfg.provider] ?? cfg.provider} · ${
                providers
                  .find((p) => p.source === cfg.provider)
                  ?.zones.find((z) => z.id === cfg.zone)?.label ?? cfg.zone
              }`
            : type === 'TOU'
              ? 'current period'
              : null;
        return {
          ...base,
          typeLabel: type === 'DYNAMIC' ? 'Dynamic' : 'Time-of-use',
          detail,
          price,
          currency,
          tone,
          estimate,
        };
      }),
    ).then((resolved) => {
      if (!cancelled) setLoaded({ sig: signature, rows: resolved });
    });
    return () => {
      cancelled = true;
    };
    // `signature` captures the eligible homes; `providers` only refines labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, fetchPriceCurve, providers]);

  if (eligible.length === 0) return null;

  const rows = loaded?.sig === signature ? loaded.rows : [];

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-amber-400" />
          Electricity prices · now
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Loading prices…</p>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((row) => (
            <div
              key={row.homeId}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/30 border border-border/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" title={row.name}>
                  {row.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {row.typeLabel}
                  {row.detail ? ` · ${row.detail}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row.tone && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: TONE_DOT[row.tone] }}
                  />
                )}
                <div className="text-right">
                  <div className="text-sm font-semibold text-card-foreground">
                    {row.price != null
                      ? `${formatCurrency(row.price, row.currency, 4)}`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {row.estimate ? 'est. /kWh' : '/kWh'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
