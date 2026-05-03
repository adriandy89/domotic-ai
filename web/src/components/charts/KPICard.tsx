import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { formatDelta } from '../../lib/format';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';

interface KPICardProps {
  label: string;
  value: string;
  /** Optional sub-line under the value (period or unit). */
  subtitle?: string;
  /** Used to compute the delta arrow + percent. */
  current?: number | null;
  previous?: number | null;
  /** When `true`, a downward delta is GOOD (e.g. energy consumption, alarms). */
  inverse?: boolean;
  sparkline?: { bucket: string; value: number | null }[];
  icon?: React.ReactNode;
  accentColor?: string;
}

export default function KPICard({
  label,
  value,
  subtitle,
  current,
  previous,
  inverse = false,
  sparkline,
  icon,
  accentColor = '#8b5cf6',
}: KPICardProps) {
  const delta = formatDelta(current, previous);
  const isGood =
    delta.positive == null ? null : inverse ? !delta.positive : delta.positive;
  const Arrow =
    delta.positive == null ? Minus : delta.positive ? ArrowUp : ArrowDown;
  const deltaClass =
    isGood == null
      ? 'text-muted-foreground'
      : isGood
        ? 'text-emerald-500'
        : 'text-red-500';

  return (
    <Card className="bg-card/40 border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums truncate">
              {value}
            </p>
            <div className="flex items-center gap-2 mt-1 h-4">
              {subtitle && (
                <span className="text-xs text-muted-foreground/80 truncate">
                  {subtitle}
                </span>
              )}
              {delta.text !== '—' && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-medium',
                    deltaClass,
                  )}
                >
                  <Arrow className="w-3 h-3" />
                  {delta.text}
                </span>
              )}
            </div>
          </div>
          {icon && (
            <div
              className="shrink-0 p-2 rounded-md"
              style={{ background: `${accentColor}1a`, color: accentColor }}
            >
              {icon}
            </div>
          )}
        </div>
        {sparkline && sparkline.length > 1 && (
          <div className="mt-3 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={accentColor}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
