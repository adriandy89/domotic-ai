/**
 * Formatting helpers for the reports section.
 * All formatters tolerate `null`/`undefined` and return a "—" placeholder.
 */

export function formatNumber(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatWithUnit(
  value: number | null | undefined,
  unit?: string | null,
  digits = 1,
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
