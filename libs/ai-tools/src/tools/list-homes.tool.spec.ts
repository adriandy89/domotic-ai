/**
 * list-homes AI tool — ensures it returns ALL homes accessible to the user
 * (not just the first one), each with its id and device count.
 */
import { listHomesTool } from './list-homes.tool';

type AnyMock = jest.Mock;

function makeCtx(findManyImpl: AnyMock) {
  const db = {
    userHome: { findMany: findManyImpl },
  };
  const store: Record<string, unknown> = {
    userId: 'u1',
    organizationId: 'org1',
    dbService: db,
  };
  const context = { requestContext: { get: (k: string) => store[k] } };
  return { db, context };
}

const run = (input: any, ctx: any) =>
  (listHomesTool as any).execute(input, ctx);

const home = (id: string, name: string, devices = 0) => ({
  home: {
    id,
    name,
    description: null,
    address: null,
    connected: true,
    disabled: false,
    _count: { devices },
  },
});

describe('list-homes tool', () => {
  it('returns an empty list when the user has no homes', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { context } = makeCtx(findMany);

    const result = await run({}, context);

    expect(result).toEqual({ homes: [], count: 0 });
  });

  it('returns the single home when the user has one', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([home('h1', 'Casa Malaga', 14)]);
    const { context } = makeCtx(findMany);

    const result = await run({}, context);

    expect(result.count).toBe(1);
    expect(result.homes[0]).toMatchObject({
      id: 'h1',
      name: 'Casa Malaga',
      deviceCount: 14,
    });
  });

  it('returns ALL homes when the user has several', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        home('h1', 'Casa Malaga', 14),
        home('h2', 'La Térmica', 3),
      ]);
    const { context } = makeCtx(findMany);

    const result = await run({}, context);

    expect(result.count).toBe(2);
    expect(result.homes.map((h: any) => h.id)).toEqual(['h1', 'h2']);
    expect(result.homes.map((h: any) => h.name)).toEqual([
      'Casa Malaga',
      'La Térmica',
    ]);
    // scoped to the authenticated user
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'u1' } }),
    );
  });

  it('throws when no userId is in the request context', async () => {
    const findMany = jest.fn();
    const store: Record<string, unknown> = { dbService: { userHome: { findMany } } };
    const context = { requestContext: { get: (k: string) => store[k] } };

    await expect(run({}, context)).rejects.toThrow('User ID is required');
  });
});
