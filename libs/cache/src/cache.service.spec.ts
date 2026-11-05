import { CacheService } from './cache.service';

/** Fake node-redis v5 client: scanIterator yields batches (string[]). */
function fakeClient(keys: string[]) {
  const store = new Set(keys);
  return {
    isReady: true,
    store,
    async *scanIterator() {
      const all = [...store];
      for (let i = 0; i < all.length; i += 2) yield all.slice(i, i + 2);
    },
    unlink: jest.fn(async (ks: string[]) => {
      ks.forEach((k) => store.delete(k));
      return ks.length;
    }),
    flushAll: jest.fn(),
  };
}

describe('CacheService.flushAllExcept', () => {
  it('deletes cache keys but keeps sessions and BullMQ queues', async () => {
    const svc = new CacheService({ redisUrl: 'redis://unused', name: 't' });
    const client = fakeClient([
      'home:abc:org',
      'reports:energy:{}:x',
      'sess:123',
      'bull:schedules:repeat:1',
      'bull:rules-delayed:42',
      'device:uid:1',
    ]);
    (svc as any).client = client;

    const deleted = await svc.flushAllExcept(['sess:', 'bull:']);

    expect(deleted).toBe(3);
    expect([...client.store].sort()).toEqual([
      'bull:rules-delayed:42',
      'bull:schedules:repeat:1',
      'sess:123',
    ]);
    expect(client.flushAll).not.toHaveBeenCalled();
  });

  it('is a no-op when the client is not ready', async () => {
    const svc = new CacheService({ redisUrl: 'redis://unused', name: 't' });
    (svc as any).client = { isReady: false };
    await expect(svc.flushAllExcept(['sess:'])).resolves.toBe(0);
  });
});
