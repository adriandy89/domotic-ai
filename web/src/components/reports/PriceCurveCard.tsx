import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
} from '../charts/chart-tokens';
import { formatCurrency } from '../../lib/format';
import { usePricingStore, type PriceCurve } from '../../store/usePricingStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const CHEAP = '#10b981';
const MID = '#f59e0b';
const EXPENSIVE = '#ef4444';

interface PriceCurveCardProps {
  homeId: string;
}

/**
 * Today + tomorrow hourly price curve, colored by tercile (cheap / mid /
 * expensive) with the current hour highlighted. Hidden for fixed tariffs —
 * a flat line carries no information.
 */
export default function PriceCurveCard({ homeId }: PriceCurveCardProps) {
  const { fetchPriceCurve } = usePricingStore();
  // Keyed by home so switching homes shows nothing instead of a stale curve,
  // without a synchronous reset inside the effect. The current hour is
  // captured at load time (render must stay pure).
  const [loaded, setLoaded] = useState<{
    homeId: string;
    curve: PriceCurve | null;
    nowHour: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPriceCurve(homeId).then((curve) => {
      if (cancelled) return;
      const nowHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
      setLoaded({ homeId, curve, nowHour });
    });
    return () => {
      cancelled = true;
    };
  }, [homeId, fetchPriceCurve]);

  const curve = loaded?.homeId === homeId ? loaded.curve : null;

  const { data, thresholds, currentTs } = useMemo(() => {
    const points = curve?.points ?? [];
    const nowHour = loaded?.nowHour ?? 0;
    const prices = points.map((p) => p.price_kwh).sort((a, b) => a - b);
    const t1 = prices[Math.floor(prices.length / 3)] ?? 0;
    const t2 = prices[Math.floor((prices.length * 2) / 3)] ?? 0;
    return {
      data: points.map((p) => ({
        ts: p.ts,
        price: p.price_kwh,
        isNow: new Date(p.ts).getTime() === nowHour,
      })),
      thresholds: { t1, t2 },
      currentTs: points.find((p) => new Date(p.ts).getTime() === nowHour)?.ts,
    };
  }, [curve, loaded?.nowHour]);

  if (!curve || curve.mode === 'fixed' || data.length === 0) return null;

  const colorFor = (price: number) =>
    price <= thresholds.t1 ? CHEAP : price <= thresholds.t2 ? MID : EXPENSIVE;

  const hourLabel = (ts: string) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const fullLabel = (ts: string) =>
    new Date(ts).toLocaleString(undefined, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">
          Electricity price — today{curve.tomorrow_published ? ' & tomorrow' : ''}
        </CardTitle>
        {curve.current_price != null && (
          <span className="text-sm text-muted-foreground">
            now:{' '}
            <strong className="text-foreground">
              {formatCurrency(curve.current_price, curve.currency, 4)}/kWh
            </strong>
          </span>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="ts"
              tick={{ fill: AXIS_TICK, fontSize: 11 }}
              tickFormatter={hourLabel}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: AXIS_TICK, fontSize: 11 }}
              tickFormatter={(v: number) => v.toFixed(2)}
              width={42}
            />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              labelFormatter={(ts) => fullLabel(String(ts))}
              formatter={(value) => [
                `${formatCurrency(Number(value), curve.currency, 4)}/kWh`,
                'Price',
              ]}
            />
            {currentTs && <ReferenceLine x={currentTs} stroke={AXIS_TICK} strokeDasharray="4 2" />}
            <Bar dataKey="price" radius={[2, 2, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.ts}
                  fill={colorFor(entry.price)}
                  fillOpacity={entry.isNow ? 1 : 0.65}
                  stroke={entry.isNow ? AXIS_TICK : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: CHEAP }} />
              cheap
            </span>
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: MID }} />
              mid
            </span>
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: EXPENSIVE }} />
              expensive
            </span>
          </div>
          {!curve.tomorrow_published && curve.mode === 'dynamic' && (
            <p className="text-xs text-muted-foreground">
              Tomorrow's prices publish around 20:30 CET.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
