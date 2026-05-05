import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatWithUnit } from '../../lib/format';
import {
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  colorAt,
} from './chart-tokens';
import type { SeriesDef } from './TimeSeriesChart';

interface BarChartCmpProps {
  data: Array<Record<string, string | number | null>>;
  xKey: string;
  series: SeriesDef[];
  height?: number;
  yUnit?: string;
  layout?: 'horizontal' | 'vertical';
  stacked?: boolean;
  emptyLabel?: string;
  xFormat?: (v: string) => string;
}

export default function BarChartCmp({
  data,
  xKey,
  series,
  height = 280,
  yUnit,
  layout = 'horizontal',
  stacked = false,
  emptyLabel = 'No data',
  xFormat,
}: BarChartCmpProps) {
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
        {layout === 'horizontal' ? (
          <>
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11, fill: AXIS_TICK }}
              tickFormatter={xFormat}
              stroke={AXIS_TICK}
            />
            <YAxis
              tick={{ fontSize: 11, fill: AXIS_TICK }}
              stroke={AXIS_TICK}
              width={48}
            />
          </>
        ) : (
          <>
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: AXIS_TICK }}
              stroke={AXIS_TICK}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 11, fill: AXIS_TICK }}
              stroke={AXIS_TICK}
              width={120}
            />
          </>
        )}
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          wrapperStyle={{ outline: 'none' }}
          formatter={(value, name) => {
            const def = series.find((s) => s.key === String(name));
            const num = typeof value === 'number' ? value : Number(value);
            return [
              formatWithUnit(
                Number.isFinite(num) ? num : null,
                def?.unit ?? yUnit,
              ),
              def?.label ?? String(name),
            ];
          }}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        )}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.key}
            fill={s.color ?? colorAt(i)}
            radius={[4, 4, 0, 0]}
            stackId={stacked ? 'stack' : undefined}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
