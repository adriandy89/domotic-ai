import { Operation, ResultType, NotificationChannel } from './enums';

/**
 * Minimal, infrastructure-free shapes the evaluator operates on. Both the central
 * `rules-engine` (whose Prisma rows are structurally compatible) and the edge engine
 * (which reads these from SQLite) pass objects matching these interfaces.
 */

export interface EvaluatorCondition {
  id: string;
  device_id: string;
  attribute: string;
  operation: Operation;
  /** JSON payload. Typically `{ value: any, forSeconds?: number }`. */
  data: any;
  /**
   * AND-mode ("all") rules only: when false, incoming data for this condition never
   * initiates rule evaluation — it only participates as an evaluator against its
   * last-known state. Missing = true (back-compat with old bundles/rows). The pure
   * evaluator ignores this field; engines gate on it before evaluating.
   */
  trigger?: boolean;
}

export interface EvaluatorResult {
  id: string;
  device_id: string | null;
  event: string;
  attribute: string | null;
  data: any;
  type: ResultType;
  channel: NotificationChannel[];
  resend_after: number | null;
}

/**
 * "When to execute" gate for a rule. A rule may only ACT when "now" — evaluated in
 * the home's timezone — falls within the allowed weekdays and time-of-day range.
 */
export interface ExecutionWindow {
  window_active: boolean;
  window_days: string[]; // ScheduleDays values
  window_all_day: boolean;
  window_start: number | null; // minute-of-day 0..1439
  window_end: number | null; // minute-of-day 0..1439
}
