import { DeviceDefinition, DriverCapabilities } from '../types';

/**
 * Build the retained HA MQTT Discovery bundle for a TV, published to
 * `home/id/{home}/discovery/device/{id}/config`. The platform's hadiscovery
 * adapter derives everything from it:
 *  - entity topics under `home/id/{home}/wifi/{id}` → protocol `wifi` (plug&play)
 *  - shared `~/state` topic → aggregate JSON ingestion via the value_templates
 *  - per-property command topics `~/set/{property}` → the bridge subscribes there
 *
 * Select components (input/app) are only included once their options are known —
 * an empty enum action would validate nothing. The config is republished (retained)
 * when the driver reports capabilities; mqtt-core merges by component id.
 */
export function buildTvConfig(
  homeUniqueId: string,
  def: DeviceDefinition,
  caps: Partial<DriverCapabilities>,
  model?: string,
): Record<string, unknown> {
  const base = `home/id/${homeUniqueId}/wifi/${def.id}`;

  const cmps: Record<string, Record<string, unknown>> = {
    power: {
      p: 'switch',
      name: 'Power',
      uniq_id: `${def.id}_power`,
      stat_t: '~/state',
      val_tpl: '{{value_json.power}}',
      cmd_t: '~/set/power',
      pl_on: 'ON',
      pl_off: 'OFF',
    },
    volume: {
      p: 'number',
      name: 'Volume',
      uniq_id: `${def.id}_volume`,
      stat_t: '~/state',
      val_tpl: '{{value_json.volume}}',
      cmd_t: '~/set/volume',
      min: 0,
      max: 100,
      step: 1,
    },
    mute: {
      p: 'switch',
      name: 'Mute',
      uniq_id: `${def.id}_mute`,
      stat_t: '~/state',
      val_tpl: '{{value_json.mute}}',
      cmd_t: '~/set/mute',
      pl_on: 'ON',
      pl_off: 'OFF',
    },
  };

  if (caps.inputs?.length) {
    cmps.input = {
      p: 'select',
      name: 'Input',
      uniq_id: `${def.id}_input`,
      stat_t: '~/state',
      val_tpl: '{{value_json.input}}',
      cmd_t: '~/set/input',
      ops: caps.inputs,
    };
  }
  if (caps.apps?.length) {
    cmps.app = {
      p: 'select',
      name: 'App',
      uniq_id: `${def.id}_app`,
      stat_t: '~/state',
      val_tpl: '{{value_json.app}}',
      cmd_t: '~/set/app',
      ops: caps.apps,
    };
  } else if (def.type === 'androidtv') {
    // The Remote v2 protocol reports the foreground app but can't enumerate
    // launchable apps — expose it read-only.
    cmps.app = {
      p: 'sensor',
      name: 'App',
      uniq_id: `${def.id}_app`,
      stat_t: '~/state',
      val_tpl: '{{value_json.app}}',
    };
  }

  return {
    dev: {
      ids: [def.id],
      name: def.name,
      ...(model ? { mdl: model } : {}),
    },
    o: { name: 'lan-bridge' },
    '~': base,
    avty_t: '~/availability',
    cmps,
  };
}
