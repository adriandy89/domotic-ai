import { SchedulesService } from './schedules.service';
import type { RulesStoreService } from '../rules/rules-store.service';
import type { CommandService } from '../command/command.service';
import type { SqliteService } from '../store/sqlite.service';
import {
  EdgeDeviceMeta,
  EdgeSchedule,
  ScheduleDays,
  ScheduleFrequency,
} from '../vendor/rules-evaluator';

const TV: EdgeDeviceMeta = {
  id: 'tv1',
  uniqueId: 'tv1',
  protocol: 'wifi',
  attributes: { source: 'hadiscovery', protocol: 'wifi', config: { cmps: {} } },
};

function makeService(
  schedules: EdgeSchedule[],
  { timezone = 'Europe/Madrid', devices = { tv1: TV } as Record<string, EdgeDeviceMeta> } = {},
) {
  const store = {
    schedules,
    timezone,
    deviceById: (id: string) => devices[id],
  } as unknown as RulesStoreService;

  const send = jest.fn().mockReturnValue(true);
  const command = { send } as unknown as CommandService;
  const bufferExecution = jest.fn();
  const sqlite = { bufferExecution } as unknown as SqliteService;

  const service = new SchedulesService(store, command, sqlite);
  return { service, send, bufferExecution };
}

function onceSchedule(dateIso: string, actions: EdgeSchedule['actions']): EdgeSchedule {
  return {
    id: 's-once',
    name: 'Turn on TV',
    active: true,
    date: dateIso,
    frequency: ScheduleFrequency.ONCE,
    days: [],
    actions,
  };
}

const powerOn = [{ device_id: 'tv1', attribute: 'power', data: { value: 'ON' } }];

describe('Edge SchedulesService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('fires a ONCE schedule and commands the target TV', () => {
    jest.setSystemTime(new Date('2026-07-06T10:00:00Z'));
    const { service, send, bufferExecution } = makeService([
      onceSchedule('2026-07-06T10:02:00Z', powerOn),
    ]);

    service.reload();
    expect(send).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2 * 60 * 1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(TV, { power: 'ON' });
    expect(bufferExecution).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'schedule', executed: true, results_count: 1 }),
    );
  });

  it('does NOT arm a ONCE schedule whose date is in the past', () => {
    jest.setSystemTime(new Date('2026-07-06T10:00:00Z'));
    const { service, send } = makeService([
      onceSchedule('2026-07-06T09:00:00Z', powerOn),
    ]);
    service.reload();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('buffers an execution with executed=false when the target device is unknown', () => {
    jest.setSystemTime(new Date('2026-07-06T10:00:00Z'));
    const { service, send, bufferExecution } = makeService(
      [onceSchedule('2026-07-06T10:01:00Z', [
        { device_id: 'ghost', attribute: 'power', data: { value: 'ON' } },
      ])],
      { devices: {} },
    );
    service.reload();
    jest.advanceTimersByTime(60 * 1000);
    expect(send).not.toHaveBeenCalled();
    expect(bufferExecution).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'schedule', executed: false, results_count: 0 }),
    );
  });

  it('anchors a DAILY schedule to the home timezone (DST-stable, fires at local wall time)', () => {
    // 07:59 in Madrid (summer, UTC+2). A daily schedule at 08:00 local must fire in 60s.
    jest.setSystemTime(new Date('2026-07-06T05:59:00Z'));
    const daily: EdgeSchedule = {
      id: 's-daily',
      name: 'Morning TV',
      active: true,
      // 08:00 Madrid encoded as the absolute instant 06:00Z.
      date: '2026-07-06T06:00:00Z',
      frequency: ScheduleFrequency.DAILY,
      days: [],
      actions: powerOn,
    };
    const { service, send } = makeService([daily]);
    service.reload();

    jest.advanceTimersByTime(59 * 1000);
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000); // now 06:00Z = 08:00 Madrid
    expect(send).toHaveBeenCalledWith(TV, { power: 'ON' });
  });

  it('reload() re-arms from the current bundle and drops previous timers', () => {
    jest.setSystemTime(new Date('2026-07-06T10:00:00Z'));
    const { service, send } = makeService([
      onceSchedule('2026-07-06T10:05:00Z', powerOn),
    ]);
    service.reload(); // arm #1
    service.reload(); // clears #1 and re-arms

    jest.advanceTimersByTime(5 * 60 * 1000);
    // Only the surviving (re-armed) timer fires — exactly once.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ignores inactive schedules', () => {
    jest.setSystemTime(new Date('2026-07-06T10:00:00Z'));
    const s = onceSchedule('2026-07-06T10:01:00Z', powerOn);
    s.active = false;
    const { service, send } = makeService([s]);
    service.reload();
    jest.advanceTimersByTime(60 * 1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('skips a CUSTOM schedule with no days (invalid timing)', () => {
    jest.setSystemTime(new Date('2026-07-06T10:00:00Z'));
    const s: EdgeSchedule = {
      id: 's-custom',
      name: 'no days',
      active: true,
      date: '2026-07-06T06:00:00Z',
      frequency: ScheduleFrequency.CUSTOM,
      days: [] as ScheduleDays[],
      actions: powerOn,
    };
    const { service, send } = makeService([s]);
    service.reload();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(send).not.toHaveBeenCalled();
  });
});
