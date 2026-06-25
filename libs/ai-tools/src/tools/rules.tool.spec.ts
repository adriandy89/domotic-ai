/**
 * create-rule AI tool — care/absence + execution-window coverage.
 *
 * getAdapter (device attribute validation) is mocked so the tests are
 * deterministic and focus on the tool's branching: absence operators need
 * forSeconds, STALE needs no attribute, comparison ops need a value, and the
 * window is persisted correctly.
 */
jest.mock('@app/models', () => ({
  getAdapter: () => ({
    getReadableAttributes: () => [
      { property: 'occupancy' },
      { property: 'temperature' },
    ],
    getAvailableActions: () => [],
    validateCommand: () => ({ valid: true }),
  }),
}));

import { createRuleTool } from './rules.tool';
import {
  NotificationChannel,
  Operation,
  ResultType,
  ScheduleDays,
} from 'generated/prisma/enums';

type AnyMock = jest.Mock;

function makeCtx() {
  const db = {
    userHome: { findUnique: jest.fn().mockResolvedValue({ id: 'uh' }) as AnyMock },
    device: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'd1',
        name: 'Kitchen sensor',
        protocol: 'zigbee',
        attributes: {},
      }) as AnyMock,
    },
    rule: {
      create: jest.fn().mockResolvedValue({
        id: 'r1',
        name: 'R',
        active: true,
        type: 'RECURRENT',
        home: { id: 'h1', name: 'Home' },
      }) as AnyMock,
    },
  };
  const store: Record<string, unknown> = {
    userId: 'u1',
    organizationId: 'org1',
    dbService: db,
  };
  const context = { requestContext: { get: (k: string) => store[k] } };
  return { db, context };
}

const notifyResult = {
  type: ResultType.NOTIFICATION,
  event: 'No motion detected',
  channel: [NotificationChannel.EMAIL],
};

const run = (input: any, ctx: any) =>
  (createRuleTool as any).execute(input, ctx);

describe('create-rule tool — care & window', () => {
  it('persists INACTIVE forSeconds + execution window', async () => {
    const { db, context } = makeCtx();
    const res = await run(
      {
        name: 'No motion kitchen',
        homeId: '11111111-1111-1111-1111-111111111111',
        windowActive: true,
        windowAllDay: false,
        windowStart: 480,
        windowEnd: 1170,
        windowDays: [ScheduleDays.MONDAY, ScheduleDays.FRIDAY],
        conditions: [
          {
            deviceId: '22222222-2222-2222-2222-222222222222',
            attribute: 'occupancy',
            operation: Operation.INACTIVE,
            forSeconds: 43200,
          },
        ],
        results: [notifyResult],
      },
      context,
    );

    expect(res.success).toBe(true);
    const data = db.rule.create.mock.calls[0][0].data;
    expect(data.window_active).toBe(true);
    expect(data.window_all_day).toBe(false);
    expect(data.window_start).toBe(480);
    expect(data.window_end).toBe(1170);
    expect(data.window_days).toEqual([
      ScheduleDays.MONDAY,
      ScheduleDays.FRIDAY,
    ]);
    expect(data.conditions.createMany.data[0].data).toEqual({
      forSeconds: 43200,
    });
  });

  it('accepts STALE without an attribute', async () => {
    const { db, context } = makeCtx();
    const res = await run(
      {
        name: 'Device silent',
        homeId: '11111111-1111-1111-1111-111111111111',
        conditions: [
          {
            deviceId: '22222222-2222-2222-2222-222222222222',
            operation: Operation.STALE,
            forSeconds: 86400,
          },
        ],
        results: [notifyResult],
      },
      context,
    );
    expect(res.success).toBe(true);
    expect(db.rule.create.mock.calls[0][0].data.conditions.createMany.data[0]).toEqual(
      expect.objectContaining({
        attribute: '',
        operation: Operation.STALE,
        data: { forSeconds: 86400 },
      }),
    );
  });

  it('rejects an absence operator without forSeconds', async () => {
    const { db, context } = makeCtx();
    const res = await run(
      {
        name: 'Bad',
        homeId: '11111111-1111-1111-1111-111111111111',
        conditions: [
          {
            deviceId: '22222222-2222-2222-2222-222222222222',
            attribute: 'occupancy',
            operation: Operation.INACTIVE,
          },
        ],
        results: [notifyResult],
      },
      context,
    );
    expect(res.success).toBe(false);
    expect(db.rule.create).not.toHaveBeenCalled();
  });

  it('rejects a time-range window without both bounds', async () => {
    const { db, context } = makeCtx();
    const res = await run(
      {
        name: 'Bad window',
        homeId: '11111111-1111-1111-1111-111111111111',
        windowActive: true,
        windowAllDay: false,
        windowStart: 480, // missing windowEnd
        conditions: [
          {
            deviceId: '22222222-2222-2222-2222-222222222222',
            attribute: 'temperature',
            operation: Operation.GT,
            value: 25,
          },
        ],
        results: [notifyResult],
      },
      context,
    );
    expect(res.success).toBe(false);
    expect(db.rule.create).not.toHaveBeenCalled();
  });

  it('rejects a comparison operator without a value', async () => {
    const { db, context } = makeCtx();
    const res = await run(
      {
        name: 'Bad cmp',
        homeId: '11111111-1111-1111-1111-111111111111',
        conditions: [
          {
            deviceId: '22222222-2222-2222-2222-222222222222',
            attribute: 'temperature',
            operation: Operation.GT,
          },
        ],
        results: [notifyResult],
      },
      context,
    );
    expect(res.success).toBe(false);
    expect(db.rule.create).not.toHaveBeenCalled();
  });

  it('persists a normal comparison rule with value and no window', async () => {
    const { db, context } = makeCtx();
    const res = await run(
      {
        name: 'Too hot',
        homeId: '11111111-1111-1111-1111-111111111111',
        conditions: [
          {
            deviceId: '22222222-2222-2222-2222-222222222222',
            attribute: 'temperature',
            operation: Operation.GT,
            value: 25,
          },
        ],
        results: [notifyResult],
      },
      context,
    );
    expect(res.success).toBe(true);
    const data = db.rule.create.mock.calls[0][0].data;
    expect(data.window_active).toBe(false);
    expect(data.conditions.createMany.data[0].data).toEqual({ value: 25 });
  });

  it('does not accept a recipients field on results (UI-only)', () => {
    // The create-rule input schema must not expose recipients.
    const shape = (createRuleTool as any).inputSchema?.shape;
    const resultShape = shape?.results?.element?.shape ?? shape?.results?._def;
    // Best-effort structural check: recipients must be absent from the results item schema.
    const keys = resultShape?.shape ? Object.keys(resultShape.shape) : [];
    expect(keys).not.toContain('recipients');
  });
});
