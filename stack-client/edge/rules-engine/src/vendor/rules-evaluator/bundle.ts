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

export interface EdgeBundle {
  homeUniqueId: string;
  organizationId: string;
  timezone: string | null;
  /** Monotonic version (epoch ms of the source change) for staleness checks. */
  version: number;
  devices: EdgeDeviceMeta[];
  rules: EdgeRule[];
  schedules: EdgeSchedule[];
}

/** Signed envelope published to `home/id/{uuid}/edge/rules` (retained). */
export interface SignedEdgeBundle {
  bundle: EdgeBundle;
  /** HMAC-SHA256 of the canonical JSON of `bundle`, hex, keyed by EDGE_AUTH_TOKEN. */
  hmac: string;
}
