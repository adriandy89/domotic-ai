import { EventEmitter } from 'events';
import { RemoteDirection, RemoteKeyCode } from 'androidtv-remote';
import { DeviceDefinition, DriverHost } from '../../types';
import { AndroidTvDriver } from './androidtv.driver';

jest.mock('./cert-store', () => ({
  loadCert: jest.fn().mockReturnValue({ key: 'K', cert: 'C' }),
  saveCert: jest.fn(),
}));

class FakeRemote extends EventEmitter {
  keys: Array<{ key: number; direction: number }> = [];
  powerCalls = 0;
  stopped = false;

  start = jest.fn().mockResolvedValue(true);
  sendPower() {
    this.powerCalls++;
  }
  sendKey(key: number, direction: number) {
    this.keys.push({ key, direction });
  }
  sendAppLink() {}
  sendCode() {
    return true;
  }
  getCertificate() {
    return { key: 'K', cert: 'C' };
  }
  stop() {
    this.stopped = true;
  }
}

const def: DeviceDefinition = {
  type: 'androidtv',
  id: 'androidtv_192_168_1_60',
  name: 'Salón Google TV',
  ip: '192.168.1.60',
};

function makeDriver() {
  const remote = new FakeRemote();
  const host: DriverHost = {
    publishState: jest.fn(),
    publishAvailability: jest.fn(),
    capabilitiesChanged: jest.fn(),
  };
  const driver = new AndroidTvDriver(def, host, '/data', () => remote as any);
  return { driver, remote, host };
}

describe('AndroidTvDriver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps powered / volume / current_app events to aggregate state', () => {
    const { driver, remote, host } = makeDriver();
    driver.start();

    remote.emit('powered', true);
    expect(host.publishState).toHaveBeenCalledWith({ power: 'ON' });

    remote.emit('volume', { level: 12, maximum: 24, muted: false });
    expect(host.publishState).toHaveBeenCalledWith({
      volume: 50,
      mute: 'OFF',
    });

    remote.emit('current_app', 'com.netflix.ninja');
    expect(host.publishState).toHaveBeenCalledWith({
      app: 'com.netflix.ninja',
    });
  });

  it('power command toggles only when the state differs', async () => {
    const { driver, remote } = makeDriver();
    driver.start();
    remote.emit('powered', false);

    await driver.handleCommand('power', 'ON');
    expect(remote.powerCalls).toBe(1);

    // Already ON now.
    remote.emit('powered', true);
    await driver.handleCommand('power', 'ON');
    expect(remote.powerCalls).toBe(1);

    await driver.handleCommand('power', 'OFF');
    expect(remote.powerCalls).toBe(2);
  });

  it('volume command steps with paced VOLUME_UP/DOWN keys', async () => {
    const { driver, remote } = makeDriver();
    driver.start();
    remote.emit('volume', { level: 10, maximum: 20, muted: false }); // 50%

    await driver.handleCommand('volume', '65'); // target level 13 → +3 steps
    expect(remote.keys).toHaveLength(3);
    expect(remote.keys[0]).toEqual({
      key: RemoteKeyCode.KEYCODE_VOLUME_UP,
      direction: RemoteDirection.SHORT,
    });

    remote.keys = [];
    // Level cache updates only via events, so it is still 10 → target 8 → -2.
    await driver.handleCommand('volume', '40');
    expect(remote.keys).toHaveLength(2);
    expect(remote.keys[0].key).toBe(RemoteKeyCode.KEYCODE_VOLUME_DOWN);
  });

  it('mute toggles via KEYCODE_VOLUME_MUTE only when it differs', async () => {
    const { driver, remote } = makeDriver();
    driver.start();
    remote.emit('volume', { level: 5, maximum: 20, muted: false });

    await driver.handleCommand('mute', 'ON');
    expect(remote.keys).toEqual([
      {
        key: RemoteKeyCode.KEYCODE_VOLUME_MUTE,
        direction: RemoteDirection.SHORT,
      },
    ]);

    remote.keys = [];
    await driver.handleCommand('mute', 'OFF'); // still believed unmuted
    expect(remote.keys).toHaveLength(0);
  });

  it('warns and stays inert without a pairing certificate', async () => {
    const { loadCert } = jest.requireMock('./cert-store');
    loadCert.mockReturnValueOnce(undefined);
    const { driver, remote } = makeDriver();
    driver.start();
    expect(remote.start).not.toHaveBeenCalled();
    await expect(driver.handleCommand('power', 'ON')).rejects.toThrow(
      'not paired',
    );
  });
});
