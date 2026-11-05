import { EventEmitter } from 'events';
import { BridgeConfig } from '../config';
import { PairingService, PairingEvents } from './pairing.service';

jest.mock('../drivers/androidtv/cert-store', () => ({
  loadCert: jest.fn(),
  saveCert: jest.fn(),
}));

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
    repairTarget: jest.fn().mockReturnValue(undefined),
    onPaired: jest.fn(),
    onStateChange: jest.fn(),
  };
  service.bind(events);

  (service as any).scanFn = jest.fn().mockResolvedValue(candidates);
  (service as any).mdnsFn = jest.fn().mockResolvedValue([]);
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

  it('pairs an Android TV once the user submits the on-screen code', async () => {
    const { service, events } = makeService([]);
    class FakeAndroidRemote extends EventEmitter {
      started = false;
      sentCode?: string;
      stopped = false;
      start = jest.fn(async () => {
        this.started = true;
        return true;
      });
      sendCode(code: string) {
        this.sentCode = code;
        this.emit('ready');
        return true;
      }
      getCertificate() {
        return { key: 'K', cert: 'C' };
      }
      stop() {
        this.stopped = true;
      }
    }
    const androidRemote = new FakeAndroidRemote();
    (service as any).mdnsFn = jest
      .fn()
      .mockResolvedValue([{ ip: '192.168.1.60', name: 'Salón Google TV', port: 6466 }]);
    (service as any).androidFn = jest.fn().mockReturnValue(androidRemote);

    service.setPairing(true);
    await jest.advanceTimersByTimeAsync(10);
    expect(androidRemote.started).toBe(true);

    // The TV shows its code…
    androidRemote.emit('secret');
    await jest.advanceTimersByTimeAsync(10);
    const secretState = (events.onStateChange as jest.Mock).mock.calls.at(-1)![0];
    expect(secretState.discovered).toContain('Pairing code');

    // …and the user types it on the card.
    service.submitCode(' 1a2b3c ');
    await jest.advanceTimersByTimeAsync(10);

    expect(androidRemote.sentCode).toBe('1A2B3C');
    expect(events.onPaired).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'androidtv',
        id: 'androidtv_192_168_1_60',
        name: 'Salón Google TV',
        ip: '192.168.1.60',
        mac: 'AA:BB:CC:DD:EE:FF',
      }),
    );
    expect(androidRemote.stopped).toBe(true);
  });

  it('re-pairs in place a managed Android TV that rejected our certificate', async () => {
    const { saveCert } = jest.requireMock('../drivers/androidtv/cert-store');
    const { service, events } = makeService([]);
    const stale = {
      type: 'androidtv' as const,
      id: 'tv_salon',
      name: 'Salón',
      ip: '192.168.1.65',
      mac: '11:22:33:44:55:66',
    };
    (events.repairTarget as jest.Mock).mockImplementation((type, ip) =>
      type === 'androidtv' && ip === stale.ip ? stale : undefined,
    );
    class FakeAndroidRemote extends EventEmitter {
      start = jest.fn().mockResolvedValue(true);
      sendCode() {
        this.emit('ready');
        return true;
      }
      getCertificate() {
        return { key: 'NEWK', cert: 'NEWC' };
      }
      stop() {}
    }
    const androidRemote = new FakeAndroidRemote();
    (service as any).mdnsFn = jest
      .fn()
      .mockResolvedValue([{ ip: '192.168.1.65', name: 'Google TV 4K', port: 6466 }]);
    (service as any).androidFn = jest.fn().mockReturnValue(androidRemote);
    (service as any).macFn = jest.fn().mockResolvedValue(undefined);

    service.setPairing(true);
    await jest.advanceTimersByTimeAsync(10);
    expect(androidRemote.start).toHaveBeenCalled();
    androidRemote.emit('secret');
    // The user sees which TV answered and which device it will replace.
    const shown = (events.onStateChange as jest.Mock).mock.calls.at(-1)![0];
    expect(shown.discovered).toContain('Google TV 4K');
    expect(shown.discovered).toContain('Salón');
    service.submitCode('ABC123');
    await jest.advanceTimersByTimeAsync(10);

    // Same id/name (the platform keeps the device and its rules), new cert.
    expect(saveCert).toHaveBeenCalledWith('/data', 'tv_salon', {
      key: 'NEWK',
      cert: 'NEWC',
    });
    expect(events.onPaired).toHaveBeenCalledWith({
      type: 'androidtv',
      id: 'tv_salon',
      name: 'Salón',
      ip: '192.168.1.65',
      mac: '11:22:33:44:55:66', // ARP miss keeps the known MAC
    });
  });

  describe('Android TV pairing that does not complete', () => {
    /** Mirrors androidtv-remote: a wrong code destroys the pairing session. */
    class FailingAndroidRemote extends EventEmitter {
      private finish!: (v: boolean | undefined) => void;
      start = jest.fn(
        () => new Promise<boolean | undefined>((r) => (this.finish = r)),
      );
      sendCode = jest.fn(() => {
        this.finish(undefined);
        return false;
      });
      cancelOnTv() {
        this.finish(undefined);
      }
      getCertificate() {
        return { key: 'K', cert: 'C' };
      }
      stop() {}
    }

    function setup() {
      const { service, events } = makeService([]);
      const remotes: FailingAndroidRemote[] = [];
      (service as any).mdnsFn = jest
        .fn()
        .mockResolvedValue([{ ip: '192.168.1.60', name: 'Salón Google TV', port: 6466 }]);
      (service as any).androidFn = jest.fn(() => {
        const r = new FailingAndroidRemote();
        remotes.push(r);
        return r;
      });
      return { service, events, remotes };
    }

    it('a wrong code is reported and the next scan shows a new code', async () => {
      const { service, events, remotes } = setup();
      service.setPairing(true);
      await jest.advanceTimersByTimeAsync(10);
      remotes[0].emit('secret');

      service.submitCode('ZZZZZZ');
      await jest.advanceTimersByTimeAsync(10);
      const state = (events.onStateChange as jest.Mock).mock.calls.at(-1)![0];
      expect(state.discovered).toContain('wrong code');
      expect(events.onPaired).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(10_000); // next scan
      expect(remotes).toHaveLength(2);
    });

    it('a pairing cancelled on the TV frees the slot for the next scan', async () => {
      const { service, remotes } = setup();
      service.setPairing(true);
      await jest.advanceTimersByTimeAsync(10);

      remotes[0].cancelOnTv();
      await jest.advanceTimersByTimeAsync(10_000);
      expect(remotes).toHaveLength(2);
    });

    it('an accepted code keeps waiting even if the first remote connect fails', async () => {
      const { service, events, remotes } = setup();
      service.setPairing(true);
      await jest.advanceTimersByTimeAsync(10);
      const remote = remotes[0];
      remote.sendCode.mockImplementationOnce(() => true); // right code

      service.submitCode('ABC123');
      // Pairing done, but the remote port refused the first try: start()
      // resolves falsy while the library keeps retrying in the background…
      remote.cancelOnTv();
      await jest.advanceTimersByTimeAsync(10);
      // …and the retry connects.
      remote.emit('ready');
      await jest.advanceTimersByTimeAsync(10);

      expect(events.onPaired).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'androidtv_192_168_1_60' }),
      );
    });

    it('a TV that rejects us right after pairing frees the slot too', async () => {
      const { service, remotes } = setup();
      service.setPairing(true);
      await jest.advanceTimersByTimeAsync(10);

      remotes[0].emit('unpaired');
      await jest.advanceTimersByTimeAsync(10_000);
      expect(remotes).toHaveLength(2);
    });
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
