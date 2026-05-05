/**
 * Shared visual tokens for charts. Pull from CSS variables so that dark/light
 * theme switching just works. Fallbacks are provided in case the CSS theme
 * isn't loaded yet (e.g. during SSR or first paint).
 */
import type { CSSProperties } from 'react';

export const CHART_PALETTE = [
  '#8b5cf6', // violet-500
  '#22d3ee', // cyan-400
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#3b82f6', // blue-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
];

export function colorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

export const GRID_STROKE = 'rgba(148,163,184,0.15)';
export const AXIS_TICK = 'rgba(148,163,184,0.85)';
export const TOOLTIP_BG = 'rgba(15,23,42,0.92)';
export const TOOLTIP_BORDER = 'rgba(99,102,241,0.35)';

/**
 * Style preset shared by every Recharts <Tooltip>. Renders as a clearly readable
 * card on top of the chart: dark semi-transparent fill, soft backdrop blur, and
 * a ring border so the box stays visible whatever the series color is.
 */
export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: TOOLTIP_BG,
  border: `1px solid ${TOOLTIP_BORDER}`,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  color: 'rgb(241,245,249)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: 'rgb(148,163,184)',
  fontSize: 11,
  fontWeight: 500,
  marginBottom: 4,
};

export const TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: 'rgb(241,245,249)',
  fontSize: 12,
  padding: '2px 0',
};

export const TOOLTIP_CURSOR_STYLE = {
  stroke: 'rgba(148,163,184,0.45)',
  strokeWidth: 1,
  strokeDasharray: '3 3',
};

export const COMFORT_GREEN = '#10b981';
export const COMFORT_AMBER = '#f59e0b';
export const COMFORT_RED = '#ef4444';
