import { Logger } from '@nestjs/common';
import * as path from 'path';
import lgtv from 'lgtv2';
import {
  DeviceDefinition,
  DeviceDriver,
  DriverHost,
} from '../../types';
import { wake } from '../../util/wol';

type LgTv = ReturnType<typeof lgtv>;
type LgTvFactory = typeof lgtv;

/** webOS SSAP endpoints (LG's local websocket API on port 3000). */
const SSAP = {
  volume: 'ssap://audio/getVolume',
  setVolume: 'ssap://audio/setVolume',
  setMute: 'ssap://audio/setMute',
  foregroundApp: 'ssap://com.webos.applicationManager/getForegroundAppInfo',
  launchPoints: 'ssap://com.webos.applicationManager/listLaunchPoints',
  externalInputs: 'ssap://tv/getExternalInputList',
  switchInput: 'ssap://tv/switchInput',
  launch: 'ssap://system.launcher/launch',
  turnOff: 'ssap://system/turnOff',
} as const;

/**
 * LG webOS driver: a persistent websocket to the TV via `lgtv2` (auto-reconnect;
 * the pairing client-key is persisted under dataDir, first connect shows an
 * accept-prompt on the TV). Power-on is Wake-on-LAN — an off TV has no socket.
 *
 * State mapping (aggregate JSON): power ON/OFF (socket up/down), volume 0-100,
 * mute ON/OFF, input (external input label), app (launch point title).
 */
export class WebosDriver implements DeviceDriver {
  private readonly logger: Logger;
  private tv?: LgTv;
  private connected = false;
  /** label → webOS id maps for the select options. */
  private inputsByLabel = new Map<string, string>();
  private appsByTitle = new Map<string, string>();
  /** appId → input label, to derive the current input from the foreground app. */
  private inputLabelByAppId = new Map<string, string>();
  private appTitleById = new Map<string, string>();

  constructor(
    readonly definition: DeviceDefinition,
    private readonly host: DriverHost,
    private readonly dataDir: string,
    private readonly connectFn: LgTvFactory = lgtv,
  ) {
    this.logger = new Logger(`WebosDriver:${definition.id}`);
  }

  start(): void {
    this.tv = this.connectFn({
      url: `ws://${this.definition.ip}:3000`,
      keyFile: path.join(this.dataDir, `webos-key-${this.definition.id}`),
      reconnect: 7000,
    });

    this.tv.on('prompt', () =>
      this.logger.warn('Pairing: accept the connection prompt on the TV.'),
    );
    this.tv.on('connect', () => {
      this.connected = true;
      this.logger.log('Connected to TV.');
      this.host.publishState({ power: 'ON' });
      this.subscribeState();
      this.fetchCapabilities();
    });
    this.tv.on('close', () => {
      if (this.connected) this.logger.warn('TV connection closed.');
      this.connected = false;
      this.host.publishState({ power: 'OFF' });
    });
    // Fires repeatedly while the TV is off (connection refused) — debug only.
    this.tv.on('error', (err: Error) =>
      this.logger.debug(`Socket: ${err.message}`),
    );
  }

  stop(): void {
    this.tv?.disconnect();
    this.connected = false;
  }

  async handleCommand(property: string, value: string): Promise<void> {
    switch (property) {
      case 'power':
        return this.setPower(value.toUpperCase() === 'ON');
      case 'volume':
        return this.request(SSAP.setVolume, { volume: clampVolume(value) });
      case 'mute':
        return this.request(SSAP.setMute, {
          mute: value.toUpperCase() === 'ON',
        });
      case 'input': {
        const inputId = this.inputsByLabel.get(value);
        if (!inputId) throw new Error(`Unknown input "${value}"`);
        return this.request(SSAP.switchInput, { inputId });
      }
      case 'app': {
        const appId = this.appsByTitle.get(value);
        if (!appId) throw new Error(`Unknown app "${value}"`);
        return this.request(SSAP.launch, { id: appId });
      }
      default:
        throw new Error(`Unsupported property "${property}"`);
    }
  }

  private async setPower(on: boolean): Promise<void> {
    if (on) {
      if (this.connected) return; // already on
      if (!this.definition.mac) {
        throw new Error(
          'Cannot power on: no "mac" configured for Wake-on-LAN.',
        );
      }
      await wake(this.definition.mac);
      return;
    }
    if (this.connected) await this.request(SSAP.turnOff, {});
  }

  private request(uri: string, payload: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.tv || !this.connected) {
        return reject(new Error('TV is not connected'));
      }
      this.tv.request(uri, payload, (err) => (err ? reject(err) : resolve()));
    });
  }

  private subscribeState(): void {
    if (!this.tv) return;

    this.tv.subscribe(SSAP.volume, (err, res) => {
      if (err || !res) return;
      // Payload shape varies by webOS version: {volume,muted} or {volumeStatus:{...}}.
      const status = (res.volumeStatus ?? res) as Record<string, unknown>;
      const volume = status.volume;
      const muted = status.muteStatus ?? status.muted ?? res.muted;
      const partial: Record<string, unknown> = {};
      if (typeof volume === 'number') partial.volume = volume;
      if (typeof muted === 'boolean') partial.mute = muted ? 'ON' : 'OFF';
      if (Object.keys(partial).length) this.host.publishState(partial);
    });

    this.tv.subscribe(SSAP.foregroundApp, (err, res) => {
      if (err || !res) return;
      const appId = String(res.appId ?? '');
      if (!appId) return;
      const partial: Record<string, unknown> = {};
      const inputLabel = this.inputLabelByAppId.get(appId);
      if (inputLabel) partial.input = inputLabel;
      const appTitle = this.appTitleById.get(appId);
      if (appTitle) partial.app = appTitle;
      if (Object.keys(partial).length) this.host.publishState(partial);
    });
  }

  private fetchCapabilities(): void {
    if (!this.tv) return;

    this.tv.request(SSAP.externalInputs, (err, res) => {
      if (err || !Array.isArray(res?.devices)) return;
      this.inputsByLabel.clear();
      this.inputLabelByAppId.clear();
      for (const d of res.devices as Array<Record<string, unknown>>) {
        const id = String(d.id ?? '');
        const label = String(d.label ?? d.id ?? '');
        if (!id || !label) continue;
        this.inputsByLabel.set(label, id);
        if (d.appId) this.inputLabelByAppId.set(String(d.appId), label);
      }
      this.host.capabilitiesChanged({
        inputs: [...this.inputsByLabel.keys()],
      });
    });

    this.tv.request(SSAP.launchPoints, (err, res) => {
      if (err || !Array.isArray(res?.launchPoints)) return;
      this.appsByTitle.clear();
      this.appTitleById.clear();
      for (const lp of res.launchPoints as Array<Record<string, unknown>>) {
        const id = String(lp.id ?? '');
        const title = String(lp.title ?? '');
        if (!id || !title) continue;
        this.appsByTitle.set(title, id);
        this.appTitleById.set(id, title);
      }
      this.host.capabilitiesChanged({ apps: [...this.appsByTitle.keys()] });
    });
  }
}

function clampVolume(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid volume "${value}"`);
  return Math.min(100, Math.max(0, Math.round(n)));
}
