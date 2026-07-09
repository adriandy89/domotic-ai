import { EvaluatorCondition, EvaluatorResult } from './types';
import { RuleType, ScheduleDays, ScheduleFrequency } from './enums';

/**
 * The offline rules bundle: the contract between the central serializer
 * (apps/rules-engine) and the edge engine (stack-client/edge/rules-engine).
 *
 * The central resolves everything the edge needs to act WITHOUT Postgres:
 * device `unique_id`/`protocol`/`attributes` (to build MQTT command messages) and
 * the home timezone (for execution windows / cron).
 */

export interface EdgeDeviceMeta {
  /** Internal device id (matches condition/result `device_id`). */
  id: string;
  /** MQTT identity (friendly_name / topic segment). */
  uniqueId: string;
  protocol: string;
  /** Raw device attributes/exposes — needed by protocol adapters. */
  attributes: unknown;
}

export interface EdgeRule {
  id: string;
  name: string;
  type: RuleType;
  active: boolean;
  all: boolean;
  interval: number;
  window_active: boolean;
  window_days: ScheduleDays[];
  window_all_day: boolean;
  window_start: number | null;
  window_end: number | null;
  created_at: string; // ISO
  conditions: EvaluatorCondition[];
  /** COMMAND results only — notifications are never sent offline. */
  results: EvaluatorResult[];
}

export interface EdgeScheduleAction {
  device_id: string | null;
  attribute: string;
  data: any;
}

export interface EdgeSchedule {
  id: string;
  name: string;
  active: boolean;
  date: string | null; // ISO
  frequency: ScheduleFrequency;
  days: ScheduleDays[];
  actions: EdgeScheduleAction[];
}

/**
 * Config for one power-monitoring appliance monitor, resolved for the edge host.
 * The edge runs the pure {@link stepApplianceState} machine over the source
 * plug's local power telemetry and publishes the derived `appliance_state`.
 */
export interface EdgeApplianceMonitor {
  id: string;
  /** MQTT unique_id of the source smart plug (matches the ingest device key). */
  sourceDeviceUniqueId: string;
  /** Derived virtual device unique_id → topic `.../wifi/{applianceUniqueId}/state`. */
  applianceUniqueId: string;
  powerField: string;
  runThresholdW: number;
  idleThresholdW: number;
  minRunSeconds: number;
  minFinishSeconds: number;
  active: boolean;
}

export interface EdgeBundle {
  homeUniqueId: string;
  organizationId: string;
  timezone: string | null;
  /** Monotonic version (epoch ms of the source change) for staleness checks. */
  version: number;
  devices: EdgeDeviceMeta[];
  rules: EdgeRule[];
  schedules: EdgeSchedule[];
  /** Optional (back-compat): power-monitoring appliance monitors for the edge host. */
  applianceMonitors?: EdgeApplianceMonitor[];
}

/** Signed envelope published to `home/id/{uuid}/edge/rules` (retained). */
export interface SignedEdgeBundle {
  bundle: EdgeBundle;
  /** HMAC-SHA256 of the canonical JSON of `bundle`, hex, keyed by EDGE_AUTH_TOKEN. */
  hmac: string;
}
