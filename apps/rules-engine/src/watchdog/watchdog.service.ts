import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  NotificationChannel,
  Operation,
  ResultType,
} from 'generated/prisma/client';
import {
  IWatchdogJob,
  WATCHDOG_JOB_NAME,
  WATCHDOG_QUEUE_NAME,
  WATCHDOG_SCHEDULER_ID,
} from './watchdog-queue.constants';

// Values that count as "active" for a presence/contact-style attribute when
// stored as a string in device_state_events.
const ACTIVE_VALUES = new Set(['true', 'on', '1', 'detected', 'open']);

type WatchdogRule = {
  id: string;
  name: string;
  all: boolean;
  created_at: Date;
  user: { id: string; email: string; language: string | null };
  home: { id: string; name: string };
  conditions: {
    id: string;
    device_id: string;
    attribute: string;
    operation: Operation;
    data: any;
  }[];
  results: {
    id: string;
    event: string;
    type: ResultType;
    data: any;
    channel: NotificationChannel[];
  }[];
};

/**
 * Periodic "absence detector" for care/wellness rules. The event-driven rules
 * engine only fires when sensor data *arrives*; it cannot detect that nothing
 * happened. This watchdog scans on a timer and fires rules whose conditions are
 * `INACTIVE` (an attribute hasn't been active for N seconds) or `STALE` (a
 * device hasn't reported at all for N seconds).
 *
 * Re-arm: each ongoing "episode" alerts once. A rule re-arms when the sensor
 * recovers (reports again / detects activity) after the last alert.
 */
@Injectable()
export class WatchdogService implements OnModuleInit {
  private readonly logger = new Logger(WatchdogService.name);
  private readonly intervalMs: number;

  constructor(
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
    private readonly config: ConfigService,
    @InjectQueue(WATCHDOG_QUEUE_NAME)
    private readonly watchdogQueue: Queue<IWatchdogJob>,
  ) {
    const seconds = this.config.get<number>('WATCHDOG_INTERVAL_SECONDS', 300);
    this.intervalMs = Math.max(30, Number(seconds)) * 1000;
  }

  async onModuleInit() {
    try {
      await this.watchdogQueue.upsertJobScheduler(
        WATCHDOG_SCHEDULER_ID,
        { every: this.intervalMs },
        {
          name: WATCHDOG_JOB_NAME,
          data: { tick: true },
          opts: { removeOnComplete: true, removeOnFail: { age: 3600 } },
        },
      );
      this.logger.log(
        `Watchdog scan scheduled every ${this.intervalMs / 1000}s`,
      );
    } catch (error: any) {
      this.logger.error('Failed to schedule watchdog scan', error);
    }
  }

  /** One scan pass: evaluate every active absence/silence rule. */
  async scan(): Promise<void> {
    const rules = await this.loadWatchdogRules();
    if (rules.length === 0) {
      this.logger.verbose('No watchdog rules to evaluate');
      return;
    }
    this.logger.log(`Evaluating ${rules.length} watchdog rule(s)`);
    await Promise.all(rules.map((rule) => this.evaluateRule(rule)));
  }

  private async loadWatchdogRules(): Promise<WatchdogRule[]> {
    return this.dbService.rule.findMany({
      where: {
        active: true,
        conditions: {
          some: { operation: { in: [Operation.INACTIVE, Operation.STALE] } },
        },
      },
      select: {
        id: true,
        name: true,
        all: true,
        created_at: true,
        user: { select: { id: true, email: true, language: true } },
        home: { select: { id: true, name: true } },
        conditions: {
          select: {
            id: true,
            device_id: true,
            attribute: true,
            operation: true,
            data: true,
          },
        },
        results: {
          select: {
            id: true,
            event: true,
            type: true,
            data: true,
            channel: true,
          },
        },
      },
    });
  }

  private async evaluateRule(rule: WatchdogRule): Promise<void> {
    // Only the absence operators are the watchdog's job; battery/threshold
    // conditions on the same rule are handled by the event-driven engine.
    const absenceConditions = rule.conditions.filter(
      (c) =>
        c.operation === Operation.INACTIVE || c.operation === Operation.STALE,
    );
    if (absenceConditions.length === 0) return;

    const lastAlertAt = await this.lastAlertAt(rule.id);

    const results = await Promise.all(
      absenceConditions.map((c) => this.evaluateCondition(rule, c, lastAlertAt)),
    );

    // `all` (AND) requires every absence condition met; otherwise any one fires.
    const met = rule.all
      ? results.every((r) => r.met)
      : results.some((r) => r.met);
    const shouldFire = rule.all
      ? results.every((r) => r.met) && results.some((r) => r.fresh)
      : results.some((r) => r.met && r.fresh);

    if (!met) return;

    if (!shouldFire) {
      this.logger.verbose(
        `Rule ${rule.id} met but already alerted this episode`,
      );
      return;
    }

    const reason = results.find((r) => r.met && r.fresh)?.reason ?? '';
    this.logger.log(`Watchdog rule ${rule.id} firing (${reason})`);
    await this.fire(rule, reason);
  }

  /**
   * Evaluate one absence condition.
   * - `met`: the condition currently holds (e.g. no motion for N seconds).
   * - `fresh`: the sensor has recovered since the last alert, so we may re-fire.
   */
  private async evaluateCondition(
    rule: WatchdogRule,
    condition: WatchdogRule['conditions'][number],
    lastAlertAt: Date | null,
  ): Promise<{ met: boolean; fresh: boolean; reason: string }> {
    const forSeconds = Number(condition.data?.forSeconds);
    if (!Number.isFinite(forSeconds) || forSeconds <= 0) {
      this.logger.warn(
        `Condition ${condition.id} has no valid data.forSeconds; skipping`,
      );
      return { met: false, fresh: false, reason: '' };
    }
    const now = Date.now();
    const thresholdMs = forSeconds * 1000;

    if (condition.operation === Operation.STALE) {
      const last = await this.dbService.sensorDataLast.findUnique({
        where: { device_id: condition.device_id },
        select: { timestamp: true },
      });
      // No data ever → measure silence from when the rule was created.
      const lastReport = last?.timestamp ?? rule.created_at;
      const met = now - lastReport.getTime() > thresholdMs;
      // Re-arm only once the device reports again after our last alert.
      const fresh = !lastAlertAt || lastReport > lastAlertAt;
      return { met, fresh, reason: 'stale' };
    }

    // INACTIVE: attribute hasn't reached its active value for `forSeconds`.
    const lastActive = await this.lastActiveAt(rule, condition);
    const met = now - lastActive.getTime() > thresholdMs;
    // Re-arm once activity resumes after the last alert.
    const fresh = !lastAlertAt || lastActive > lastAlertAt;
    return { met, fresh, reason: 'inactive' };
  }

  /**
   * Most recent moment the attribute was "active": the latest state-transition
   * to an active value, OR now if it is currently active, falling back to the
   * rule's creation time so a never-active sensor still triggers after N seconds.
   */
  private async lastActiveAt(
    rule: WatchdogRule,
    condition: WatchdogRule['conditions'][number],
  ): Promise<Date> {
    const candidates: Date[] = [rule.created_at];

    const current = await this.dbService.sensorDataLast.findUnique({
      where: { device_id: condition.device_id },
      select: { data: true, timestamp: true },
    });
    const currentValue = (current?.data as Record<string, unknown>)?.[
      condition.attribute
    ];
    if (current && this.isActive(currentValue, condition)) {
      candidates.push(current.timestamp);
    }

    const lastEvent = await this.dbService.deviceStateEvent.findFirst({
      where: { device_id: condition.device_id, property: condition.attribute },
      orderBy: { timestamp: 'desc' },
      select: { value: true, timestamp: true },
    });
    if (lastEvent && this.isActive(lastEvent.value, condition)) {
      candidates.push(lastEvent.timestamp);
    }

    return candidates.reduce((a, b) => (a > b ? a : b));
  }

  private isActive(
    value: unknown,
    condition: WatchdogRule['conditions'][number],
  ): boolean {
    const v = String(value).toLowerCase();
    const target = condition.data?.value;
    if (target !== undefined && target !== null && target !== '') {
      // Match the configured target, but also accept the canonical "active"
      // tokens so a sensor reporting "ON" still counts when the target is `true`.
      if (v === String(target).toLowerCase()) return true;
    }
    return ACTIVE_VALUES.has(v);
  }

  private async lastAlertAt(ruleId: string): Promise<Date | null> {
    const last = await this.dbService.ruleExecution.findFirst({
      where: { rule_id: ruleId, executed: true },
      orderBy: { triggered_at: 'desc' },
      select: { triggered_at: true },
    });
    return last?.triggered_at ?? null;
  }

  private async fire(rule: WatchdogRule, reason: string): Promise<void> {
    let delivered = 0;
    for (const result of rule.results) {
      if (result.type !== ResultType.NOTIFICATION) continue;
      try {
        await this.notify(rule, result);
        delivered++;
      } catch (error: any) {
        this.logger.error(
          `Error delivering watchdog result ${result.id}: ${error}`,
        );
      }
    }

    await this.dbService.rule.update({
      where: { id: rule.id },
      data: { timestamp: new Date() },
    });

    try {
      await this.dbService.ruleExecution.create({
        data: {
          rule_id: rule.id,
          device_id: null,
          conditions_met: true,
          executed: true,
          results_count: delivered,
          error: reason ? `watchdog:${reason}` : null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `rule_executions insert failed: ${(err as Error).message}`,
      );
    }
  }

  private async notify(
    rule: WatchdogRule,
    result: WatchdogRule['results'][number],
  ): Promise<void> {
    const user = await this.dbService.user.findUnique({
      where: { id: rule.user.id },
      select: {
        id: true,
        channels: true,
        telegram_chat_id: true,
        email: true,
        language: true,
      },
    });
    if (!user) {
      this.logger.warn(`User ${rule.user.id} not found for watchdog rule`);
      return;
    }

    const payload = {
      ruleId: rule.id,
      ruleName: rule.name,
      resultId: result.id,
      event: result.event,
      userId: rule.user.id,
      homeId: rule.home.id,
      homeName: rule.home.name,
      language: user.language,
    };

    const resultChannels = result.channel || [];
    const userChannels = user.channels || [];

    // External caregiver recipients (email) — sent regardless of the owner's
    // own channel preferences.
    const recipients = Array.isArray(result.data?.recipients)
      ? (result.data.recipients as string[]).filter(Boolean)
      : [];

    if (resultChannels.includes(NotificationChannel.EMAIL)) {
      for (const email of recipients) {
        await this.natsClient.emit('notification.email', { ...payload, email });
      }
    }

    // Owner's own enabled channels.
    const matching = resultChannels.filter((ch) => userChannels.includes(ch));
    for (const channel of matching) {
      if (channel === NotificationChannel.EMAIL && user.email) {
        await this.natsClient.emit('notification.email', {
          ...payload,
          email: user.email,
        });
      } else if (
        channel === NotificationChannel.TELEGRAM &&
        user.telegram_chat_id
      ) {
        await this.natsClient.emit('notification.telegram', {
          ...payload,
          chatId: user.telegram_chat_id,
        });
      }
    }
  }
}
