import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeConfig } from '../config';
import { DeviceDefinition } from '../types';
import { DeviceStoreService } from './device-store.service';

function makeConfig(dataDir: string, devices: DeviceDefinition[] = []): BridgeConfig {
  return {
    homeUniqueId: 'home-1',
    mqttUrl: 'mqtt://localhost',
    mqttClientId: 'test',
    dataDir,
    devices,
    discoveryEnabled: false,
  };
}

const tv = (id: string, ip: string): DeviceDefinition => ({
  type: 'webos',
  id,
  name: id,
  ip,
});

describe('DeviceStoreService', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-bridge-store-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts from the env seed and persists it', () => {
    const store = new DeviceStoreService(makeConfig(dir, [tv('tv_a', '10.0.0.2')]));
    expect(store.load().map((d) => d.id)).toEqual(['tv_a']);
    expect(fs.existsSync(path.join(dir, 'devices.json'))).toBe(true);
  });

  it('add() persists across instances; file wins over env for same id', () => {
    const store = new DeviceStoreService(makeConfig(dir));
    store.load();
    store.add(tv('tv_paired', '10.0.0.9'));

    // Second run: env seeds the same id with another ip — file entry wins.
    const again = new DeviceStoreService(
      makeConfig(dir, [
        { ...tv('tv_paired', '10.0.0.250') },
        tv('tv_new', '10.0.0.3'),
      ]),
    );
    const loaded = again.load();
    expect(loaded.find((d) => d.id === 'tv_paired')?.ip).toBe('10.0.0.9');
    expect(loaded.map((d) => d.id).sort()).toEqual(['tv_new', 'tv_paired']);
  });

  it('has() / hasIp() reflect the registry', () => {
    const store = new DeviceStoreService(makeConfig(dir, [tv('tv_a', '10.0.0.2')]));
    store.load();
    expect(store.has('tv_a')).toBe(true);
    expect(store.hasIp('10.0.0.2')).toBe(true);
    expect(store.has('nope')).toBe(false);
    expect(store.hasIp('10.0.0.99')).toBe(false);
  });
});
