import { serializeEdgeBundle } from './edge-bundle.serializer';
import { ResultType } from '@app/rules-evaluator';

type AnyMock = jest.Mock;

function makeDb(home: unknown) {
  return {
    home: { findUnique: jest.fn().mockResolvedValue(home) as AnyMock },
  } as any;
}

const baseRule = (over: Record<string, any>) => ({
  id: 'r',
  name: 'rule',
  type: 'RECURRENT',
  active: true,
  all: false,
  interval: 0,
  window_active: false,
  window_days: [],
  window_all_day: true,
  window_start: null,
  window_end: null,
  created_at: new Date('2026-07-06T00:00:00Z'),
  conditions: [],
  results: [],
  ...over,
});

function homeFixture() {
  return {
    unique_id: 'home-1',
    organization_id: 'org-1',
    timezone: 'Europe/Madrid',
    devices: [
      { id: 'tv1', unique_id: 'tv1', protocol: 'wifi', attributes: { source: 'hadiscovery' } },
      { id: 'plug', unique_id: 'plug', protocol: 'zigbee', attributes: {} },
      { id: 'unref', unique_id: 'unref', protocol: 'zigbee', attributes: {} },
    ],
    rules: [
      baseRule({
        id: 'r1',
        conditions: [
          { id: 'c1', device_id: 'plug', attribute: 'state', operation: 'EQ', data: { value: 'ON' }, trigger: true },
          // evaluator-only condition: must survive serialization with trigger:false
          { id: 'c2', device_id: 'plug', attribute: 'power', operation: 'GT', data: { value: 5 }, trigger: false },
        ],
        results: [
          { id: 'x1', device_id: 'tv1', event: 'on', attribute: 'power', data: { value: 'ON' }, type: ResultType.COMMAND, channel: [], resend_after: null },
          { id: 'x2', device_id: null, event: 'notify', attribute: null, data: {}, type: ResultType.NOTIFICATION, channel: ['EMAIL'], resend_after: null },
        ],
      }),
      // Notification-only rule: no COMMAND result → dropped from the bundle.
      baseRule({
        id: 'r2',
        results: [
          { id: 'y1', device_id: null, event: 'notify', attribute: null, data: {}, type: ResultType.NOTIFICATION, channel: ['EMAIL'], resend_after: null },
        ],
      }),
    ],
    schedules: [
      {
        id: 's1',
        name: 'Morning TV',
        active: true,
        date: new Date('2026-07-06T06:00:00Z'),
        frequency: 'DAILY',
        days: [],
        actions: [{ device_id: 'tv1', attribute: 'power', data: { value: 'ON' } }],
      },
    ],
    appliance_monitors: [],
  };
}

describe('serializeEdgeBundle', () => {
  it('returns null when the home does not exist', async () => {
    const bundle = await serializeEdgeBundle(makeDb(null), 'nope');
    expect(bundle).toBeNull();
  });

  it('keeps only COMMAND results and drops notification-only rules', async () => {
    const bundle = await serializeEdgeBundle(makeDb(homeFixture()), 'home-1');
    expect(bundle!.rules.map((r) => r.id)).toEqual(['r1']);
    expect(bundle!.rules[0].results.map((r) => r.type)).toEqual([ResultType.COMMAND]);
  });

  it('includes schedules and passes the home timezone through', async () => {
    const bundle = await serializeEdgeBundle(makeDb(homeFixture()), 'home-1');
    expect(bundle!.timezone).toBe('Europe/Madrid');
    expect(bundle!.schedules.map((s) => s.id)).toEqual(['s1']);
    expect(bundle!.schedules[0].actions[0]).toEqual({
      device_id: 'tv1',
      attribute: 'power',
      data: { value: 'ON' },
    });
  });

  it('ships only devices referenced by a rule condition/result or schedule action', async () => {
    const bundle = await serializeEdgeBundle(makeDb(homeFixture()), 'home-1');
    const ids = bundle!.devices.map((d) => d.id).sort();
    // tv1 (result + schedule) and plug (condition) are referenced; unref is not.
    expect(ids).toEqual(['plug', 'tv1']);
  });

  it('carries the per-condition trigger flag into the bundle', async () => {
    const bundle = await serializeEdgeBundle(makeDb(homeFixture()), 'home-1');
    const conditions = bundle!.rules[0].conditions;
    expect(conditions).toEqual([
      expect.objectContaining({ id: 'c1', trigger: true }),
      expect.objectContaining({ id: 'c2', trigger: false }),
    ]);
  });

  it('selects the trigger column so the edge receives it', async () => {
    const db = makeDb(homeFixture());
    await serializeEdgeBundle(db, 'home-1');
    const arg = db.home.findUnique.mock.calls[0][0];
    expect(arg.select.rules.select.conditions.select.trigger).toBe(true);
  });

  it('only queries active + run_offline rules and schedules', async () => {
    const db = makeDb(homeFixture());
    await serializeEdgeBundle(db, 'home-1');
    const arg = db.home.findUnique.mock.calls[0][0];
    expect(arg.select.rules.where).toEqual({ active: true, run_offline: true });
    expect(arg.select.schedules.where).toEqual({ active: true, run_offline: true });
  });
});
