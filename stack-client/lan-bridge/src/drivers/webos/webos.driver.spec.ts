import { EventEmitter } from 'events';
import { DeviceDefinition, DriverHost } from '../../types';
import { WebosDriver } from './webos.driver';

jest.mock('../../util/wol', () => ({
  wake: jest.fn().mockResolvedValue(undefined),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wake } = require('../../util/wol');

/** Fake lgtv2 connection: records calls, lets tests fire events/responses. */
class FakeTv extends EventEmitter {
  requests: Array<{ uri: string; payload?: unknown }> = [];
  subscriptions = new Map<string, (err: Error | null, res?: any) => void>();
  requestHandlers = new Map<string, any>();
  disconnected = false;

  request(uri: string, payloadOrCb?: any, cb?: any): void {
    const payload = typeof payloadOrCb === 'function' ? undefined : payloadOrCb;
    const callback = typeof payloadOrCb === 'function' ? payloadOrCb : cb;
    this.requests.push({ uri, payload });
    const canned = this.requestHandlers.get(uri);
    if (callback) callback(null, canned);
  }

  subscribe(uri: string, payloadOrCb?: any, cb?: any): void {
    const callback = typeof payloadOrCb === 'function' ? payloadOrCb : cb;
    this.subscriptions.set(uri, callback);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

const def: DeviceDefinition = {
  type: 'webos',
  id: 'tv_salon',
  name: 'TV Salón',
  ip: '192.168.1.50',
  mac: 'AA:BB:CC:DD:EE:FF',
};

function makeDriver(definition: DeviceDefinition = def) {
  const tv = new FakeTv();
  const host: DriverHost = {
    publishState: jest.fn(),
    publishAvailability: jest.fn(),
    capabilitiesChanged: jest.fn(),
    unpaired: jest.fn(),
  };
  const connectFn = jest.fn().mockReturnValue(tv);
  const driver = new WebosDriver(definition, host, '/data', connectFn as any);
  return { driver, tv, host, connectFn };
}

describe('WebosDriver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('connects to ws://ip:3000 with a per-device key file', () => {
    const { driver, connectFn } = makeDriver();
    driver.start();
    expect(connectFn).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'ws://192.168.1.50:3000',
        keyFile: '/data/webos-key-tv_salon',
      }),
    );
  });

  it('publishes power ON/OFF from socket connect/close', () => {
    const { driver, tv, host } = makeDriver();
    driver.start();
    tv.emit('connect');
    expect(host.publishState).toHaveBeenCalledWith({ power: 'ON' });
    tv.emit('close');
    expect(host.publishState).toHaveBeenCalledWith({ power: 'OFF' });
  });

  it('maps volume subscription payloads (both webOS shapes)', () => {
    const { driver, tv, host } = makeDriver();
    driver.start();
    tv.emit('connect');
    const onVolume = tv.subscriptions.get('ssap://audio/getVolume')!;

    onVolume(null, { volume: 12, muted: false });
    expect(host.publishState).toHaveBeenCalledWith({
      volume: 12,
      mute: 'OFF',
    });

    onVolume(null, { volumeStatus: { volume: 30, muteStatus: true } });
    expect(host.publishState).toHaveBeenCalledWith({ volume: 30, mute: 'ON' });
  });

  it('reports capabilities and derives current input/app from foreground app', () => {
    const { driver, tv, host } = makeDriver();
    tv.requestHandlers.set('ssap://tv/getExternalInputList', {
      devices: [
        { id: 'HDMI_1', label: 'HDMI 1', appId: 'com.webos.app.hdmi1' },
      ],
    });
    tv.requestHandlers.set(
      'ssap://com.webos.applicationManager/listLaunchPoints',
      { launchPoints: [{ id: 'netflix', title: 'Netflix' }] },
    );
    driver.start();
    tv.emit('connect');

    expect(host.capabilitiesChanged).toHaveBeenCalledWith({
      inputs: ['HDMI 1'],
    });
    expect(host.capabilitiesChanged).toHaveBeenCalledWith({
      apps: ['Netflix'],
    });

    const onApp = tv.subscriptions.get(
      'ssap://com.webos.applicationManager/getForegroundAppInfo',
    )!;
    onApp(null, { appId: 'com.webos.app.hdmi1' });
    expect(host.publishState).toHaveBeenCalledWith({ input: 'HDMI 1' });
    onApp(null, { appId: 'netflix' });
    expect(host.publishState).toHaveBeenCalledWith({ app: 'Netflix' });
  });

  it('routes commands to the right SSAP endpoints', async () => {
    const { driver, tv } = makeDriver();
    tv.requestHandlers.set('ssap://tv/getExternalInputList', {
      devices: [{ id: 'HDMI_1', label: 'HDMI 1' }],
    });
    tv.requestHandlers.set(
      'ssap://com.webos.applicationManager/listLaunchPoints',
      { launchPoints: [{ id: 'netflix', title: 'Netflix' }] },
    );
    driver.start();
    tv.emit('connect');

    await driver.handleCommand('volume', '25');
    expect(tv.requests).toContainEqual({
      uri: 'ssap://audio/setVolume',
      payload: { volume: 25 },
    });

    await driver.handleCommand('mute', 'ON');
    expect(tv.requests).toContainEqual({
      uri: 'ssap://audio/setMute',
      payload: { mute: true },
    });

    await driver.handleCommand('input', 'HDMI 1');
    expect(tv.requests).toContainEqual({
      uri: 'ssap://tv/switchInput',
      payload: { inputId: 'HDMI_1' },
    });

    await driver.handleCommand('app', 'Netflix');
    expect(tv.requests).toContainEqual({
      uri: 'ssap://system.launcher/launch',
      payload: { id: 'netflix' },
    });

    await driver.handleCommand('power', 'OFF');
    expect(tv.requests).toContainEqual({
      uri: 'ssap://system/turnOff',
      payload: {},
    });
  });

  it('power ON uses Wake-on-LAN when disconnected', async () => {
    const { driver, tv } = makeDriver();
    driver.start();
    await driver.handleCommand('power', 'ON');
    expect(wake).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
    expect(tv.requests).toHaveLength(0);
  });

  it('power ON without a MAC fails with a clear error', async () => {
    const { driver } = makeDriver({ ...def, mac: undefined });
    driver.start();
    await expect(driver.handleCommand('power', 'ON')).rejects.toThrow(
      'Wake-on-LAN',
    );
  });

  it('rejects commands while the TV is unreachable', async () => {
    const { driver } = makeDriver();
    driver.start();
    await expect(driver.handleCommand('volume', '10')).rejects.toThrow(
      'not connected',
    );
  });
});
