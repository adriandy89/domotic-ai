import { loadConfig } from './config';

describe('loadConfig — DEVICES parsing', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, HOME_UNIQUE_ID: 'home-1' };
    delete process.env.DEVICES;
    delete process.env.DEVICES_FILE;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('unset DEVICES → no seed', () => {
    expect(loadConfig().devices).toEqual([]);
  });

  it('EMPTY DEVICES (docker-compose passes "" when unset) → no seed, no crash', () => {
    process.env.DEVICES = '';
    expect(loadConfig().devices).toEqual([]);
    process.env.DEVICES = '   ';
    expect(loadConfig().devices).toEqual([]);
  });

  it('valid DEVICES seed parses', () => {
    process.env.DEVICES =
      '[{"type":"webos","id":"tv_salon","name":"TV","ip":"192.168.1.50"}]';
    expect(loadConfig().devices).toEqual([
      { type: 'webos', id: 'tv_salon', name: 'TV', ip: '192.168.1.50', mac: undefined },
    ]);
  });

  it('malformed DEVICES still fails loudly (real misconfig)', () => {
    process.env.DEVICES = '[{broken';
    expect(() => loadConfig()).toThrow('not valid JSON');
  });

  it('empty DEVICES_FILE var is ignored', () => {
    process.env.DEVICES_FILE = '';
    expect(loadConfig().devices).toEqual([]);
  });
});
