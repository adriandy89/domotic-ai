import { Injectable, Logger } from '@nestjs/common';
import {
  EdgeRule,
  ResultType,
  RuleType,
  evaluateRule,
  isWithinExecutionWindow,
  buildCommandUnified,
} from '../vendor/rules-evaluator';
import { RulesStoreService } from '../rules/rules-store.service';
import { SqliteService } from '../store/sqlite.service';
import { CommandService } from '../command/command.service';
import { makeDedupKey } from '../util/dedup';

/**
 * Event-driven rule evaluation for the edge. Mirrors the central engine's path
 * (shared pure evaluator) but reads cross-device state from SQLite and only ever
 * runs COMMAND results — notifications are never sent offline.
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);
  /**
   * Pending delayed (interval) fires, keyed by rule id. Mirrors the central
   * engine's `rule:{id}:pending-job` contract: one timer per rule (no stacking
   * while conditions keep matching), CANCELLED as soon as an event makes the
   * rule evaluate false, so the countdown restarts from zero on the next match.
   */
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: RulesStoreService,
    private readonly sqlite: SqliteService,
    private readonly command: CommandService,
  ) {}

  private onceKey(ruleId: string): string {
    return `once:fired:${ruleId}`;
  }

  /** Called by ingest whenever a device reports new telemetry. */
  onTelemetry(deviceUniqueId: string, data: Record<string, any>): void {
    const device = this.store.deviceByUniqueId(deviceUniqueId);
    if (!device) return; // device not referenced by any offline rule

    for (const rule of this.store.rulesForDevice(device.id)) {
      try {
        this.evaluate(rule, device.id, data);
      } catch (e: any) {
        this.logger.error(`Rule ${rule.id} failed: ${e?.message}`);
      }
    }
  }

  private evaluate(
    rule: EdgeRule,
    currentDeviceId: string,
    data: Record<string, any>,
  ): void {
    // Build cross-device data (ALL mode) from local SQLite state.
    const otherData = new Map<string, Record<string, any>>();
    if (rule.all) {
      for (const c of rule.conditions) {
        if (c.device_id === currentDeviceId || otherData.has(c.device_id))
          continue;
        const meta = this.store.deviceById(c.device_id);
        const state = meta && this.sqlite.getDeviceState(meta.uniqueId);
        if (state) otherData.set(c.device_id, state.data);
      }
    }

    // A ONCE rule fires a single time ever; the central deactivates it, but for
    // edge homes the central never sees it fire, so we track it locally.
    if (rule.type === RuleType.ONCE && this.sqlite.kvGet(this.onceKey(rule.id))) {
      return;
    }

    if (!evaluateRule(rule, currentDeviceId, data, otherData)) {
      // Conditions broke: a pending delayed fire is no longer valid (e.g.
      // presence returned during the "off after 1 min" countdown). Cancel it —
      // the next matching event arms a fresh timer with the full delay.
      const timer = this.pending.get(rule.id);
      if (timer) {
        clearTimeout(timer);
        this.pending.delete(rule.id);
        this.logger.log(
          `Rule ${rule.id}: conditions no longer met — pending delayed execution cancelled`,
        );
      }
      return;
    }

    const delayMs = Math.max(0, (rule.interval ?? 0) * 1000);
    if (delayMs === 0) {
      this.fire(rule, currentDeviceId);
    } else if (!this.pending.has(rule.id)) {
      // Don't stack timers while the conditions keep matching during the delay
      // (like central, the original fire time stands until met/cancelled).
      const timer = setTimeout(() => {
        this.pending.delete(rule.id);
        this.fire(rule, currentDeviceId);
      }, delayMs);
      timer.unref();
      this.pending.set(rule.id, timer);
    }
  }

  /**
   * Cancel every pending delayed fire. Called when a new rules bundle replaces
   * the current one: armed timers hold closures over the OLD rule objects and
   * must not fire a rule that may have been edited, disabled or removed.
   */
  clearPending(): void {
    if (this.pending.size === 0) return;
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.logger.log(
      `Cleared ${this.pending.size} pending delayed execution(s) (bundle replaced)`,
    );
    this.pending.clear();
  }

  private fire(rule: EdgeRule, triggerDeviceId: string): void {
    if (
      !isWithinExecutionWindow(rule, new Date(), this.store.timezone)
    ) {
      this.logger.verbose(`Rule ${rule.id} outside its execution window`);
      return;
    }

    if (rule.type === RuleType.ONCE) {
      this.sqlite.kvSet(this.onceKey(rule.id), String(Date.now()));
    }

    let executed = 0;
    for (const result of rule.results) {
      if (result.type !== ResultType.COMMAND || !result.device_id) continue;
      const target = this.store.deviceById(result.device_id);
      if (!target) {
        this.logger.warn(`Rule ${rule.id}: unknown target ${result.device_id}`);
        continue;
      }
      const command = buildCommandUnified(result);
      if (this.command.send(target, command)) executed++;
    }

    const triggeredAt = Date.now();
    this.sqlite.bufferExecution({
      dedup_key: makeDedupKey(
        rule.id,
        triggerDeviceId,
        rule.results.map((r) => r.attribute ?? '').join(','),
        rule.results.map((r) => buildCommandUnified(r)),
        triggeredAt,
      ),
      rule_id: rule.id,
      device_id: triggerDeviceId,
      triggered_at: triggeredAt,
      conditions_met: true,
      executed: executed > 0,
      results_count: executed,
      source: 'rule',
      error: null,
    });
    this.logger.log(`Rule ${rule.id} fired (${executed} command(s))`);
  }
}
