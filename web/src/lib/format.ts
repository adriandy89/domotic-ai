/**
 * Formatting helpers for the reports section.
 * All formatters tolerate `null`/`undefined` and return a "—" placeholder.
 *
 * Number/currency/date output is locale-aware: it follows the active i18n
 * language so the same values render correctly in English, Spanish and French.
 */
import { formatDistanceToNow } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, es, fr } from 'date-fns/locale';
import i18n from '../i18n';

const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, es, fr };

/** Active BCP-47 language tag for Intl APIs (falls back to English). */
function currentLng(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

/** date-fns Locale for the active language (for `format(date, fmt, { locale })`). */
export function dateFnsLocale(): Locale {
  return DATE_FNS_LOCALES[currentLng()] ?? enUS;
}

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
  return value.toLocaleString(currentLng(), {
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
  return `${value.toLocaleString(currentLng(), {
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
    return value.toLocaleString(currentLng(), {
      style: 'currency',
      currency,
      maximumFractionDigits: digits,
    });
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}

/** Locale-aware date/time formatter. */
export function formatDate(
  date: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
): string {
  if (date == null) return '—';
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '—';
  return new Intl.DateTimeFormat(currentLng(), options).format(value);
}

/** Locale-aware relative time, e.g. "5 minutes ago" / "hace 5 minutos". */
export function formatRelativeTime(
  date: Date | string | number | null | undefined,
): string {
  if (date == null) return '—';
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '—';
  return formatDistanceToNow(value, {
    locale: dateFnsLocale(),
    addSuffix: true,
  });
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
