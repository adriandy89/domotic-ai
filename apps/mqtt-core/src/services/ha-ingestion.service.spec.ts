import { HaIngestionService } from './ha-ingestion.service';

type AnyMock = jest.Mock;

/** A device-based HA discovery payload for a lan-bridge TV with a `power` switch. */
const TV_DISCOVERY = {
  dev: { ids: ['tv1'], name: 'TV de Dormitorio' },
  o: { name: 'lan-bridge' },
  '~': 'home/id/home-1/wifi/tv1',
  avty_t: '~/availability',
  cmps: {
    power: {
      p: 'switch',
      name: 'Power',
      uniq_id: 'tv1_power',
      stat_t: '~/state',
      val_tpl: '{{value_json.power}}',
      cmd_t: '~/set/power',
      pl_on: 'ON',
      pl_off: 'OFF',
    },
  },
};

const REST = ['device', 'tv1', 'config'];

function makeService(opts: {
  edgeEnabled: boolean;
  existingAttributes: unknown;
}) {
  const db = {
    home: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'h1',
        organization_id: 'org-1',
        edge_enabled: opts.edgeEnabled,
      }) as AnyMock,
    },
    device: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'dev1',
        attributes: opts.existingAttributes,
      }) as AnyMock,
      update: jest.fn().mockResolvedValue({}) as AnyMock,
      create: jest.fn() as AnyMock,
    },
  };
  const homeRegistry = {};
  const deviceRegistry = { hasDeviceQuota: jest.fn().mockResolvedValue(true) };
  const sensorIngestion = {};
  const edgeBundlePublisher = { publish: jest.fn().mockResolvedValue(undefined) as AnyMock };

  const service = new HaIngestionService(
    db as any,
    homeRegistry as any,
    deviceRegistry as any,
    sensorIngestion as any,
    edgeBundlePublisher as any,
  );
  return { service, db, edgeBundlePublisher };
}

const staleAttrs = { source: 'hadiscovery', protocol: 'wifi', config: { cmps: {} } };

describe('HaIngestionService — edge bundle republish on discovery change (F2)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('republishes the bundle (debounced) when an edge home device gains a command topic', async () => {
    const { service, edgeBundlePublisher } = makeService({
      edgeEnabled: true,
      existingAttributes: staleAttrs, // no command topics yet → will change
    });

    await service.handleHaDiscovery('home-1', REST, Buffer.from(JSON.stringify(TV_DISCOVERY)));

    // Debounced: nothing yet.
    expect(edgeBundlePublisher.publish).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10_000);
    expect(edgeBundlePublisher.publish).toHaveBeenCalledWith('home-1');
  });

  it('does NOT republish for a non-edge home', async () => {
    const { service, edgeBundlePublisher } = makeService({
      edgeEnabled: false,
      existingAttributes: staleAttrs,
    });
    await service.handleHaDiscovery('home-1', REST, Buffer.from(JSON.stringify(TV_DISCOVERY)));
    jest.advanceTimersByTime(60_000);
    expect(edgeBundlePublisher.publish).not.toHaveBeenCalled();
  });

  it('does NOT republish when the attributes are unchanged (identical retained re-delivery)', async () => {
    // Pre-seed the existing device with the SAME config the discovery carries.
    const identical = {
      source: 'hadiscovery',
      protocol: 'wifi',
      config: TV_DISCOVERY,
    };
    const { service, edgeBundlePublisher } = makeService({
      edgeEnabled: true,
      existingAttributes: identical,
    });
    await service.handleHaDiscovery('home-1', REST, Buffer.from(JSON.stringify(TV_DISCOVERY)));
    jest.advanceTimersByTime(60_000);
    expect(edgeBundlePublisher.publish).not.toHaveBeenCalled();
  });

  it('coalesces a discovery burst into a single republish', async () => {
    const { service, edgeBundlePublisher } = makeService({
      edgeEnabled: true,
      existingAttributes: staleAttrs,
    });
    // Two discovery messages within the debounce window.
    await service.handleHaDiscovery('home-1', REST, Buffer.from(JSON.stringify(TV_DISCOVERY)));
    jest.advanceTimersByTime(3_000);
    await service.handleHaDiscovery('home-1', REST, Buffer.from(JSON.stringify(TV_DISCOVERY)));
    jest.advanceTimersByTime(10_000);
    expect(edgeBundlePublisher.publish).toHaveBeenCalledTimes(1);
  });
});
