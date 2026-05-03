/**
 * Shared visual tokens for charts. Pull from CSS variables so that dark/light
 * theme switching just works. Fallbacks are provided in case the CSS theme
 * isn't loaded yet (e.g. during SSR or first paint).
 */

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
export const TOOLTIP_BG = 'var(--card, rgba(15,23,42,0.95))';
export const TOOLTIP_BORDER = 'var(--border, rgba(51,65,85,0.6))';

export const COMFORT_GREEN = '#10b981';
export const COMFORT_AMBER = '#f59e0b';
export const COMFORT_RED = '#ef4444';
