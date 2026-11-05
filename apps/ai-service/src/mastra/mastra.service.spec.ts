// Mastra ships ESM that ts-jest doesn't transform: stub what the service imports.
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/request-context', () => ({
  RequestContext: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('./mastra-agent.factory', () => ({ MastraAgentFactory: jest.fn() }));

import { MastraService } from './mastra.service';

/** Deferred promise helper to keep an agent.generate() call "in flight". */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup() {
  const generate = jest.fn();
  const fakeMastra = { getAgent: () => ({ generate }) };
  const factory = {
    validateConfig: jest.fn((c: any) => ({ ...c, enabled: true })),
    createMastra: jest.fn().mockResolvedValue(fakeMastra),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
  const db = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        organization_id: 'org1',
        role: 'USER',
        organization: {
          attributes: {
            ai: { enabled: true, provider: 'openai', model: 'm', apiKey: 'k' },
          },
        },
      }),
    },
    aiUsage: { create: jest.fn().mockResolvedValue({}) },
  };
  const svc = new MastraService(factory as any, db as any, {} as any);
  return { svc, factory, generate };
}

describe('MastraService instance lifecycle', () => {
  it('concurrent first requests of an org share ONE instance (no leaked pools)', async () => {
    const { svc, factory, generate } = setup();
    generate.mockResolvedValue({ text: 'ok' });

    await Promise.all([
      svc.generateResponse('u1', 'hola', 'c1'),
      svc.generateResponse('u1', 'hola', 'c2'),
    ]);

    expect(factory.createMastra).toHaveBeenCalledTimes(1);
  });

  it('invalidating during an in-flight request defers dispose until it finishes', async () => {
    const { svc, factory, generate } = setup();
    const pending = deferred<{ text: string }>();
    generate.mockReturnValue(pending.promise);

    const reply = svc.generateResponse('u1', 'hola', 'c1');
    await new Promise((r) => setImmediate(r)); // let it reach agent.generate

    await svc.invalidateCache('org1');
    expect(factory.dispose).not.toHaveBeenCalled(); // pools still in use

    pending.resolve({ text: 'done' });
    await expect(reply).resolves.toBe('done');
    await new Promise((r) => setImmediate(r));
    expect(factory.dispose).toHaveBeenCalledTimes(1);

    // The next request builds a fresh instance with the new config.
    generate.mockResolvedValue({ text: 'again' });
    await svc.generateResponse('u1', 'hola', 'c1');
    expect(factory.createMastra).toHaveBeenCalledTimes(2);
  });

  it('invalidating an idle instance disposes it immediately', async () => {
    const { svc, factory, generate } = setup();
    generate.mockResolvedValue({ text: 'ok' });
    await svc.generateResponse('u1', 'hola', 'c1');

    await svc.invalidateCache('org1');
    await new Promise((r) => setImmediate(r));
    expect(factory.dispose).toHaveBeenCalledTimes(1);
  });

  it('a failed creation is not cached: the next request retries', async () => {
    const { svc, factory, generate } = setup();
    factory.createMastra.mockRejectedValueOnce(new Error('pg down'));

    await expect(svc.generateResponse('u1', 'hola', 'c1')).rejects.toThrow(
      'pg down',
    );

    generate.mockResolvedValue({ text: 'ok' });
    await expect(svc.generateResponse('u1', 'hola', 'c1')).resolves.toBe('ok');
    expect(factory.createMastra).toHaveBeenCalledTimes(2);
  });
});
