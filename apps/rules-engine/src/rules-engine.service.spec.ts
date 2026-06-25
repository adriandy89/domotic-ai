import { RulesEngineService } from './rules-engine.service';
import {
  NotificationChannel,
  Operation,
  ResultType,
  RuleType,
} from 'generated/prisma/client';

/**
 * Event-driven rules engine — exhaustive combination coverage.
 *
 * Dimensions exercised:
 *  - comparison operators (EQ/GT/GTE/LT/LTE) + numeric-string coercion
 *  - the absence operators (INACTIVE/STALE) which the engine must IGNORE
 *    (they belong to the watchdog) instead of misfiring
 *  - AND / OR (`all`) over single- and multi-device conditions
 *  - rule lifecycle: immediate vs delayed (interval), ONCE vs RECURRENT,
 *    anti-spam "no relevant change", pending-job dedupe
 *  - notification fan-out: owner channel matching + external recipients
 */

type AnyMock = jest.Mock;

function makeDeps() {
  const cache = {
    get: jest.fn().mockResolvedValue(null) as AnyMock,
    set: jest.fn().mockResolvedValue(undefined) as AnyMock,
    del: jest.fn().mockResolvedValue(undefined) as AnyMock,
  };
  const db = {
    rule: {
      findMany: jest.fn().mockResolvedValue([]) as AnyMock,
      findUnique: jest.fn().mockResolvedValue(null) as AnyMock,
      update: jest.fn().mockResolvedValue({}) as AnyMock,
    },
    ruleExecution: { create: jest.fn().mockResolvedValue({}) as AnyMock },
    sensorDataLast: { findMany: jest.fn().mockResolvedValue([]) as AnyMock },
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
        phone: null,
        fmc_tokens: [],
        language: 'es',
      }) as AnyMock,
    },
    home: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Home' }) as AnyMock,
    },
  };
  const nats = { emit: jest.fn().mockResolvedValue(undefined) as AnyMock };
  const queue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }) as AnyMock,
    getJob: jest.fn().mockResolvedValue(null) as AnyMock,
  };
  return { cache, db, nats, queue };
}

function makeService(deps = makeDeps()) {
  const service = new RulesEngineService(
    deps.cache as any,
    deps.db as any,
    deps.nats as any,
    deps.queue as any,
  );
  return { service, ...deps };
}

function rule(overrides: Record<string, any> = {}) {
  return {
    id: 'r1',
    name: 'Rule',
    description: null,
    active: true,
    all: true,
    type: RuleType.RECURRENT,
    interval: 0,
    timestamp: null,
    created_at: new Date(),
    user: { id: 'u1', organization_id: 'org1', phone: null, email: 'owner@example.com' },
    conditions: [
      {
        id: 'c1',
        device_id: 'd1',
        attribute: 'temperature',
        operation: Operation.GT,
        data: { value: 30 },
      },
    ],
    results: [
      {
        id: 'res1',
        device_id: null,
        event: 'Too hot',
        attribute: null,
        data: { recipients: undefined },
        type: ResultType.NOTIFICATION,
        channel: [NotificationChannel.EMAIL],
        resend_after: null,
      },
    ],
    home: { id: 'h1', name: 'Home', unique_id: 'home-unique' },
    ...overrides,
  };
}

describe('RulesEngineService.evaluateCondition', () => {
  const { service } = makeService();
  const ev = (operation: Operation, target: any, value: any) =>
    (service as any).evaluateCondition(
      { id: 'c', data: { value: target }, operation },
      value,
    );

  it.each<[Operation, any, any, boolean]>([
    [Operation.EQ, 10, 10, true],
    [Operation.EQ, 10, 11, false],
    [Operation.GT, 30, 31, true],
    [Operation.GT, 30, 30, false],
    [Operation.GTE, 30, 30, true],
    [Operation.GTE, 30, 29, false],
    [Operation.LT, 30, 29, true],
    [Operation.LT, 30, 30, false],
    [Operation.LTE, 30, 30, true],
    [Operation.LTE, 30, 31, false],
  ])('%s target=%p value=%p -> %p', (op, target, value, expected) => {
    expect(ev(op, target, value)).toBe(expected);
  });

  it('coerces a numeric-string target when the value is a number', () => {
    expect(ev(Operation.EQ, '10.6', 10.6)).toBe(true);
    expect(ev(Operation.GT, '30', 31)).toBe(true);
  });

  it('returns false for null/undefined values', () => {
    expect(ev(Operation.EQ, 10, null)).toBe(false);
    expect(ev(Operation.EQ, 10, undefined)).toBe(false);
  });

  it('returns false when the condition has no target value', () => {
    expect((service as any).evaluateCondition({ id: 'c', data: {}, operation: Operation.EQ }, 5)).toBe(false);
  });

  it('IGNORES absence operators (handled by the watchdog) -> false', () => {
    expect(ev(Operation.INACTIVE, true, true)).toBe(false);
    expect(ev(Operation.STALE, 1, 1)).toBe(false);
  });

  it('matches string equality', () => {
    expect(ev(Operation.EQ, 'open', 'open')).toBe(true);
    expect(ev(Operation.EQ, 'open', 'closed')).toBe(false);
  });
});

describe('RulesEngineService.canExecuteRule', () => {
  const { service } = makeService();
  it('RECURRENT can always execute', async () => {
    expect(await (service as any).canExecuteRule(rule({ type: RuleType.RECURRENT }))).toBe(true);
  });
  it('ONCE executes only while active', async () => {
    expect(await (service as any).canExecuteRule(rule({ type: RuleType.ONCE, active: true }))).toBe(true);
    expect(await (service as any).canExecuteRule(rule({ type: RuleType.ONCE, active: false }))).toBe(false);
  });
  it('SPECIFIC is not supported (never executes)', async () => {
    expect(await (service as any).canExecuteRule(rule({ type: RuleType.SPECIFIC }))).toBe(false);
  });
});

describe('RulesEngineService.evaluateRule combination semantics', () => {
  it('single device OR: true when any condition passes', async () => {
    const { service } = makeService();
    const r = rule({
      all: false,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'temperature', operation: Operation.GT, data: { value: 30 } },
        { id: 'b', device_id: 'd1', attribute: 'humidity', operation: Operation.GT, data: { value: 90 } },
      ],
    });
    expect(await (service as any).evaluateRule(r, 'd1', { temperature: 35, humidity: 10 })).toBe(true);
  });

  it('single device OR: false when all fail', async () => {
    const { service } = makeService();
    const r = rule({
      all: false,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'temperature', operation: Operation.GT, data: { value: 30 } },
        { id: 'b', device_id: 'd1', attribute: 'humidity', operation: Operation.GT, data: { value: 90 } },
      ],
    });
    expect(await (service as any).evaluateRule(r, 'd1', { temperature: 10, humidity: 10 })).toBe(false);
  });

  it('single device AND: requires every condition', async () => {
    const { service } = makeService();
    const r = rule({
      all: true,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'temperature', operation: Operation.GT, data: { value: 30 } },
        { id: 'b', device_id: 'd1', attribute: 'humidity', operation: Operation.LT, data: { value: 50 } },
      ],
    });
    expect(await (service as any).evaluateRule(r, 'd1', { temperature: 35, humidity: 40 })).toBe(true);
    expect(await (service as any).evaluateRule(r, 'd1', { temperature: 35, humidity: 60 })).toBe(false);
  });

  it('cross-device AND: pulls the other device from sensorDataLast', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findMany.mockResolvedValue([
      { device_id: 'd2', data: { contact: 'open' } },
    ]);
    const r = rule({
      all: true,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'temperature', operation: Operation.GT, data: { value: 30 } },
        { id: 'b', device_id: 'd2', attribute: 'contact', operation: Operation.EQ, data: { value: 'open' } },
      ],
    });
    expect(await (service as any).evaluateRule(r, 'd1', { temperature: 35 })).toBe(true);
  });

  it('cross-device AND: false when the other device has no data', async () => {
    const { service, db } = makeService();
    db.sensorDataLast.findMany.mockResolvedValue([]);
    const r = rule({
      all: true,
      conditions: [
        { id: 'a', device_id: 'd1', attribute: 'temperature', operation: Operation.GT, data: { value: 30 } },
        { id: 'b', device_id: 'd2', attribute: 'contact', operation: Operation.EQ, data: { value: 'open' } },
      ],
    });
    expect(await (service as any).evaluateRule(r, 'd1', { temperature: 35 })).toBe(false);
  });
});

describe('RulesEngineService.processNewData lifecycle', () => {
  it('executes immediately (interval 0) and records an executed run', async () => {
    const { service, db, nats } = makeService();
    const r = rule({ interval: 0 });
    db.rule.findMany.mockResolvedValue([r]);
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { temperature: 35 },
      prevData: { temperature: 20 },
    });
    expect(nats.emit).toHaveBeenCalledWith(
      'notification.email',
      expect.objectContaining({ email: 'owner@example.com' }),
    );
    expect(db.ruleExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conditions_met: true, executed: true }),
      }),
    );
  });

  it('records a not-met run and does not notify when conditions fail', async () => {
    const { service, db, nats } = makeService();
    const r = rule({ interval: 0 });
    db.rule.findMany.mockResolvedValue([r]);
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { temperature: 10 },
      prevData: { temperature: 35 },
    });
    expect(nats.emit).not.toHaveBeenCalled();
    expect(db.ruleExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conditions_met: false, executed: false }),
      }),
    );
  });

  it('anti-spam: skips when the relevant attribute did not change', async () => {
    const { service, db, nats } = makeService();
    const r = rule({ interval: 0 });
    db.rule.findMany.mockResolvedValue([r]);
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { temperature: 35 },
      prevData: { temperature: 35 }, // unchanged
    });
    expect(nats.emit).not.toHaveBeenCalled();
    expect(db.ruleExecution.create).not.toHaveBeenCalled();
  });

  it('schedules a delayed job when interval > 0 and none is pending', async () => {
    const { service, db, cache, queue } = makeService();
    const r = rule({ interval: 120 });
    db.rule.findMany.mockResolvedValue([r]);
    cache.get.mockResolvedValue(null);
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { temperature: 35 },
      prevData: { temperature: 20 },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'execute-rule',
      expect.objectContaining({ ruleId: 'r1' }),
      expect.objectContaining({ delay: 120000 }),
    );
    expect(cache.set).toHaveBeenCalled();
    expect(db.ruleExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conditions_met: true, executed: false }),
      }),
    );
  });

  it('does not double-schedule when a delayed job is already pending', async () => {
    const { service, db, cache, queue } = makeService();
    const r = rule({ interval: 120 });
    db.rule.findMany.mockResolvedValue([r]);
    cache.get.mockResolvedValue('existing-job-id');
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { temperature: 35 },
      prevData: { temperature: 20 },
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('cancels a pending delayed job when conditions stop being met', async () => {
    const { service, db, cache, queue } = makeService();
    const r = rule({ interval: 120 });
    db.rule.findMany.mockResolvedValue([r]);
    cache.get.mockResolvedValue('job-xyz');
    queue.getJob.mockResolvedValue({ remove: jest.fn().mockResolvedValue(undefined) });
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { temperature: 10 }, // not met
      prevData: { temperature: 35 },
    });
    expect(queue.getJob).toHaveBeenCalledWith('job-xyz');
    expect(cache.del).toHaveBeenCalled();
  });

  it('ignores rules not returned by the active-rule query', async () => {
    const { service, db, nats } = makeService();
    db.rule.findMany.mockResolvedValue([]); // rule inactive / filtered out
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { temperature: 35 },
      prevData: { temperature: 20 },
    });
    expect(nats.emit).not.toHaveBeenCalled();
  });

  it('does nothing when no rule ids are attached to the data', async () => {
    const { service, db } = makeService();
    await service.processNewData({
      ruleIds: [],
      deviceId: 'd1',
      timestamp: new Date(),
      data: {},
      prevData: {},
    });
    expect(db.rule.findMany).not.toHaveBeenCalled();
  });

  it('a rule whose only condition is INACTIVE never fires via the event engine', async () => {
    const { service, db, nats } = makeService();
    const r = rule({
      interval: 0,
      conditions: [
        { id: 'c1', device_id: 'd1', attribute: 'occupancy', operation: Operation.INACTIVE, data: { forSeconds: 60, value: true } },
      ],
    });
    db.rule.findMany.mockResolvedValue([r]);
    await service.processNewData({
      ruleIds: ['r1'],
      deviceId: 'd1',
      timestamp: new Date(),
      data: { occupancy: true },
      prevData: { occupancy: false },
    });
    expect(nats.emit).not.toHaveBeenCalled();
    expect(db.ruleExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conditions_met: false }),
      }),
    );
  });
});

describe('RulesEngineService.executeNotification fan-out', () => {
  const ruleInfo = { ruleId: 'r1', ruleName: 'Rule', userId: 'u1', homeId: 'h1' };

  it('emits to the owner email when result and user channels match', async () => {
    const { service, nats } = makeService();
    await (service as any).executeNotification(ruleInfo, {
      id: 'res1',
      event: 'hi',
      channel: [NotificationChannel.EMAIL],
    });
    expect(nats.emit).toHaveBeenCalledWith(
      'notification.email',
      expect.objectContaining({ email: 'owner@example.com' }),
    );
  });

  it('emits to external recipients regardless of owner channels', async () => {
    const { service, db, nats } = makeService();
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      channels: [], // owner disabled everything
      telegram_chat_id: null,
      email: 'owner@example.com',
      phone: null,
      fmc_tokens: [],
      language: 'es',
    });
    await (service as any).executeNotification(ruleInfo, {
      id: 'res1',
      event: 'hi',
      channel: [NotificationChannel.EMAIL],
      data: { recipients: ['caregiver@example.com'] },
    });
    const emails = nats.emit.mock.calls.filter((c) => c[0] === 'notification.email');
    expect(emails.length).toBe(1);
    expect(emails[0][1].email).toBe('caregiver@example.com');
  });

  it('emits telegram only when the chat id is linked', async () => {
    const { service, db, nats } = makeService();
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      channels: [NotificationChannel.TELEGRAM],
      telegram_chat_id: 'chat-9',
      email: null,
      phone: null,
      fmc_tokens: [],
      language: 'es',
    });
    await (service as any).executeNotification(ruleInfo, {
      id: 'res1',
      event: 'hi',
      channel: [NotificationChannel.TELEGRAM],
    });
    expect(nats.emit).toHaveBeenCalledWith(
      'notification.telegram',
      expect.objectContaining({ chatId: 'chat-9' }),
    );
  });

  it('does not emit when there are no matching channels and no recipients', async () => {
    const { service, db, nats } = makeService();
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      channels: [NotificationChannel.TELEGRAM],
      telegram_chat_id: 'chat-9',
      email: 'owner@example.com',
      phone: null,
      fmc_tokens: [],
      language: 'es',
    });
    await (service as any).executeNotification(ruleInfo, {
      id: 'res1',
      event: 'hi',
      channel: [NotificationChannel.EMAIL], // user has no EMAIL channel
    });
    expect(nats.emit).not.toHaveBeenCalled();
  });
});

describe('RulesEngineService.executeDelayedRule', () => {
  it('runs results, clears the cache and deactivates ONCE rules', async () => {
    const { service, db, cache, nats } = makeService();
    db.rule.findUnique.mockResolvedValue({ type: RuleType.ONCE });
    await service.executeDelayedRule({
      ruleId: 'r1',
      ruleName: 'Rule',
      homeUniqueId: 'home-unique',
      userId: 'u1',
      homeId: 'h1',
      results: [
        {
          id: 'res1',
          device_id: null,
          event: 'hi',
          attribute: null,
          data: {},
          type: ResultType.NOTIFICATION,
          channel: [NotificationChannel.EMAIL],
          resend_after: null,
        },
      ],
    } as any);
    expect(cache.del).toHaveBeenCalled();
    expect(nats.emit).toHaveBeenCalledWith('notification.email', expect.any(Object));
    expect(db.rule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(db.ruleExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ executed: true }),
      }),
    );
  });
});
