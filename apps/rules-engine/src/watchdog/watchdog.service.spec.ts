import { WatchdogService } from './watchdog.service';
import {
  NotificationChannel,
  Operation,
  ResultType,
} from 'generated/prisma/client';

/**
 * Watchdog (absence/silence) rules — exhaustive logic coverage.
 *
 * The watchdog is the only place that can fire "nothing happened" alarms
 * (INACTIVE / STALE). These tests pin down:
 *  - active-value detection across protocols (boolean / "ON" / "detected" ...)
 *  - INACTIVE vs STALE "met" thresholds
 *  - the per-episode RE-ARM contract (regression guard for the "alerts once then
 *    never again" bug: lastActiveAt must find the most recent *active* event,
 *    not just inspect the single latest one)
 *  - AND / OR (`all`) combination semantics
 *  - notification fan-out (owner channels + external caregiver recipients)
 */

const SECOND = 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

type AnyMock = jest.Mock;

function makeDb() {
  return {
    rule: {
      findMany: jest.fn().mockResolvedValue([]) as AnyMock,
      update: jest.fn().mockResolvedValue({}) as AnyMock,
    },
    ruleExecution: {
      findFirst: jest.fn().mockResolvedValue(null) as AnyMock,
      create: jest.fn().mockResolvedValue({}) as AnyMock,
    },
    sensorDataLast: {
      findUnique: jest.fn().mockResolvedValue(null) as AnyMock,
      findMany: jest.fn().mockResolvedValue([]) as AnyMock,
    },
    deviceStateEvent: {
      findMany: jest.fn().mockResolvedValue([]) as AnyMock,
    },
    device: {
      findUnique: jest.fn().mockResolvedValue({
        unique_id: 'dev-unique',
        organization_id: 'org1',
      }) as AnyMock,
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u1',
        channels: [NotificationChannel.EMAIL],
        telegram_chat_id: null,
        email: 'owner@example.com',
        language: 'es',
      }) as AnyMock,
    },
  };
}

function makeService() {
  const db = makeDb();
  const nats = { emit: jest.fn().mockResolvedValue(undefined) as AnyMock };
  const config = { get: jest.fn().mockReturnValue(300) as AnyMock };
  const queue = { upsertJobScheduler: jest.fn() as AnyMock };
  const service = new WatchdogService(
    db as any,
    nats as any,
    config as any,
    queue as any,
  );
  return { service, db, nats };
}

function inactiveRule(overrides: Record<string, any> = {}) {
  return {
    id: 'r1',
    name: 'No motion',
    all: true,
    created_at: ago(48 * 3600 * SECOND), // long ago
    user: { id: 'u1', email: 'owner@example.com', language: 'es' },
    home: { id: 'h1', name: 'Home', unique_id: 'home-unique' },
    conditions: [
      {
        id: 'c1',
        device_id: 'd1',
        attribute: 'occupancy',
        operation: Operation.INACTIVE,
        data: { forSeconds: 60, value: true },
      },
    ],
    results: [
      {
        id: 'res1',
        event: 'No motion detected',
        type: ResultType.NOTIFICATION,
        data: { recipients: ['caregiver@example.com'] },
        channel: [NotificationChannel.EMAIL],
      },
    ],
    ...overrides,
  };
}

describe('WatchdogService.isActive', () => {
  const { service } = makeService();
  const isActive = (value: unknown, target?: unknown) =>
    (service as any).isActive(value, { data: { value: target } });

  it.each([
    [true, true, true],
    ['true', true, true],
    ['ON', true, true], // HA-style string, canonical active token
    ['on', undefined, true],
    ['1', undefined, true],
    ['detected', undefined, true],
    ['open', undefined, true],
    [false, true, false],
    ['false', true, false],
    ['OFF', true, false],
    ['closed', undefined, false],
    [null, true, false],
    [undefined, true, false],
  ])('value=%p target=%p -> %p', (value, target, expected) => {
    expect(isActive(value, target)).toBe(expected);
  });

  it('treats a non-canonical configured target as active when matched', () => {
    // e.g. a contact sensor where the "active" state is the string "home"
    expect(isActive('home', 'home')).toBe(true);
    expect(isActive('away', 'home')).toBe(false);
  });
});

describe('WatchdogService.lastActiveAt (re-arm regression)', () => {
  it('returns the most recent ACTIVE event even when a later inactive event exists', async () => {
    // This is the core of the "alerts once then never again" bug: a sensor that
    // went active->inactive leaves an inactive event on top. The function must
    // still surface the earlier active transition so the rule can re-arm.
    const { service, db } = makeService();
    db.sensorDataLast.findUnique.mockResolvedValue({
      data: { occupancy: false },
      timestamp: ago(10 * SECOND),
    });
    const activeAt = ago(150 * SECOND);
    db.deviceStateEvent.findMany.mockResolvedValue([
      { value: 'false', timestamp: ago(140 * SECOND) }, // newest, inactive
      { value: 'true', timestamp: activeAt }, // older, ACTIVE
    ]);

    const rule = inactiveRule();
    const result = await (service as any).lastActiveAt(rule, rule.conditions[0]);
    expect(result.getTime()).toBe(activeAt.getTime());
  });

  it('falls back to rule.created_at when the sensor was never active', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findUnique.mockResolvedValue({
      data: { occupancy: false },
      timestamp: ago(10 * SECOND),
    });
    db.deviceStateEvent.findMany.mockResolvedValue([
      { value: 'false', timestamp: ago(140 * SECOND) },
    ]);
    const rule = inactiveRule({ created_at: ago(200 * SECOND) });
    const result = await (service as any).lastActiveAt(rule, rule.conditions[0]);
    expect(result.getTime()).toBe(rule.created_at.getTime());
  });

  it('uses the current live value when the sensor is active right now', async () => {
    const { service, db } = makeService();
    const nowish = ago(2 * SECOND);
    db.sensorDataLast.findUnique.mockResolvedValue({
      data: { occupancy: true },
      timestamp: nowish,
    });
    db.deviceStateEvent.findMany.mockResolvedValue([]);
    const rule = inactiveRule();
    const result = await (service as any).lastActiveAt(rule, rule.conditions[0]);
    expect(result.getTime()).toBe(nowish.getTime());
  });
});

describe('WatchdogService.evaluateCondition', () => {
  it('INACTIVE: met when inactive longer than the threshold', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findUnique.mockResolvedValue({
      data: { occupancy: false },
      timestamp: ago(10 * SECOND),
    });
    db.deviceStateEvent.findMany.mockResolvedValue([]);
    const rule = inactiveRule();
    const r = await (service as any).evaluateCondition(
      rule,
      rule.conditions[0],
      null,
    );
    expect(r.met).toBe(true);
    expect(r.fresh).toBe(true);
    expect(r.reason).toBe('inactive');
  });

  it('INACTIVE: not fresh once already alerted and no activity since', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findUnique.mockResolvedValue({
      data: { occupancy: false },
      timestamp: ago(10 * SECOND),
    });
    db.deviceStateEvent.findMany.mockResolvedValue([]);
    const rule = inactiveRule({ created_at: ago(300 * SECOND) });
    const lastAlert = ago(120 * SECOND); // alerted after creation, no activity since
    const r = await (service as any).evaluateCondition(
      rule,
      rule.conditions[0],
      lastAlert,
    );
    expect(r.met).toBe(true);
    expect(r.fresh).toBe(false);
  });

  it('INACTIVE: fresh again after activity resumes past the last alert', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findUnique.mockResolvedValue({
      data: { occupancy: false },
      timestamp: ago(5 * SECOND),
    });
    db.deviceStateEvent.findMany.mockResolvedValue([
      { value: 'false', timestamp: ago(140 * SECOND) },
      { value: 'true', timestamp: ago(150 * SECOND) }, // activity after the alert
    ]);
    const rule = inactiveRule();
    const lastAlert = ago(200 * SECOND);
    const r = await (service as any).evaluateCondition(
      rule,
      rule.conditions[0],
      lastAlert,
    );
    expect(r.met).toBe(true); // inactive 150s > 60s threshold
    expect(r.fresh).toBe(true); // active at 150s ago > alert at 200s ago
  });

  it('STALE: met when the device has not reported within the threshold', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findUnique.mockResolvedValue({
      timestamp: ago(120 * SECOND),
    });
    const rule = inactiveRule({
      conditions: [
        {
          id: 'c1',
          device_id: 'd1',
          attribute: '',
          operation: Operation.STALE,
          data: { forSeconds: 60 },
        },
      ],
    });
    const r = await (service as any).evaluateCondition(
      rule,
      rule.conditions[0],
      null,
    );
    expect(r.met).toBe(true);
    expect(r.reason).toBe('stale');
  });

  it('STALE: measures silence from rule creation when no data ever arrived', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findUnique.mockResolvedValue(null);
    const rule = inactiveRule({
      created_at: ago(120 * SECOND),
      conditions: [
        {
          id: 'c1',
          device_id: 'd1',
          attribute: '',
          operation: Operation.STALE,
          data: { forSeconds: 60 },
        },
      ],
    });
    const r = await (service as any).evaluateCondition(
      rule,
      rule.conditions[0],
      null,
    );
    expect(r.met).toBe(true);
  });

  it('skips conditions with an invalid forSeconds', async () => {
    const { service } = makeService();
    const rule = inactiveRule({
      conditions: [
        {
          id: 'c1',
          device_id: 'd1',
          attribute: 'occupancy',
          operation: Operation.INACTIVE,
          data: { forSeconds: 0 },
        },
      ],
    });
    const r = await (service as any).evaluateCondition(
      rule,
      rule.conditions[0],
      null,
    );
    expect(r.met).toBe(false);
  });
});

describe('WatchdogService.evaluateRule combination semantics', () => {
  const spyConds = (service: WatchdogService, results: any[]) => {
    let i = 0;
    jest
      .spyOn(service as any, 'evaluateCondition')
      .mockImplementation(async () => results[i++]);
  };

  it('OR (all=false): fires when ANY condition is met AND fresh', async () => {
    const { service } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    spyConds(service, [
      { met: false, fresh: false, reason: 'inactive' },
      { met: true, fresh: true, reason: 'stale' },
    ]);
    const rule = inactiveRule({
      all: false,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'occupancy', operation: Operation.INACTIVE, data: { forSeconds: 1 } },
        { id: 'b', device_id: 'd1', attribute: '', operation: Operation.STALE, data: { forSeconds: 1 } },
      ],
    });
    await (service as any).evaluateRule(rule);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('OR (all=false): does NOT fire when the met condition is not fresh', async () => {
    const { service } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    spyConds(service, [{ met: true, fresh: false, reason: 'inactive' }]);
    const rule = inactiveRule({ all: false });
    await (service as any).evaluateRule(rule);
    expect(fire).not.toHaveBeenCalled();
  });

  it('AND (all=true): fires only when every condition is met and one is fresh', async () => {
    const { service } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    spyConds(service, [
      { met: true, fresh: true, reason: 'inactive' },
      { met: true, fresh: false, reason: 'stale' },
    ]);
    const rule = inactiveRule({
      all: true,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'occupancy', operation: Operation.INACTIVE, data: { forSeconds: 1 } },
        { id: 'b', device_id: 'd2', attribute: '', operation: Operation.STALE, data: { forSeconds: 1 } },
      ],
    });
    await (service as any).evaluateRule(rule);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('AND (all=true): does NOT fire when one condition is unmet', async () => {
    const { service } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    spyConds(service, [
      { met: true, fresh: true, reason: 'inactive' },
      { met: false, fresh: false, reason: 'stale' },
    ]);
    const rule = inactiveRule({
      all: true,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'occupancy', operation: Operation.INACTIVE, data: { forSeconds: 1 } },
        { id: 'b', device_id: 'd2', attribute: '', operation: Operation.STALE, data: { forSeconds: 1 } },
      ],
    });
    await (service as any).evaluateRule(rule);
    expect(fire).not.toHaveBeenCalled();
  });
});

describe('WatchdogService AND with mixed (non-absence) conditions', () => {
  const mixedAndRule = () =>
    inactiveRule({
      all: true,
      conditions: [
        {
          id: 'a',
          device_id: 'd1',
          attribute: 'occupancy',
          operation: Operation.INACTIVE,
          data: { forSeconds: 60, value: true },
        },
        {
          id: 'b',
          device_id: 'd1',
          attribute: 'battery',
          operation: Operation.LT,
          data: { value: 20 },
        },
      ],
    });

  it('fires when absence is met AND the value condition currently holds', async () => {
    const { service, db } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    // absence condition is met+fresh
    jest
      .spyOn(service as any, 'evaluateCondition')
      .mockResolvedValue({ met: true, fresh: true, reason: 'inactive' });
    // current battery is low → value condition holds
    db.sensorDataLast.findMany.mockResolvedValue([
      { device_id: 'd1', data: { battery: 12 } },
    ]);
    await (service as any).evaluateRule(mixedAndRule());
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the value condition is not satisfied', async () => {
    const { service, db } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'evaluateCondition')
      .mockResolvedValue({ met: true, fresh: true, reason: 'inactive' });
    db.sensorDataLast.findMany.mockResolvedValue([
      { device_id: 'd1', data: { battery: 80 } }, // not < 20
    ]);
    await (service as any).evaluateRule(mixedAndRule());
    expect(fire).not.toHaveBeenCalled();
  });

  it('does NOT fire when the value condition device has no data', async () => {
    const { service, db } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'evaluateCondition')
      .mockResolvedValue({ met: true, fresh: true, reason: 'inactive' });
    db.sensorDataLast.findMany.mockResolvedValue([]);
    await (service as any).evaluateRule(mixedAndRule());
    expect(fire).not.toHaveBeenCalled();
  });

  it('OR rules ignore the value-condition gate (handled by the event engine)', async () => {
    const { service, db } = makeService();
    const fire = jest.spyOn(service as any, 'fire').mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'evaluateCondition')
      .mockResolvedValue({ met: true, fresh: true, reason: 'inactive' });
    db.sensorDataLast.findMany.mockResolvedValue([
      { device_id: 'd1', data: { battery: 80 } }, // would fail the gate, but OR
    ]);
    const rule = mixedAndRule();
    rule.all = false;
    await (service as any).evaluateRule(rule);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(db.sensorDataLast.findMany).not.toHaveBeenCalled();
  });

  it('compareValue mirrors the engine comparators incl. numeric-string coercion', () => {
    const { service } = makeService();
    const cmp = (op: Operation, v: unknown, t: unknown) =>
      (service as any).compareValue(op, v, t);
    expect(cmp(Operation.LT, 12, 20)).toBe(true);
    expect(cmp(Operation.LT, 12, '20')).toBe(true); // string target coerced
    expect(cmp(Operation.GTE, 20, 20)).toBe(true);
    expect(cmp(Operation.EQ, 'open', 'open')).toBe(true);
    expect(cmp(Operation.LT, null, 20)).toBe(false);
  });
});

describe('WatchdogService re-arm episode (end-to-end scan)', () => {
  it('alerts once, stays silent while inactive, then re-arms after recovery', async () => {
    const { service, db, nats } = makeService();
    const rule = inactiveRule();
    db.rule.findMany.mockResolvedValue([rule]);

    // --- Scan 1: first episode, no prior alert -> fires ---
    db.ruleExecution.findFirst.mockResolvedValue(null);
    db.sensorDataLast.findUnique.mockResolvedValue({
      data: { occupancy: false },
      timestamp: ago(120 * SECOND),
    });
    db.deviceStateEvent.findMany.mockResolvedValue([]);
    await service.scan();
    const emailEmits = nats.emit.mock.calls.filter(
      (c) => c[0] === 'notification.email',
    );
    // owner + external caregiver
    expect(emailEmits.length).toBe(2);
    expect(db.ruleExecution.create).toHaveBeenCalledTimes(1);

    // --- Scan 2: still inactive, already alerted -> silent ---
    nats.emit.mockClear();
    db.ruleExecution.create.mockClear();
    db.ruleExecution.findFirst.mockResolvedValue({
      triggered_at: ago(60 * SECOND),
    });
    await service.scan();
    expect(nats.emit).not.toHaveBeenCalled();
    expect(db.ruleExecution.create).not.toHaveBeenCalled();

    // --- Scan 3: sensor recovered (active) after the alert, then inactive
    // again past the threshold -> re-arms and fires again ---
    nats.emit.mockClear();
    db.ruleExecution.create.mockClear();
    db.ruleExecution.findFirst.mockResolvedValue({
      triggered_at: ago(200 * SECOND),
    });
    db.deviceStateEvent.findMany.mockResolvedValue([
      { value: 'false', timestamp: ago(140 * SECOND) },
      { value: 'true', timestamp: ago(150 * SECOND) }, // recovery after alert
    ]);
    await service.scan();
    const reEmits = nats.emit.mock.calls.filter(
      (c) => c[0] === 'notification.email',
    );
    expect(reEmits.length).toBe(2);
    expect(db.ruleExecution.create).toHaveBeenCalledTimes(1);
  });
});

describe('WatchdogService episode isolation & resilience', () => {
  it('only counts the watchdog\'s own executions as the last alert', async () => {
    const { service, db } = makeService();
    await (service as any).lastAlertAt('r1');
    expect(db.ruleExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rule_id: 'r1',
          executed: true,
          error: { startsWith: 'watchdog:' },
        }),
      }),
    );
  });

  it('one failing rule does not abort the whole scan', async () => {
    const { service, db } = makeService();
    db.rule.findMany.mockResolvedValue([
      inactiveRule({ id: 'bad' }),
      inactiveRule({ id: 'good' }),
    ]);
    const seen: string[] = [];
    jest
      .spyOn(service as any, 'evaluateRule')
      .mockImplementation(async (...args: any[]) => {
        const r = args[0];
        seen.push(r.id);
        if (r.id === 'bad') throw new Error('boom');
      });
    await expect(service.scan()).resolves.toBeUndefined();
    expect(seen).toEqual(expect.arrayContaining(['bad', 'good']));
  });
});

describe('WatchdogService COMMAND results', () => {
  const commandResult = (overrides: Record<string, any> = {}) => ({
    id: 'cmd1',
    device_id: 'd9',
    event: 'turn on light',
    attribute: 'state',
    type: ResultType.COMMAND,
    data: { value: 'ON' },
    channel: [],
    ...overrides,
  });

  it('publishes a device command when a care rule fires with a COMMAND result', async () => {
    const { service, nats } = makeService();
    const rule = inactiveRule({ results: [commandResult()] });
    await (service as any).fire(rule, 'inactive');
    expect(nats.emit).toHaveBeenCalledWith(
      'mqtt-core.publish-command',
      expect.objectContaining({
        homeUniqueId: 'home-unique',
        deviceUniqueId: 'dev-unique',
        organizationId: 'org1',
        command: { state: 'ON' },
        source: 'rule',
      }),
    );
  });

  it('delivers both NOTIFICATION and COMMAND results in the same rule', async () => {
    const { service, nats } = makeService();
    const rule = inactiveRule({
      results: [
        {
          id: 'res1',
          device_id: null,
          event: 'No motion',
          attribute: null,
          type: ResultType.NOTIFICATION,
          data: { recipients: ['caregiver@example.com'] },
          channel: [NotificationChannel.EMAIL],
        },
        commandResult(),
      ],
    });
    await (service as any).fire(rule, 'inactive');
    const subjects = nats.emit.mock.calls.map((c) => c[0]);
    expect(subjects).toContain('notification.email');
    expect(subjects).toContain('mqtt-core.publish-command');
  });

  it('uses the raw data object as the command when there is no attribute', async () => {
    const { service, nats } = makeService();
    const rule = inactiveRule({
      results: [commandResult({ attribute: null, data: { state: 'ON', brightness: 200 } })],
    });
    await (service as any).fire(rule, 'inactive');
    expect(nats.emit).toHaveBeenCalledWith(
      'mqtt-core.publish-command',
      expect.objectContaining({ command: { state: 'ON', brightness: 200 } }),
    );
  });

  it('skips a COMMAND result without a device_id', async () => {
    const { service, nats } = makeService();
    const rule = inactiveRule({ results: [commandResult({ device_id: null })] });
    await (service as any).fire(rule, 'inactive');
    const subjects = nats.emit.mock.calls.map((c) => c[0]);
    expect(subjects).not.toContain('mqtt-core.publish-command');
  });
});

describe('WatchdogService notification fan-out', () => {
  it('emails the external caregiver even when the owner has no email channel', async () => {
    const { service, db, nats } = makeService();
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      channels: [], // owner has nothing enabled
      telegram_chat_id: null,
      email: 'owner@example.com',
      language: 'es',
    });
    const rule = inactiveRule();
    await (service as any).notify(rule, rule.results[0]);
    const emails = nats.emit.mock.calls.filter(
      (c) => c[0] === 'notification.email',
    );
    expect(emails.length).toBe(1);
    expect(emails[0][1].email).toBe('caregiver@example.com');
  });

  it('emits telegram to the owner chat when enabled', async () => {
    const { service, db, nats } = makeService();
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      channels: [NotificationChannel.TELEGRAM],
      telegram_chat_id: 'chat-123',
      email: 'owner@example.com',
      language: 'es',
    });
    const rule = inactiveRule({
      results: [
        {
          id: 'res1',
          event: 'No motion',
          type: ResultType.NOTIFICATION,
          data: {},
          channel: [NotificationChannel.TELEGRAM],
        },
      ],
    });
    await (service as any).notify(rule, rule.results[0]);
    const tg = nats.emit.mock.calls.filter(
      (c) => c[0] === 'notification.telegram',
    );
    expect(tg.length).toBe(1);
    expect(tg[0][1].chatId).toBe('chat-123');
  });

  it('does not emit recipient emails when EMAIL is not on the result', async () => {
    const { service, db, nats } = makeService();
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      channels: [NotificationChannel.TELEGRAM],
      telegram_chat_id: 'chat-1',
      email: 'owner@example.com',
      language: 'es',
    });
    const rule = inactiveRule({
      results: [
        {
          id: 'res1',
          event: 'No motion',
          type: ResultType.NOTIFICATION,
          data: { recipients: ['caregiver@example.com'] },
          channel: [NotificationChannel.TELEGRAM], // no EMAIL
        },
      ],
    });
    await (service as any).notify(rule, rule.results[0]);
    const emails = nats.emit.mock.calls.filter(
      (c) => c[0] === 'notification.email',
    );
    expect(emails.length).toBe(0);
  });
});
