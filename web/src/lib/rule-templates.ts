// Care/Wellness rule templates surfaced as chips in the rule creation form.
// A template is just a preset for the existing CreateRuleRequest: it never
// introduces a new rule shape, so templated rules remain normal rules that are
// listed and editable on the Rules page.

import {
  Footprints,
  BatteryLow,
  WifiOff,
  AlarmClock,
  type LucideIcon,
} from 'lucide-react';
import type {
  Operation,
  NotificationChannel,
  WeekDay,
} from '../store/useRulesStore';

// ── "When to execute" window helpers ────────────────────────────────────────

/** Weekday chips for the execution-window picker (Mon-first display order). */
export const WEEK_DAYS: { value: WeekDay; key: string }[] = [
  { value: 'MONDAY', key: 'mon' },
  { value: 'TUESDAY', key: 'tue' },
  { value: 'WEDNESDAY', key: 'wed' },
  { value: 'THURSDAY', key: 'thu' },
  { value: 'FRIDAY', key: 'fri' },
  { value: 'SATURDAY', key: 'sat' },
  { value: 'SUNDAY', key: 'sun' },
];

/** "HH:MM" -> minute-of-day (0..1439). Returns null for blank/invalid input. */
export function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minute-of-day -> "HH:MM" (zero-padded). */
export function minutesToHhmm(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const m = ((minutes % 1440) + 1440) % 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Presence-style attributes a motion/occupancy sensor may expose. Covers the
 * common Zigbee2MQTT / HA-discovery / Tuya mmWave naming variants so the
 * "no motion" auto-resolver and device filter find the right attribute.
 */
export const PRESENCE_ATTRIBUTES = [
  'occupancy',
  'presence',
  'motion',
  'motion_state',
  'motion_detected',
  'presence_state',
  'occupied',
];

export type TemplateDeviceFilter = 'presence' | 'battery' | 'any';

export interface RuleTemplate {
  id: string;
  icon: LucideIcon;
  /** Mark templates aimed at the "living alone" care use case. */
  care: boolean;
  /** Restrict the device picker to relevant devices. */
  deviceFilter: TemplateDeviceFilter;
  /** Operation of the primary condition. */
  operation: Operation;
  /** Fixed attribute, or undefined to resolve from the chosen device. */
  attribute?: string;
  /** For INACTIVE: the "active" target value (e.g. occupancy === true). */
  activeValue?: boolean;
  /** Default duration (INACTIVE/STALE) in seconds. */
  defaultForSeconds?: number;
  /** Default numeric threshold (LT, e.g. battery). */
  defaultValue?: number;
  /** i18n keys (under the `rules` namespace). */
  labelKey: string;
  descKey: string;
  eventKey: string;
  nameKey: string;
}

const HOURS = 3600;
const DAYS = 24 * HOURS;

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'no-motion',
    icon: Footprints,
    care: true,
    deviceFilter: 'presence',
    operation: 'INACTIVE',
    activeValue: true,
    defaultForSeconds: 12 * HOURS,
    labelKey: 'rules.templates.noMotion.label',
    descKey: 'rules.templates.noMotion.desc',
    eventKey: 'rules.templates.noMotion.event',
    nameKey: 'rules.templates.noMotion.name',
  },
  {
    id: 'device-silent',
    icon: WifiOff,
    care: true,
    deviceFilter: 'any',
    operation: 'STALE',
    defaultForSeconds: 1 * DAYS,
    labelKey: 'rules.templates.silent.label',
    descKey: 'rules.templates.silent.desc',
    eventKey: 'rules.templates.silent.event',
    nameKey: 'rules.templates.silent.name',
  },
  {
    id: 'low-battery',
    icon: BatteryLow,
    care: true,
    deviceFilter: 'battery',
    operation: 'LT',
    attribute: 'battery',
    defaultValue: 20,
    labelKey: 'rules.templates.lowBattery.label',
    descKey: 'rules.templates.lowBattery.desc',
    eventKey: 'rules.templates.lowBattery.event',
    nameKey: 'rules.templates.lowBattery.name',
  },
  {
    id: 'daily-routine',
    icon: AlarmClock,
    care: true,
    // INACTIVE needs a presence-style attribute to track activity against.
    deviceFilter: 'presence',
    operation: 'INACTIVE',
    activeValue: true,
    defaultForSeconds: 16 * HOURS,
    labelKey: 'rules.templates.routine.label',
    descKey: 'rules.templates.routine.desc',
    eventKey: 'rules.templates.routine.event',
    nameKey: 'rules.templates.routine.name',
  },
];

/** Add-on condition specs toggled by switches in the care form. */
export const LOW_BATTERY_ADDON = {
  attribute: 'battery',
  operation: 'LT' as Operation,
  value: 20,
};
export const SILENT_ADDON = {
  operation: 'STALE' as Operation,
  forSeconds: 1 * DAYS,
};

export const DEFAULT_CARE_CHANNELS: NotificationChannel[] = ['EMAIL'];

// ── Duration helpers (number + unit) ────────────────────────────────────────

export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export const DURATION_UNIT_SECONDS: Record<DurationUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: HOURS,
  days: DAYS,
};

/** Pick the largest unit that represents `seconds` as a whole number. */
export function secondsToDuration(seconds: number): {
  value: number;
  unit: DurationUnit;
} {
  if (seconds > 0 && seconds % DAYS === 0)
    return { value: seconds / DAYS, unit: 'days' };
  if (seconds > 0 && seconds % HOURS === 0)
    return { value: seconds / HOURS, unit: 'hours' };
  return { value: Math.max(1, Math.round(seconds / 60)), unit: 'minutes' };
}

export function durationToSeconds(value: number, unit: DurationUnit): number {
  return Math.max(1, Math.round(value)) * DURATION_UNIT_SECONDS[unit];
}

/**
 * Display parts for a free-form seconds value (rule `interval`): largest whole
 * unit incl. seconds, allowing zero. Defaults to minutes for 0 (immediate).
 */
export function secondsToIntervalParts(seconds: number): {
  value: number;
  unit: DurationUnit;
} {
  if (!seconds || seconds <= 0) return { value: 0, unit: 'minutes' };
  if (seconds % DAYS === 0) return { value: seconds / DAYS, unit: 'days' };
  if (seconds % HOURS === 0) return { value: seconds / HOURS, unit: 'hours' };
  if (seconds % 60 === 0) return { value: seconds / 60, unit: 'minutes' };
  return { value: seconds, unit: 'seconds' };
}

export function isAbsenceOperation(op: Operation): boolean {
  return op === 'INACTIVE' || op === 'STALE';
}

/** A rule is a "care" rule if any condition uses an absence operator. */
export function isCareRule(operations: Operation[]): boolean {
  return operations.some(isAbsenceOperation);
}

/**
 * Detect a care/wellness rule from its conditions and results. A rule counts as
 * "care" when it either uses an absence operator (no-motion / silent) OR sends
 * to an external caregiver recipient (covers the low-battery care template,
 * whose `LT` operation is not an absence op).
 */
export function ruleHasCareSignals(rule: {
  conditions?: { operation: Operation }[] | null;
  results?: { data?: Record<string, unknown> | null }[] | null;
}): boolean {
  const absence = (rule.conditions || []).some((c) =>
    isAbsenceOperation(c.operation),
  );
  if (absence) return true;
  return (rule.results || []).some((r) => {
    const recipients = (r.data as { recipients?: unknown })?.recipients;
    return Array.isArray(recipients) && recipients.length > 0;
  });
}
