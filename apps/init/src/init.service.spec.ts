import { PRESERVED_REDIS_PREFIXES } from './init.service';

describe('PRESERVED_REDIS_PREFIXES', () => {
  // Each prefix guards state another service owns; dropping one silently
  // breaks it on every init restart.
  it.each([
    ['sess:', 'login sessions (connect-redis)'],
    ['user-session:', '"log out other sessions" index (UserService)'],
    ['bull:', 'BullMQ queues (rules-engine)'],
  ])('keeps %s — %s', (prefix) => {
    expect(PRESERVED_REDIS_PREFIXES).toContain(prefix);
  });
});
