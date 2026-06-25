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
  ScheduleDays,
} from 'generated/prisma/client';
import {
  IWatchdogJob,
  WATCHDOG_JOB_NAME,
  WATCHDOG_QUEUE_NAME,
  WATCHDOG_SCHEDULER_ID,
} from './watchdog-queue.constants';
import { isWithinExecutionWindow } from '../execution-window';

// Values that count as "active" for a presence/contact-style attribute when
// stored as a string in device_state_events.
const ACTIVE_VALUES = new Set(['true', 'on', '1', 'detected', 'open']);

type WatchdogRule = {
  id: string;
  name: string;
  all: boolean;
  created_at: Date;
  window_active: boolean;
  window_days: ScheduleDays[];
  window_all_day: boolean;
  window_start: number | null;
  window_end: number | null;
  user: { id: string; email: string; language: string | null };
  home: { id: string; name: string; unique_id: string; timezone: string | null };
  conditions: {
    id: string;
    device_id: string;
    attribute: string;
    operation: Operation;
    data: any;
  }[];
  results: {
    id: string;
    device_id: string | null;
    event: string;
    attribute: string | null;
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
    // Isolate failures per rule so one bad rule can't abort the whole scan.
    await Promise.all(
      rules.map((rule) =>
        this.evaluateRule(rule).catch((error: any) =>
          this.logger.error(`Watchdog rule ${rule.id} evaluation failed`, error),
        ),
      ),
    );
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
        window_active: true,
        window_days: true,
        window_all_day: true,
        window_start: true,
        window_end: true,
        user: { select: { id: true, email: true, language: true } },
        home: {
          select: { id: true, name: true, unique_id: true, timezone: true },
        },
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
            device_id: true,
            event: true,
            attribute: true,
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

    // In AND mode the rule must honour its NON-absence conditions too (e.g.
    // "no motion AND battery < 20%"). Those are value comparisons the watchdog
    // checks against the current sensor state — otherwise it would fire on
    // absence alone and break the AND semantics. (OR rules don't need this: the
    // event-driven engine fires the other branches independently.)
    if (rule.all) {
      const otherConditions = rule.conditions.filter(
        (c) =>
          c.operation !== Operation.INACTIVE &&
          c.operation !== Operation.STALE,
      );
      if (otherConditions.length > 0) {
        const othersHold = await this.evaluateValueConditions(otherConditions);
        if (!othersHold) {
          this.logger.verbose(
            `Rule ${rule.id} absence met but value conditions not satisfied`,
          );
          return;
        }
      }
    }

    // Respect the rule's "when to execute" window (home timezone). Outside it,
    // don't fire and don't record an execution — the episode stays armed and
    // will alert once the window opens while the condition still holds.
    if (!isWithinExecutionWindow(rule, new Date(), rule.home.timezone)) {
      this.logger.verbose(
        `Watchdog rule ${rule.id} met but outside its execution window`,
      );
      return;
    }

    const reason = results.find((r) => r.met && r.fresh)?.reason ?? '';
    this.logger.log(`Watchdog rule ${rule.id} firing (${reason})`);
    await this.fire(rule, reason);
  }

  /**
   * Evaluate the rule's non-absence (value) conditions against the latest known
   * sensor state. Used to honour AND semantics for mixed care rules. Every
   * condition must currently hold; a device with no data fails the check.
   */
  private async evaluateValueConditions(
    conditions: WatchdogRule['conditions'],
  ): Promise<boolean> {
    const deviceIds = [...new Set(conditions.map((c) => c.device_id))];
    const rows = await this.dbService.sensorDataLast.findMany({
      where: { device_id: { in: deviceIds } },
      select: { device_id: true, data: true },
    });
    const dataByDevice = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      dataByDevice.set(r.device_id, (r.data as Record<string, unknown>) ?? {});
    }
    return conditions.every((c) => {
      const data = dataByDevice.get(c.device_id);
      if (!data) return false; // no data → cannot confirm → AND fails
      return this.compareValue(c.operation, data[c.attribute], c.data?.value);
    });
  }

  /**
   * Numeric/equality comparator mirroring the event-driven engine, including the
   * numeric-string target coercion (the UI may persist "20" instead of 20).
   */
  private compareValue(
    operation: Operation,
    value: unknown,
    target: unknown,
  ): boolean {
    if (value === undefined || value === null) return false;
    if (target === undefined || target === null) return false;

    let t: unknown = target;
    if (
      typeof value === 'number' &&
      typeof t === 'string' &&
      t.trim() !== '' &&
      !Number.isNaN(Number(t))
    ) {
      t = Number(t);
    }

    switch (operation) {
      case Operation.EQ:
        return value === t;
      case Operation.GT:
        return (value as number) > (t as number);
      case Operation.GTE:
        return (value as number) >= (t as number);
      case Operation.LT:
        return (value as number) < (t as number);
      case Operation.LTE:
        return (value as number) <= (t as number);
      default:
        return false;
    }
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
   * *to* an active value, OR now if it is currently active, falling back to the
   * rule's creation time so a never-active sensor still triggers after N seconds.
   *
   * IMPORTANT: we must find the most recent *active* event, not just inspect the
   * single latest event. A sensor that goes active→inactive leaves an inactive
   * event on top; looking only at the latest one would miss the activity and
   * break the per-episode re-arm (the rule would alert once and never again).
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

    // Scan recent state events (newest first) and take the most recent one whose
    // value counts as "active". Bounded window keeps the query cheap; for any
    // realistic threshold the last active transition is well within it.
    const recentEvents = await this.dbService.deviceStateEvent.findMany({
      where: { device_id: condition.device_id, property: condition.attribute },
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: { value: true, timestamp: true },
    });
    const lastActiveEvent = recentEvents.find((e) =>
      this.isActive(e.value, condition),
    );
    if (lastActiveEvent) {
      candidates.push(lastActiveEvent.timestamp);
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
    // Only the watchdog's OWN alerts define an episode. A mixed rule (e.g.
    // no-motion + low-battery add-on) can also be fired by the event-driven
    // engine; those executions carry no `watchdog:` marker and must not be
    // mistaken for an absence alert, or a battery alarm would suppress the
    // next no-motion re-arm.
    const last = await this.dbService.ruleExecution.findFirst({
      where: {
        rule_id: ruleId,
        executed: true,
        error: { startsWith: 'watchdog:' },
      },
      orderBy: { triggered_at: 'desc' },
      select: { triggered_at: true },
    });
    return last?.triggered_at ?? null;
  }

  /**
   * Send a device command for a COMMAND result. Mirrors the event-driven
   * engine's command path so care rules can act, not only notify.
   */
  private async executeCommand(
    homeUniqueId: string,
    result: {
      id: string;
      device_id: string | null;
      attribute: string | null;
      data: any;
    },
  ): Promise<void> {
    if (!result.device_id) {
      this.logger.warn(`Watchdog command result ${result.id} has no device_id`);
      return;
    }

    const device = await this.dbService.device.findUnique({
      where: { id: result.device_id },
      select: { unique_id: true, organization_id: true },
    });
    if (!device) {
      this.logger.warn(`Device ${result.device_id} not found`);
      return;
    }

    const command = this.buildCommandUnified(result);
    this.logger.log(
      `Watchdog sending command to device ${device.unique_id}: ${JSON.stringify(command)}`,
    );

    await this.natsClient.emit('mqtt-core.publish-command', {
      homeUniqueId,
      deviceUniqueId: device.unique_id,
      organizationId: device.organization_id,
      command,
      source: 'rule',
    });
  }

  /** Build a command payload from a result (same shape as the engine). */
  private buildCommandUnified(result: {
    attribute: string | null;
    data: any;
  }): Record<string, any> {
    const command: Record<string, any> = {};
    if (result.attribute && result.data) {
      const dataValue = (result.data as { value: any })?.value;
      if (dataValue !== undefined) {
        command[result.attribute] = dataValue;
      }
    } else if (result.data) {
      return result.data as Record<string, any>;
    }
    return command;
  }

  private async fire(rule: WatchdogRule, reason: string): Promise<void> {
    let delivered = 0;
    for (const result of rule.results) {
      try {
        if (result.type === ResultType.NOTIFICATION) {
          await this.notify(rule, result);
          delivered++;
        } else if (result.type === ResultType.COMMAND) {
          // Care rules can also run an action (e.g. turn on a light / siren
          // when there's been no movement), not only notify.
          await this.executeCommand(rule.home.unique_id, result);
          delivered++;
        }
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
