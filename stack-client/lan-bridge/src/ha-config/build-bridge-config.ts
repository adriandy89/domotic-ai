/**
 * The bridge's OWN discovery bundle: it registers itself as a `wifi` device so
 * the dashboard (and the AI via send-device-command) can open the pairing
 * window and read discovery results — the same UX as zigbee2mqtt's
 * `permit_join`. No platform change needed: `pairing` is a plain switch.
 */
export function buildBridgeConfig(
  homeUniqueId: string,
  bridgeId: string,
): Record<string, unknown> {
  const base = `home/id/${homeUniqueId}/wifi/${bridgeId}`;
  return {
    dev: { ids: [bridgeId], name: 'LAN Bridge', mdl: 'lan-bridge' },
    o: { name: 'lan-bridge' },
    '~': base,
    avty_t: '~/availability',
    cmps: {
      pairing: {
        p: 'switch',
        name: 'Pairing mode',
        uniq_id: `${bridgeId}_pairing`,
        stat_t: '~/state',
        val_tpl: '{{value_json.pairing}}',
        cmd_t: '~/set/pairing',
        pl_on: 'ON',
        pl_off: 'OFF',
      },
      devices: {
        p: 'sensor',
        name: 'Managed devices',
        uniq_id: `${bridgeId}_devices`,
        stat_t: '~/state',
        val_tpl: '{{value_json.devices}}',
      },
      discovered: {
        p: 'sensor',
        name: 'Last discovery',
        uniq_id: `${bridgeId}_discovered`,
        stat_t: '~/state',
        val_tpl: '{{value_json.discovered}}',
      },
    },
  };
}
