import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import {
  usePricingStore,
  eligibleTariffType,
  pricesSignature,
  type PriceTone,
} from '../../store/usePricingStore';
import { useHomesStore } from '../../store/useHomesStore';
import { formatCurrency } from '../../lib/format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';

const TONE_DOT: Record<PriceTone, string> = {
  cheap: '#10b981',
  mid: '#f59e0b',
  expensive: '#ef4444',
};

/**
 * Dashboard card: current electricity price per home, for every home with a
 * configured tariff (dynamic / time-of-use / fixed). Dynamic rows are tinted by
 * tercile (cheap / mid / expensive). Rows are resolved + cached in
 * usePricingStore, so navigating back here does not re-resolve/flash, and the
 * dashboard poller refreshes them. Renders nothing when no home has a tariff.
 */
export default function ElectricityPricesCard({
  className,
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const { homes, homeIds } = useHomesStore();
  const currentPrices = usePricingStore((s) => s.currentPrices);
  const currentPricesSig = usePricingStore((s) => s.currentPricesSig);
  const refreshCurrentPrices = usePricingStore((s) => s.refreshCurrentPrices);

  const located = homeIds.map((id) => homes[id]).filter(Boolean);
  const hasEligible = located.some((h) => eligibleTariffType(h) !== null);
  const signature = pricesSignature(located);

  useEffect(() => {
    refreshCurrentPrices(located);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, refreshCurrentPrices]);

  if (!hasEligible) return null;

  // Only show rows resolved for the current signature (avoids a stale flash).
  const rows = currentPricesSig === signature ? currentPrices : [];

  return (
    <Card className={`bg-card/40 border-border ${className || ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-amber-400" />
          {t('dashboard.electricity.title')}
        </CardTitle>
        <CardDescription>{t('dashboard.electricity.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="@container">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {t('dashboard.electricity.loading')}
          </p>
        ) : (
          <div className="grid grid-cols-1 @sm:grid-cols-2 @2xl:grid-cols-3 gap-3">
            {rows.map((row) => {
              const typeLabel = t(
                `dashboard.electricity.types.${
                  row.type === 'FIXED'
                    ? 'fixed'
                    : row.type === 'DYNAMIC'
                      ? 'dynamic'
                      : 'tou'
                }`,
              );
              const detail =
                row.detail ??
                (row.type === 'TOU'
                  ? t('dashboard.electricity.touPeriod')
                  : null);
              return (
                <div
                  key={row.homeId}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/30 border border-border/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={row.name}>
                      {row.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {typeLabel}
                      {detail ? ` · ${detail}` : ''}
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
                        {row.estimate
                          ? t('dashboard.electricity.estPerKwh')
                          : t('dashboard.electricity.perKwh')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
