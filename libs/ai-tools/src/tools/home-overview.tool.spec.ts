/**
 * get-home-overview AI tool — with no homeId it must summarize ALL the user's
 * homes (not just the oldest one); with a homeId it narrows to that home.
 */
import { homeOverviewTool } from './home-overview.tool';

type AnyMock = jest.Mock;

function makeCtx(findManyImpl: AnyMock) {
  const db = { userHome: { findMany: findManyImpl } };
  const store: Record<string, unknown> = {
    userId: 'u1',
    organizationId: 'org1',
    dbService: db,
  };
  const context = { requestContext: { get: (k: string) => store[k] } };
  return { db, context };
}

const run = (input: any, ctx: any) =>
  (homeOverviewTool as any).execute(input, ctx);

const home = (id: string, name: string, devices: any[] = []) => ({
  home: {
    id,
    name,
    description: null,
    disabled: false,
    connected: true,
    last_update: null,
    address: null,
    latitude: null,
    longitude: null,
    timezone: null,
    devices,
  },
});

const lowBatteryDevice = {
  id: 'd1',
  name: 'Leak sensor',
  category: null,
  sensorDataLasts: [{ data: { battery: 2 }, timestamp: 'now' }],
};

describe('get-home-overview tool', () => {
  it('returns an overview for EVERY home when no homeId is given', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([home('h1', 'Casa Malaga'), home('h2', 'La Térmica')]);
    const { context } = makeCtx(findMany);

    const result = await run({}, context);

    expect(result.count).toBe(2);
    expect(result.homes.map((o: any) => o.home.name)).toEqual([
      'Casa Malaga',
      'La Térmica',
    ]);
    // no home_id filter when none is passed
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'u1' } }),
    );
  });

  it('narrows to a single home when homeId is provided', async () => {
    const homeUuid = '22222222-2222-2222-2222-222222222222';
    const findMany = jest
      .fn()
      .mockResolvedValue([home(homeUuid, 'La Térmica')]);
    const { context } = makeCtx(findMany);

    const result = await run({ homeId: homeUuid }, context);

    expect(result.count).toBe(1);
    expect(result.homes[0].home.id).toBe(homeUuid);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'u1', home_id: homeUuid } }),
    );
  });

  it('detects per-home issues (low battery)', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([home('h1', 'Casa Malaga', [lowBatteryDevice])]);
    const { context } = makeCtx(findMany);

    const result = await run({}, context);

    expect(result.homes[0].issues).toEqual([
      { deviceId: 'd1', deviceName: 'Leak sensor', issue: 'low_battery', detail: 2 },
    ]);
  });

  it('returns an error when the user has no homes', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { context } = makeCtx(findMany);

    const result = await run({}, context);

    expect(result).toEqual({ error: 'No home found for this user' });
  });
});
