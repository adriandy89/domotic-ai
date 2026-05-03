import { format } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatWithUnit } from '../../lib/format';
import {
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_BG,
  TOOLTIP_BORDER,
  colorAt,
} from './chart-tokens';

export interface SeriesPoint {
  bucket: string; // ISO timestamp
  [key: string]: number | string | null;
}

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  unit?: string;
}

interface TimeSeriesChartProps {
  data: SeriesPoint[];
  series: SeriesDef[];
  type?: 'line' | 'area';
  height?: number;
  /** ISO date format for X axis. Defaults to short day. */
  xFormat?: (iso: string) => string;
  yUnit?: string;
  referenceLines?: { value: number; label?: string; color?: string }[];
  emptyLabel?: string;
}

const DEFAULT_X_FORMAT = (iso: string) => {
  const d = new Date(iso);
  // If the bucket spans a day boundary, just show the date.
  return format(d, 'MMM d HH:mm');
};

export default function TimeSeriesChart({
  data,
  series,
  type = 'line',
  height = 280,
  xFormat = DEFAULT_X_FORMAT,
  yUnit,
  referenceLines = [],
  emptyLabel = 'No data for this range',
}: TimeSeriesChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm rounded border border-dashed border-border/50"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const Chart = type === 'area' ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 11, fill: AXIS_TICK }}
          tickFormatter={xFormat}
          minTickGap={32}
          stroke={AXIS_TICK}
        />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS_TICK }}
          stroke={AXIS_TICK}
          width={48}
          tickFormatter={(v: number) => (yUnit ? `${v}${yUnit}` : `${v}`)}
        />
        <Tooltip
          contentStyle={{
            background: TOOLTIP_BG,
            border: `1px solid ${TOOLTIP_BORDER}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(label) =>
            format(new Date(String(label)), 'PPpp')
          }
          formatter={(value, name) => {
            const def = series.find((s) => s.key === String(name));
            const num = typeof value === 'number' ? value : Number(value);
            return [
              formatWithUnit(Number.isFinite(num) ? num : null, def?.unit ?? yUnit),
              def?.label ?? String(name),
            ];
          }}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        )}
        {referenceLines.map((rl, i) => (
          <ReferenceLine
            key={i}
            y={rl.value}
            stroke={rl.color ?? '#f59e0b'}
            strokeDasharray="4 4"
            label={{ value: rl.label ?? '', fontSize: 10, fill: rl.color }}
          />
        ))}
        {series.map((s, i) =>
          type === 'area' ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={s.color ?? colorAt(i)}
              fill={s.color ?? colorAt(i)}
              fillOpacity={0.18}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={s.color ?? colorAt(i)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}
