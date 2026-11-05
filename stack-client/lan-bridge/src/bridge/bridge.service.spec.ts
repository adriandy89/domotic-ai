import { BridgeConfig } from '../config';
import { PairingEvents } from '../pairing/pairing.service';
import { DeviceDefinition, DriverHost } from '../types';
import { BridgeService } from './bridge.service';

interface MockDriver {
  definition: DeviceDefinition;
  host: DriverHost;
  start: jest.Mock;
  stop: jest.Mock;
  handleCommand: jest.Mock;
}

const mockDrivers: MockDriver[] = [];
/** What a driver's start() does (e.g. report "unpaired" synchronously). */
let mockOnStart: (host: DriverHost, def: DeviceDefinition) => void = () => undefined;
jest.mock('../drivers/driver.factory', () => ({
  createDriver: jest.fn((definition: DeviceDefinition, host: DriverHost) => {
    const driver: MockDriver = {
      definition,
      host,
      start: jest.fn(() => mockOnStart(host, definition)),
      stop: jest.fn(),
      handleCommand: jest.fn().mockResolvedValue(undefined),
    };
    mockDrivers.push(driver);
    return driver;
  }),
}));

const config: BridgeConfig = {
  homeUniqueId: 'home-1234567890',
  mqttUrl: 'mqtt://localhost',
  mqttClientId: 'test',
  dataDir: '/data',
  devices: [],
  discoveryEnabled: false,
};
const BRIDGE_STATE = 'home/id/home-1234567890/wifi/lanbridge_home-123/state';

const tv: DeviceDefinition = {
  type: 'androidtv',
  id: 'tv_salon',
  name: 'Salón',
  ip: '192.168.1.65',
};

function makeBridge(devices: DeviceDefinition[] = [tv]) {
  const stored = new Map(devices.map((d) => [d.id, d]));
  const store = {
    load: () => [...stored.values()],
    all: () => [...stored.values()],
    has: (id: string) => stored.has(id),
    hasIp: (ip: string) => [...stored.values()].some((d) => d.ip === ip),
    add: jest.fn((d: DeviceDefinition) => stored.set(d.id, d)),
  };
  const mqtt = { onMessage: jest.fn(), subscribe: jest.fn(), publish: jest.fn() };
  let events: PairingEvents | undefined;
  const pairing = {
    bind: jest.fn((e: PairingEvents) => (events = e)),
    setPairing: jest.fn(),
    submitCode: jest.fn(),
  };
  const bridge = new BridgeService(config, mqtt as any, store as any, pairing as any);
  bridge.onModuleInit();
  return { bridge, mqtt, store, events: events! };
}

function lastPublished(mqtt: { publish: jest.Mock }, topic: string) {
  return mqtt.publish.mock.calls.filter(([t]) => t === topic).at(-1)?.[1];
}

function lastState(mqtt: { publish: jest.Mock }, topic: string) {
  const call = mqtt.publish.mock.calls.filter(([t]) => t === topic).at(-1);
  return call ? JSON.parse(call[1]) : undefined;
}

describe('BridgeService — re-pairing a TV that forgot us', () => {
  beforeEach(() => {
    mockDrivers.length = 0;
    mockOnStart = () => undefined;
    jest.clearAllMocks();
  });

  it('a paired TV is managed and not offered for re-pairing', () => {
    const { events } = makeBridge();
    expect(events.isManaged('androidtv_192_168_1_65', tv.ip)).toBe(true);
    expect(events.repairTarget('androidtv', tv.ip)).toBeUndefined();
  });

  it('once the TV rejects our certificate it becomes pairable again, in place', () => {
    const { events, mqtt } = makeBridge();
    mockDrivers[0].host.unpaired();

    expect(events.isManaged('androidtv_192_168_1_65', tv.ip)).toBe(false);
    expect(events.repairTarget('androidtv', tv.ip)).toEqual(tv);
    expect(events.repairTarget('webos', tv.ip)).toBeUndefined();
    expect(lastState(mqtt, BRIDGE_STATE).discovered).toContain(
      'Salón (192.168.1.65) must be paired again',
    );
  });

  it('re-pairing replaces the stale driver with a fresh one', () => {
    const { events, store } = makeBridge();
    const stale = mockDrivers[0];
    stale.host.unpaired();

    events.onPaired({ ...tv, mac: 'AA:BB:CC:DD:EE:FF' });

    expect(stale.stop).toHaveBeenCalled();
    expect(mockDrivers).toHaveLength(2);
    expect(mockDrivers[1].definition.mac).toBe('AA:BB:CC:DD:EE:FF');
    expect(mockDrivers[1].start).toHaveBeenCalled();
    expect(store.add).toHaveBeenCalledWith({ ...tv, mac: 'AA:BB:CC:DD:EE:FF' });
    expect(events.isManaged(tv.id, tv.ip)).toBe(true);
    expect(events.repairTarget('androidtv', tv.ip)).toBeUndefined();
  });

  it('a managed TV without a certificate (env seed, lost file) ends offline and pairable', () => {
    mockOnStart = (host) => {
      host.publishAvailability(false);
      host.unpaired();
    };
    const { events, mqtt } = makeBridge();

    expect(
      lastPublished(mqtt, 'home/id/home-1234567890/wifi/tv_salon/availability'),
    ).toBe('offline');
    expect(events.repairTarget('androidtv', tv.ip)).toEqual(tv);
  });

  it('only the rejected device is released: another one on the same ip stays managed', () => {
    const lg: DeviceDefinition = { type: 'webos', id: 'lg_tv', name: 'LG', ip: tv.ip };
    const { events } = makeBridge([tv, lg]);
    mockDrivers[0].host.unpaired();

    expect(events.isManaged('lg_tv', tv.ip)).toBe(true);
    expect(events.repairTarget('webos', tv.ip)).toBeUndefined();
  });

  it('a late "unpaired" from the replaced driver does not mark the re-paired one', () => {
    const { events } = makeBridge();
    const stale = mockDrivers[0];
    stale.host.unpaired();
    events.onPaired({ ...tv });

    stale.host.unpaired();

    expect(events.isManaged(tv.id, tv.ip)).toBe(true);
    expect(events.repairTarget('androidtv', tv.ip)).toBeUndefined();
  });
});
