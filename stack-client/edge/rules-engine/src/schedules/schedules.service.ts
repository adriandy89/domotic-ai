import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import parser from 'cron-parser';
import {
  EdgeSchedule,
  buildJobTiming,
  buildCommandUnified,
} from '../vendor/rules-evaluator';
import { RulesStoreService } from '../rules/rules-store.service';
import { CommandService } from '../command/command.service';
import { SqliteService } from '../store/sqlite.service';
import { makeDedupKey } from '../util/dedup';

/**
 * Runs `run_offline` schedules locally with self-rescheduling timers (no external
 * cron daemon). Rebuilt whenever a new bundle arrives (SyncService.reload).
 */
@Injectable()
export class SchedulesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulesService.name);
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: RulesStoreService,
    private readonly command: CommandService,
    private readonly sqlite: SqliteService,
  ) {}

  onModuleInit(): void {
    // Arm from whatever bundle was already persisted; SyncService.reload()
    // re-arms when a newer bundle arrives.
    this.reload();
  }

  onModuleDestroy(): void {
    this.clear();
  }

  reload(): void {
    this.clear();
    for (const schedule of this.store.schedules) {
      if (schedule.active) this.schedule(schedule);
    }
    this.logger.log(`Scheduled ${this.timers.size} offline schedule(s)`);
  }

  private clear(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(s: EdgeSchedule): void {
    const timing = buildJobTiming({
      frequency: s.frequency,
      date: s.date ? new Date(s.date) : null,
      days: s.days,
    });

    if (timing.kind === 'invalid') {
      this.logger.warn(`Schedule ${s.id} skipped: ${timing.reason}`);
      return;
    }

    if (timing.kind === 'once') {
      this.arm(s.id, timing.delayMs, () => this.fire(s));
      return;
    }

    // Repeating: compute the next occurrence and re-arm after each fire.
    const armNext = () => {
      let nextMs: number;
      try {
        const it = parser.parseExpression(timing.pattern, { tz: timing.tz });
        nextMs = it.next().toDate().getTime() - Date.now();
      } catch (e: any) {
        this.logger.error(`Bad cron for schedule ${s.id}: ${e?.message}`);
        return;
      }
      this.arm(s.id, Math.max(0, nextMs), () => {
        this.fire(s);
        armNext();
      });
    };
    armNext();
  }

  private arm(id: string, delayMs: number, fn: () => void): void {
    // setTimeout caps at ~24.8 days; chain for longer horizons.
    const MAX = 2 ** 31 - 1;
    if (delayMs > MAX) {
      this.timers.set(
        id,
        setTimeout(() => this.arm(id, delayMs - MAX, fn), MAX),
      );
    } else {
      this.timers.set(id, setTimeout(fn, delayMs));
    }
  }

  private fire(s: EdgeSchedule): void {
    let executed = 0;
    for (const action of s.actions) {
      if (!action.device_id) continue;
      const device = this.store.deviceById(action.device_id);
      if (!device) {
        this.logger.warn(`Schedule ${s.id}: unknown device ${action.device_id}`);
        continue;
      }
      const command = buildCommandUnified({
        attribute: action.attribute,
        data: action.data,
      });
      if (this.command.send(device, command)) executed++;
    }

    const triggeredAt = Date.now();
    this.sqlite.bufferExecution({
      dedup_key: makeDedupKey(s.id, null, 'schedule', s.id, triggeredAt),
      rule_id: s.id,
      device_id: null,
      triggered_at: triggeredAt,
      conditions_met: true,
      executed: executed > 0,
      results_count: executed,
      source: 'schedule',
      error: null,
    });
    this.logger.log(`Schedule ${s.id} fired (${executed} command(s))`);
  }
}
