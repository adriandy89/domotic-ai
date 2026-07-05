import { buildTvConfig } from './build-tv-config';
import { DeviceDefinition } from '../types';

const def: DeviceDefinition = {
  type: 'webos',
  id: 'tv_salon',
  name: 'TV Salón',
  ip: '192.168.1.50',
  mac: 'AA:BB:CC:DD:EE:FF',
};

describe('buildTvConfig', () => {
  it('builds a device-based bundle on the wifi base topic', () => {
    const config = buildTvConfig('home-1', def, {});
    expect(config['~']).toBe('home/id/home-1/wifi/tv_salon');
    expect(config.avty_t).toBe('~/availability');
    expect((config.dev as any).ids).toEqual(['tv_salon']);
    expect((config.dev as any).name).toBe('TV Salón');

    const cmps = config.cmps as Record<string, Record<string, unknown>>;
    expect(Object.keys(cmps).sort()).toEqual(['mute', 'power', 'volume']);
    expect(cmps.power).toMatchObject({
      p: 'switch',
      stat_t: '~/state',
      val_tpl: '{{value_json.power}}',
      cmd_t: '~/set/power',
      pl_on: 'ON',
      pl_off: 'OFF',
    });
    expect(cmps.volume).toMatchObject({
      p: 'number',
      cmd_t: '~/set/volume',
      min: 0,
      max: 100,
      step: 1,
    });
  });

  it('adds input/app selects only once options are known', () => {
    const none = buildTvConfig('home-1', def, { inputs: [], apps: [] });
    expect((none.cmps as any).input).toBeUndefined();
    expect((none.cmps as any).app).toBeUndefined();

    const config = buildTvConfig('home-1', def, {
      inputs: ['HDMI 1', 'HDMI 2'],
      apps: ['Netflix', 'YouTube'],
    });
    const cmps = config.cmps as Record<string, Record<string, unknown>>;
    expect(cmps.input).toMatchObject({
      p: 'select',
      cmd_t: '~/set/input',
      ops: ['HDMI 1', 'HDMI 2'],
      val_tpl: '{{value_json.input}}',
    });
    expect(cmps.app).toMatchObject({
      p: 'select',
      cmd_t: '~/set/app',
      ops: ['Netflix', 'YouTube'],
    });
  });
});
