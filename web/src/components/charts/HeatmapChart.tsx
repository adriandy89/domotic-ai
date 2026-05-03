/**
 * Day × hour heatmap. Used for "when does motion happen", "occupancy patterns",
 * "energy peak hours", etc. Pure SVG — no Recharts dependency.
 *
 * Input: an array of { dayOfWeek: 0-6 (Sun=0), hour: 0-23, value: number }.
 * Cells without an entry are rendered as zero.
 */

import { useMemo } from 'react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface HeatmapPoint {
  dayOfWeek: number; // 0..6
  hour: number; // 0..23
  value: number;
}

interface HeatmapChartProps {
  data: HeatmapPoint[];
  height?: number;
  colorScale?: [string, string]; // [low, high]
  emptyLabel?: string;
}

export default function HeatmapChart({
  data,
  height = 220,
  colorScale = ['#1e293b', '#8b5cf6'],
  emptyLabel = 'No data',
}: HeatmapChartProps) {
  const grid = useMemo(() => {
    const matrix: number[][] = Array.from({ length: 7 }, () =>
      new Array(24).fill(0),
    );
    let max = 0;
    for (const p of data) {
      if (p.dayOfWeek < 0 || p.dayOfWeek > 6) continue;
      if (p.hour < 0 || p.hour > 23) continue;
      matrix[p.dayOfWeek][p.hour] = p.value;
      if (p.value > max) max = p.value;
    }
    return { matrix, max };
  }, [data]);

  if (!data || data.length === 0 || grid.max === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm rounded border border-dashed border-border/50"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const cellHeight = (height - 30) / 7;
  // Each row has 24 cells; we let CSS scale them via the SVG viewBox.
  const COLS = 24;
  const cellW = 100 / COLS;

  return (
    <div className="w-full" style={{ height }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
      >
        {grid.matrix.map((row, dayIdx) =>
          row.map((value, hourIdx) => {
            const t = grid.max > 0 ? value / grid.max : 0;
            const fill = mixColor(colorScale[0], colorScale[1], t);
            return (
              <rect
                key={`${dayIdx}-${hourIdx}`}
                x={hourIdx * cellW}
                y={dayIdx * cellHeight}
                width={cellW - 0.2}
                height={cellHeight - 1}
                fill={fill}
                rx={1}
              >
                <title>
                  {`${DAY_LABELS[dayIdx]} ${String(hourIdx).padStart(2, '0')}:00 — ${value}`}
                </title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground/70">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

function mixColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
