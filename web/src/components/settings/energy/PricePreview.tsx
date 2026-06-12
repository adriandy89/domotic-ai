import { TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCurrency } from '../../../lib/format';
import {
  usePricingStore,
  type PriceCurve,
} from '../../../store/usePricingStore';
import { Badge } from '../../ui/badge';

interface PricePreviewProps {
  homeId: string;
  /** Bump to refetch after a successful tariff save. */
  refreshKey: number;
}

/**
 * Compact market snapshot under the tariff form: current price, today's
 * min/max and whether tomorrow's prices are published. Renders nothing until
 * a curve with data exists (fixed tariffs never show it).
 */
export default function PricePreview({ homeId, refreshKey }: PricePreviewProps) {
  const { fetchPriceCurve } = usePricingStore();
  const [curve, setCurve] = useState<PriceCurve | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPriceCurve(homeId).then((data) => {
      if (!cancelled) setCurve(data);
    });
    return () => {
      cancelled = true;
    };
  }, [homeId, refreshKey, fetchPriceCurve]);

  if (!curve || curve.mode === 'fixed' || curve.points.length === 0) {
    return null;
  }

  const todayEnd = new Date().setHours(24, 0, 0, 0);
  const todayPrices = curve.points
    .filter((p) => new Date(p.ts).getTime() < todayEnd)
    .map((p) => p.price_kwh);
  const min = todayPrices.length ? Math.min(...todayPrices) : null;
  const max = todayPrices.length ? Math.max(...todayPrices) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 rounded-lg border border-border/50 bg-background/50">
      <div>
        <p className="text-xs text-muted-foreground">Current price</p>
        <p className="text-lg font-semibold">
          {formatCurrency(curve.current_price, curve.currency, 4)}
          <span className="text-xs font-normal text-muted-foreground">
            {' '}
            / kWh
          </span>
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <TrendingDown className="h-4 w-4 text-emerald-500" />
        <span className="text-muted-foreground">Today min</span>
        <span className="font-medium">
          {formatCurrency(min, curve.currency, 4)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <TrendingUp className="h-4 w-4 text-red-500" />
        <span className="text-muted-foreground">Today max</span>
        <span className="font-medium">
          {formatCurrency(max, curve.currency, 4)}
        </span>
      </div>
      <Badge variant={curve.tomorrow_published ? 'success' : 'outline'}>
        {curve.tomorrow_published ? 'Tomorrow published' : 'Tomorrow pending'}
      </Badge>
    </div>
  );
}
