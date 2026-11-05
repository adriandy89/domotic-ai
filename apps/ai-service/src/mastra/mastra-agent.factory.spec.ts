const storeClose = jest.fn().mockResolvedValue(undefined);
const vectorDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@mastra/pg', () => ({
  PostgresStore: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    close: storeClose,
  })),
  PgVector: jest.fn().mockImplementation(() => ({
    disconnect: vectorDisconnect,
  })),
}));
jest.mock('@mastra/memory', () => ({
  Memory: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@mastra/core/agent', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@mastra/core', () => ({
  Mastra: jest.fn().mockImplementation(() => ({
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { MastraAgentFactory } from './mastra-agent.factory';

describe('MastraAgentFactory.dispose', () => {
  it('closes the PostgresStore and PgVector pools of an evicted instance', async () => {
    const config = {
      get: (key: string) =>
        key === 'MASTRA_DATABASE_URL' ? 'postgres://x/y' : undefined,
    };
    const factory = new MastraAgentFactory(config as any);
    const mastra = await factory.createMastra('org1', {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      enabled: true,
    } as any);

    await factory.dispose(mastra);

    expect(storeClose).toHaveBeenCalledTimes(1);
    expect(vectorDisconnect).toHaveBeenCalledTimes(1);

    // Idempotent: a second dispose must not close twice.
    await factory.dispose(mastra);
    expect(storeClose).toHaveBeenCalledTimes(1);
  });
});
