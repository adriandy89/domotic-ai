import { EventEmitter } from 'events';
import { BridgeConfig } from '../config';
import { PairingService, PairingEvents } from './pairing.service';

jest.useFakeTimers();

const config: BridgeConfig = {
  homeUniqueId: 'home-1',
  mqttUrl: 'mqtt://localhost',
  mqttClientId: 'test',
  dataDir: '/data',
  devices: [],
  discoveryEnabled: false,
};

class FakeProbe extends EventEmitter {
  disconnected = false;
  disconnect() {
    this.disconnected = true;
  }
}

function makeService(candidates: Array<{ ip: string; usn?: string; location?: string }>) {
  const service = new PairingService(config);
  const probes = new Map<string, FakeProbe>();
  const events: PairingEvents = {
    isManaged: jest.fn().mockReturnValue(false),
    onPaired: jest.fn(),
    onStateChange: jest.fn(),
  };
  service.bind(events);

  (service as any).scanFn = jest.fn().mockResolvedValue(candidates);
  (service as any).nameFn = jest.fn().mockResolvedValue('Salón TV');
  (service as any).macFn = jest.fn().mockResolvedValue('AA:BB:CC:DD:EE:FF');
  (service as any).connectFn = jest.fn((opts: { url: string }) => {
    const ip = /ws:\/\/(.+):3000/.exec(opts.url)![1];
    const probe = new FakeProbe();
    probes.set(ip, probe);
    return probe;
  });

  return { service, events, probes };
}

const CANDIDATE = {
  ip: '192.168.1.50',
  usn: 'uuid:1f2e3d4c-5b6a-7788-99aa-bbccddeeff00::urn:lge-com:service:webos-second-screen:1',
  location: 'http://192.168.1.50:1900/desc.xml',
};

describe('PairingService', () => {
  afterEach(() => jest.clearAllTimers());

  it('opens the window, probes a candidate and pairs it on TV accept', async () => {
    const { service, events, probes } = makeService([CANDIDATE]);

    service.setPairing(true);
    expect(events.onStateChange).toHaveBeenCalledWith({ pairing: 'ON' });

    // Let the async scan + name fetch resolve.
    await jest.advanceTimersByTimeAsync(10);
    const probe = probes.get('192.168.1.50')!;
    expect(probe).toBeDefined();

    // The user accepts the prompt on the TV.
    probe.emit('connect');
    await jest.advanceTimersByTimeAsync(10);

    expect(events.onPaired).toHaveBeenCalledWith({
      type: 'webos',
      id: 'webos_1f2e3d4c',
      name: 'Salón TV',
      ip: '192.168.1.50',
      mac: 'AA:BB:CC:DD:EE:FF',
    });
    expect(probe.disconnected).toBe(true);
  });

  it('skips candidates that are already managed', async () => {
    const { service, events } = makeService([CANDIDATE]);
    (events.isManaged as jest.Mock).mockReturnValue(true);

    service.setPairing(true);
    await jest.advanceTimersByTimeAsync(10);

    expect((service as any).connectFn).not.toHaveBeenCalled();
    expect(events.onPaired).not.toHaveBeenCalled();
  });

  it('closes the window after the timeout and reports unpaired candidates', async () => {
    const { service, events, probes } = makeService([CANDIDATE]);

    service.setPairing(true);
    await jest.advanceTimersByTimeAsync(10);
    expect(probes.size).toBe(1);

    // Nobody accepts the prompt; the 60s window expires.
    await jest.advanceTimersByTimeAsync(61_000);

    expect(service.isActive).toBe(false);
    expect(events.onPaired).not.toHaveBeenCalled();
    const lastCall = (events.onStateChange as jest.Mock).mock.calls.at(-1)![0];
    expect(lastCall.pairing).toBe('OFF');
    expect(lastCall.discovered).toContain('not paired');
  });

  it('setPairing(false) closes the window early', async () => {
    const { service, events } = makeService([]);
    service.setPairing(true);
    await jest.advanceTimersByTimeAsync(10);
    service.setPairing(false);

    const lastCall = (events.onStateChange as jest.Mock).mock.calls.at(-1)![0];
    expect(lastCall.pairing).toBe('OFF');
    expect(service.isActive).toBe(false);
  });
});
