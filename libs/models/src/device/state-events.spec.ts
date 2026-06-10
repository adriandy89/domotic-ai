import { detectStateTransitions } from './state-events';

/** Real relay payload from the domoticai-esp-relay firmware. */
const relayPrev = {
  ts: '2026-06-10T13:58:12Z',
  relay: 'OFF',
  state: 'OFF',
  trigger: 'schedule',
  schedule: [],
  wifi_rssi: -48,
};
const relayNext = {
  ts: '2026-06-10T14:03:33Z',
  relay: 'ON',
  state: 'ON',
  trigger: 'remote',
  schedule: [],
  wifi_rssi: -45,
};

describe('detectStateTransitions — relay payload', () => {
  const transitions = detectStateTransitions(relayPrev, relayNext);
  const byProp = Object.fromEntries(transitions.map((t) => [t.property, t]));

  it('records the ON/OFF and trigger transitions', () => {
    expect(byProp.relay).toEqual({
      property: 'relay',
      prevValue: 'OFF',
      value: 'ON',
    });
    expect(byProp.state).toEqual({
      property: 'state',
      prevValue: 'OFF',
      value: 'ON',
    });
    expect(byProp.trigger).toEqual({
      property: 'trigger',
      prevValue: 'schedule',
      value: 'remote',
    });
    expect(transitions).toHaveLength(3);
  });

  it('ignores numeric fields, meta timestamps and arrays', () => {
    expect(byProp.wifi_rssi).toBeUndefined(); // numeric → sensor_field_*
    expect(byProp.ts).toBeUndefined(); // meta key
    expect(byProp.schedule).toBeUndefined(); // array, not a scalar state
  });
});

describe('detectStateTransitions — no-op cases (heartbeats, retained, QoS1)', () => {
  it('returns [] when nothing changed besides excluded fields', () => {
    const heartbeat = {
      ...relayNext,
      ts: '2026-06-10T14:05:00Z',
      wifi_rssi: -51,
    };
    expect(detectStateTransitions(relayNext, heartbeat)).toEqual([]);
  });

  it('returns [] for identical payloads (re-delivered message)', () => {
    expect(detectStateTransitions(relayNext, relayNext)).toEqual([]);
  });

  it('does not record fields missing on either side (no "first seen" noise)', () => {
    expect(detectStateTransitions({}, { relay: 'ON' })).toEqual([]);
    expect(detectStateTransitions({ relay: 'ON' }, {})).toEqual([]);
  });
});

describe('detectStateTransitions — protocol-agnostic rules', () => {
  it('records zigbee boolean transitions, serialized as strings', () => {
    expect(
      detectStateTransitions({ contact: true }, { contact: false }),
    ).toEqual([{ property: 'contact', prevValue: 'true', value: 'false' }]);
  });

  it('records boolean → string transitions across types', () => {
    expect(detectStateTransitions({ relay: false }, { relay: 'ON' })).toEqual([
      { property: 'relay', prevValue: 'false', value: 'ON' },
    ]);
  });

  it('ignores numeric strings (measurements published as strings)', () => {
    expect(
      detectStateTransitions({ noise: '41.2' }, { noise: '43.8' }),
    ).toEqual([]);
  });

  it('ignores ISO-date strings (zigbee last_seen style) and excluded keys', () => {
    expect(
      detectStateTransitions(
        { last_seen: '2026-06-10T13:00:00Z', when: '2026-06-10T13:00:00Z' },
        { last_seen: '2026-06-10T14:00:00Z', when: '2026-06-10T14:00:00Z' },
      ),
    ).toEqual([]);
  });

  it('ignores nested objects (zigbee update/color blocks)', () => {
    expect(
      detectStateTransitions(
        { update: { state: 'idle' } },
        { update: { state: 'available' } },
      ),
    ).toEqual([]);
  });

  it('caps the transitions per message at 20', () => {
    const prev: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) {
      prev[`f${i}`] = 'a';
      next[`f${i}`] = 'b';
    }
    expect(detectStateTransitions(prev, next)).toHaveLength(20);
  });
});
