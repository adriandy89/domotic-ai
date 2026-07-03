import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  EdgeRule,
  EvaluatorCondition,
  Operation,
  ResultType,
  buildCommandUnified,
  isWithinExecutionWindow,
  isStale,
  isInactive,
  isFresh,
  isActiveValue,
  parseForSeconds,
} from '../vendor/rules-evaluator';
import { EDGE_CONFIG, EdgeConfig } from '../config';
import { RulesStoreService } from '../rules/rules-store.service';
import { SqliteService } from '../store/sqlite.service';
import { CommandService } from '../command/command.service';
import { makeDedupKey } from '../util/dedup';

/**
 * Local care watchdog. Periodically scans absence rules (STALE/INACTIVE) against
 * SQLite state and fires their COMMAND results — offline, without the false
 * positives the central watchdog would emit during an internet outage.
 */
@Injectable()
export class WatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WatchdogService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(EDGE_CONFIG) private readonly config: EdgeConfig,
    private readonly store: RulesStoreService,
    private readonly sqlite: SqliteService,
    private readonly command: CommandService,
  ) {}

  onModuleInit(): void {
    const ms = Math.max(30, this.config.watchdogIntervalSeconds) * 1000;
    this.timer = setInterval(() => this.scan(), ms);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  scan(): void {
    this.sqlite.pruneStateEvents(7 * 24 * 60 * 60 * 1000);
    for (const rule of this.store.rules) {
      if (!rule.active) continue;
      const absence = rule.conditions.filter(
        (c) =>
          c.operation === Operation.STALE || c.operation === Operation.INACTIVE,
      );
      if (absence.length === 0) continue;
      try {
        this.evaluate(rule, absence);
      } catch (e: any) {
        this.logger.error(`Watchdog rule ${rule.id} failed: ${e?.message}`);
      }
    }
  }

  private evaluate(rule: EdgeRule, absence: EvaluatorCondition[]): void {
    const lastAlertMs = this.lastAlert(rule.id);
    const results = absence.map((c) => this.evalCondition(rule, c, lastAlertMs));

    const met = rule.all
      ? results.every((r) => r.met) && results.some((r) => r.fresh)
      : results.some((r) => r.met && r.fresh);
    if (!met) return;

    if (!isWithinExecutionWindow(rule, new Date(), this.store.timezone)) {
      this.logger.verbose(`Watchdog rule ${rule.id} outside its window`);
      return;
    }

    let executed = 0;
    for (const result of rule.results) {
      if (result.type !== ResultType.COMMAND || !result.device_id) continue;
      const target = this.store.deviceById(result.device_id);
      if (!target) continue;
      if (this.command.send(target, buildCommandUnified(result))) executed++;
    }

    const now = Date.now();
    this.setLastAlert(rule.id, now);
    this.sqlite.bufferExecution({
      dedup_key: makeDedupKey(rule.id, null, 'watchdog', results[0]?.reason, now),
      rule_id: rule.id,
      device_id: null,
      triggered_at: now,
      conditions_met: true,
      executed: executed > 0,
      results_count: executed,
      source: 'watchdog',
      error: `watchdog:${results.find((r) => r.met)?.reason ?? 'absence'}`,
    });
    this.logger.log(`Watchdog rule ${rule.id} fired (${executed} command(s))`);
  }

  private evalCondition(
    rule: EdgeRule,
    condition: EvaluatorCondition,
    lastAlertMs: number | null,
  ): { met: boolean; fresh: boolean; reason: string } {
    const forSeconds = parseForSeconds(condition.data);
    if (forSeconds === null) return { met: false, fresh: false, reason: '' };
    const now = Date.now();
    const thresholdMs = forSeconds * 1000;
    const createdAt = new Date(rule.created_at).getTime();
    const device = this.store.deviceById(condition.device_id);
    if (!device) return { met: false, fresh: false, reason: '' };
    const state = this.sqlite.getDeviceState(device.uniqueId);

    if (condition.operation === Operation.STALE) {
      const lastReport = state?.updated_at ?? createdAt;
      return {
        met: isStale(now, lastReport, thresholdMs),
        fresh: isFresh(lastAlertMs, lastReport),
        reason: 'stale',
      };
    }

    // INACTIVE: most recent moment the attribute was "active".
    const target = (condition.data as { value?: unknown })?.value;
    const candidates: number[] = [createdAt];
    if (
      state &&
      isActiveValue(state.data[condition.attribute], target)
    ) {
      candidates.push(state.updated_at);
    }
    const lastActiveEvent = this.sqlite
      .recentStateEvents(device.uniqueId, condition.attribute)
      .find((e) => isActiveValue(e.value, target));
    if (lastActiveEvent) candidates.push(lastActiveEvent.timestamp);
    const lastActive = Math.max(...candidates);

    return {
      met: isInactive(now, lastActive, thresholdMs),
      fresh: isFresh(lastAlertMs, lastActive),
      reason: 'inactive',
    };
  }

  private lastAlert(ruleId: string): number | null {
    const v = this.sqlite.kvGet(`watchdog:lastalert:${ruleId}`);
    return v ? Number(v) : null;
  }

  private setLastAlert(ruleId: string, ms: number): void {
    this.sqlite.kvSet(`watchdog:lastalert:${ruleId}`, String(ms));
  }
}
