/**
 * Formatting helpers for the reports section.
 * All formatters tolerate `null`/`undefined` and return a "—" placeholder.
 */

/**
 * Pick a decimal count that keeps ~3 significant digits regardless of magnitude.
 * This avoids rendering small bucketed values like 0.04 kWh as "0" — a hardcoded
 * 1-decimal default loses signal on energy / current / VOC / pm-2.5 charts.
 */
function autoDigits(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  if (abs < 0.01) return 4;
  if (abs < 1) return 3;
  if (abs < 10) return 2;
  if (abs < 1000) return 1;
  return 0;
}

export function formatNumber(
  value: number | null | undefined,
  digits?: number,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const d = digits ?? autoDigits(value);
  return value.toLocaleString(undefined, {
    maximumFractionDigits: d,
    minimumFractionDigits: 0,
  });
}

export function formatWithUnit(
  value: number | null | undefined,
  unit?: string | null,
  digits?: number,
): string {
  const n = formatNumber(value, digits);
  if (n === '—') return n;
  return unit ? `${n} ${unit}` : n;
}

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })}%`;
}

export function formatCurrency(
  value: number | null | undefined,
  currency = 'USD',
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  try {
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: digits,
    });
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}

export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): { text: string; positive: boolean | null } {
  if (
    current == null ||
    previous == null ||
    previous === 0 ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return { text: '—', positive: null };
  }
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const sign = delta > 0 ? '+' : '';
  return {
    text: `${sign}${delta.toFixed(1)}%`,
    positive: delta >= 0,
  };
}
