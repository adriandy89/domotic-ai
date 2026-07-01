import { signBundle, verifyBundle, canonicalJson } from './hmac';
import { EdgeBundle } from './bundle';
import { RuleType } from './enums';

const bundle: EdgeBundle = {
  homeUniqueId: 'home-1',
  organizationId: 'org-1',
  timezone: 'UTC',
  version: 3,
  devices: [{ id: 'A', uniqueId: 'sensor-a', protocol: 'zigbee', attributes: {} }],
  rules: [
    {
      id: 'r1',
      name: 'r',
      type: RuleType.RECURRENT,
      active: true,
      all: true,
      interval: 0,
      window_active: false,
      window_days: [],
      window_all_day: true,
      window_start: null,
      window_end: null,
      created_at: '2026-07-01T00:00:00.000Z',
      conditions: [],
      results: [],
    },
  ],
  schedules: [],
};

describe('bundle HMAC', () => {
  it('round-trips: a signed bundle verifies with the same token', () => {
    const signed = signBundle(bundle, 'secret-token');
    expect(verifyBundle(signed, 'secret-token')).toBe(true);
  });

  it('rejects a wrong token', () => {
    const signed = signBundle(bundle, 'secret-token');
    expect(verifyBundle(signed, 'other-token')).toBe(false);
  });

  it('rejects a tampered bundle', () => {
    const signed = signBundle(bundle, 'secret-token');
    signed.bundle.rules[0].results.push({
      id: 'x',
      device_id: 'A',
      event: 'on',
      attribute: 'state',
      data: { value: 'ON' },
      type: 'COMMAND' as any,
      channel: [],
      resend_after: null,
    });
    expect(verifyBundle(signed, 'secret-token')).toBe(false);
  });

  it('canonical JSON is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});
