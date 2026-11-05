import { Logger } from '@nestjs/common';
import {
  AndroidRemote,
  RemoteDirection,
  RemoteKeyCode,
} from 'androidtv-remote';
import { DeviceDefinition, DeviceDriver, DriverHost } from '../../types';
import { loadCert } from './cert-store';

type AndroidRemoteFactory = (
  host: string,
  options: ConstructorParameters<typeof AndroidRemote>[1],
) => AndroidRemote;

const defaultFactory: AndroidRemoteFactory = (host, options) =>
  new AndroidRemote(host, options);

/** Volume key presses are paced so the TV doesn't drop the burst. */
const VOLUME_STEP_MS = 120;
const VOLUME_MAX_STEPS = 30;

/**
 * Android/Google TV driver over the Remote v2 protocol (TLS port 6466) via
 * `androidtv-remote`, authenticated with the client certificate persisted at
 * pairing time (see PairingService). The remote service stays reachable in
 * standby, so power ON/OFF are both `sendPower()` toggles — no Wake-on-LAN.
 *
 * State: power (powered event), volume 0-100 + mute (volume event, scaled from
 * the TV's own maximum), app (current foreground package — read-only). The
 * protocol has no absolute volume set, so volume commands are emitted as paced
 * VOLUME_UP/DOWN key presses from the last reported level.
 */
export class AndroidTvDriver implements DeviceDriver {
  private readonly logger: Logger;
  private remote?: AndroidRemote;
  private powered = false;
  private lastLevel?: number;
  private maximum = 100;
  private muted = false;
  private rejected = false;

  constructor(
    readonly definition: DeviceDefinition,
    private readonly host: DriverHost,
    private readonly dataDir: string,
    private readonly factory: AndroidRemoteFactory = defaultFactory,
  ) {
    this.logger = new Logger(`AndroidTvDriver:${definition.id}`);
  }

  start(): void {
    const cert = loadCert(this.dataDir, this.definition.id);
    if (!cert) {
      this.requestPairing(
        'No pairing certificate found — turn on Pairing on the LAN Bridge card and type the code shown on the TV.',
      );
      return;
    }

    this.remote = this.factory(this.definition.ip, {
      cert,
      service_name: 'domotic-lan-bridge',
    });

    this.remote.on('ready', () => this.logger.log('Connected to TV.'));
    this.remote.on('powered', (powered: boolean) => {
      this.powered = powered;
      this.host.publishState({ power: powered ? 'ON' : 'OFF' });
    });
    this.remote.on(
      'volume',
      (volume: { level: number; maximum: number; muted: boolean }) => {
        if (typeof volume?.level !== 'number') return;
        this.lastLevel = volume.level;
        this.maximum = volume.maximum > 0 ? volume.maximum : 100;
        this.muted = !!volume.muted;
        this.host.publishState({
          volume: Math.round((volume.level * 100) / this.maximum),
          mute: this.muted ? 'ON' : 'OFF',
        });
      },
    );
    this.remote.on('current_app', (app: string) => {
      if (app) this.host.publishState({ app });
    });
    this.remote.on('unpaired', () => this.onUnpaired());
    this.remote.on('error', (err: any) =>
      this.logger.debug(`Remote: ${err?.message ?? err}`),
    );

    this.remote.start().catch((err: any) => {
      this.logger.warn(`Connection failed: ${err?.message ?? err}`);
    });
  }

  stop(): void {
    try {
      this.remote?.stop();
    } catch {
      // socket already gone
    }
    this.remote = undefined;
  }

  /**
   * The TV refused our client certificate (pairing forgotten after a reset /
   * update, or removed from its remotes list). Retrying can't work: go offline
   * and let the bridge offer the TV for pairing again.
   */
  private onUnpaired(): void {
    this.requestPairing(
      'The TV no longer trusts this bridge (pairing certificate rejected) — turn on Pairing on the LAN Bridge card and type the code shown on the TV.',
    );
  }

  /** Offline + offered for pairing again (once). */
  private requestPairing(reason: string): void {
    if (this.rejected) return;
    this.rejected = true;
    this.logger.warn(reason);
    this.stop();
    this.host.publishAvailability(false);
    this.host.unpaired();
  }

  async handleCommand(property: string, value: string): Promise<void> {
    if (!this.remote) throw new Error('TV is not paired');
    switch (property) {
      case 'power': {
        const wantOn = value.toUpperCase() === 'ON';
        if (wantOn !== this.powered) this.remote.sendPower();
        return;
      }
      case 'mute': {
        const wantMute = value.toUpperCase() === 'ON';
        if (wantMute !== this.muted) {
          this.remote.sendKey(
            RemoteKeyCode.KEYCODE_VOLUME_MUTE,
            RemoteDirection.SHORT,
          );
        }
        return;
      }
      case 'volume':
        return this.setVolume(value);
      default:
        throw new Error(`Unsupported property "${property}"`);
    }
  }

  /** No absolute set in the protocol: step with paced VOLUME_UP/DOWN keys. */
  private async setVolume(value: string): Promise<void> {
    const pct = Number(value);
    if (!Number.isFinite(pct)) throw new Error(`Invalid volume "${value}"`);
    if (this.lastLevel === undefined) {
      throw new Error('Volume unknown yet — try again in a moment');
    }
    const target = Math.round(
      (Math.min(100, Math.max(0, pct)) * this.maximum) / 100,
    );
    const delta = target - this.lastLevel;
    const key =
      delta > 0
        ? RemoteKeyCode.KEYCODE_VOLUME_UP
        : RemoteKeyCode.KEYCODE_VOLUME_DOWN;
    const steps = Math.min(Math.abs(delta), VOLUME_MAX_STEPS);
    const remote = this.remote;
    for (let i = 0; i < steps; i++) {
      // Stopped mid-ramp (unpaired, re-paired, shutdown): give up quietly.
      if (!remote || this.remote !== remote) return;
      remote.sendKey(key, RemoteDirection.SHORT);
      await new Promise((r) => setTimeout(r, VOLUME_STEP_MS));
    }
  }
}
