import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import { AndroidRemote } from 'androidtv-remote';
import lgtv from 'lgtv2';
import { BRIDGE_CONFIG, BridgeConfig } from '../config';
import { ANDROIDTV_MDNS_TYPE, mdnsSearch, MdnsCandidate } from '../discovery/mdns';
import {
  deviceIdFromUsn,
  fetchFriendlyName,
  ssdpSearch,
  SsdpCandidate,
  WEBOS_ST,
} from '../discovery/ssdp';
import { saveCert } from '../drivers/androidtv/cert-store';
import { DeviceDefinition } from '../types';
import { lookupMac } from '../util/arp';

const PAIRING_WINDOW_MS = 60_000;
const SCAN_EVERY_MS = 10_000;
const SCAN_BURST_MS = 5_000;

/** Wiring provided by BridgeService (avoids a circular DI dependency). */
export interface PairingEvents {
  /** True when the candidate is already managed (by id or ip). */
  isManaged(id: string, ip: string): boolean;
  /** A TV accepted the pairing prompt — persist and attach it. */
  onPaired(def: DeviceDefinition): void;
  /** Publish the bridge device's `pairing` / `discovered` state. */
  onStateChange(state: Record<string, unknown>): void;
}

/**
 * On-demand pairing, zigbee2mqtt `permit_join` style: while the window is open
 * (60s) the LAN is scanned via SSDP and every unmanaged webOS TV gets a
 * connection attempt. That attempt makes the TV show its own accept-prompt —
 * accepting it on the TV IS the authorization — and once connected the device
 * is persisted (name from SSDP description, MAC from ARP for Wake-on-LAN) and
 * attached live. Nothing is ever added without the on-TV confirmation.
 */
@Injectable()
export class PairingService implements OnModuleDestroy {
  private readonly logger = new Logger(PairingService.name);
  private events?: PairingEvents;
  private active = false;
  private scanTimer?: NodeJS.Timeout;
  private windowTimer?: NodeJS.Timeout;
  private readonly probes = new Map<string, ReturnType<typeof lgtv>>();
  private results: string[] = [];
  /**
   * Android TV pairing in progress: the TV is showing its 6-char code and we
   * wait for the user to write it to the bridge's `pairing_code` property.
   * One at a time — the code on screen is unambiguous that way.
   */
  private awaitingCode?: {
    remote: AndroidRemote;
    def: DeviceDefinition;
  };

  // Injection points for tests.
  protected scanFn: typeof ssdpSearch = ssdpSearch;
  protected mdnsFn: typeof mdnsSearch = mdnsSearch;
  protected connectFn: typeof lgtv = lgtv;
  protected androidFn: (ip: string, name: string) => AndroidRemote = (ip, name) =>
    new AndroidRemote(ip, { service_name: name });
  protected macFn: typeof lookupMac = lookupMac;
  protected nameFn: typeof fetchFriendlyName = fetchFriendlyName;

  constructor(@Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig) {}

  bind(events: PairingEvents): void {
    this.events = events;
  }

  get isActive(): boolean {
    return this.active;
  }

  setPairing(on: boolean): void {
    if (on) this.start();
    else this.stop('stopped');
  }

  onModuleDestroy(): void {
    if (this.active) this.stop('shutdown');
  }

  private start(): void {
    if (this.active || !this.events) return;
    this.active = true;
    this.results = [];
    this.logger.log('Pairing window open (60s): scanning the LAN…');
    this.events.onStateChange({ pairing: 'ON' });

    void this.scanOnce();
    this.scanTimer = setInterval(() => void this.scanOnce(), SCAN_EVERY_MS);
    this.windowTimer = setTimeout(() => this.stop('timeout'), PAIRING_WINDOW_MS);
    this.scanTimer.unref();
    this.windowTimer.unref();
  }

  private stop(reason: string): void {
    if (!this.active) return;
    this.active = false;
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.windowTimer) clearTimeout(this.windowTimer);
    for (const [ip, probe] of this.probes) {
      try {
        probe.disconnect();
      } catch {
        // best effort
      }
      this.results.push(`${ip}: found, not paired (prompt not accepted)`);
      this.probes.delete(ip);
    }
    if (this.awaitingCode) {
      try {
        this.awaitingCode.remote.stop();
      } catch {
        // best effort
      }
      this.results.push(
        `${this.awaitingCode.def.ip}: found, not paired (code not entered)`,
      );
      this.awaitingCode = undefined;
    }
    const summary = this.results.length
      ? this.results.join(' | ')
      : 'nothing new found';
    this.logger.log(`Pairing window closed (${reason}): ${summary}`);
    this.events?.onStateChange({
      pairing: 'OFF',
      discovered: summary,
      pairing_code: '',
    });
  }

  /** The user typed the code the Android TV is showing (`…/set/pairing_code`). */
  submitCode(code: string): void {
    const pending = this.awaitingCode;
    const trimmed = code.trim().toUpperCase();
    if (!pending || !trimmed) return;
    this.logger.log(`Submitting pairing code for ${pending.def.ip}…`);
    try {
      pending.remote.sendCode(trimmed);
    } catch (err: any) {
      this.logger.warn(`Pairing code rejected: ${err?.message ?? err}`);
      this.events?.onStateChange({
        discovered: `${pending.def.name} (${pending.def.ip}): wrong code — check the TV and type it again`,
      });
    }
  }

  private async scanOnce(): Promise<void> {
    const [webos, android] = await Promise.all([
      this.scanFn(WEBOS_ST, SCAN_BURST_MS),
      this.mdnsFn(ANDROIDTV_MDNS_TYPE, SCAN_BURST_MS),
    ]);
    if (!this.active) return;
    for (const c of webos) void this.probe(c);
    for (const c of android) this.probeAndroid(c);
  }

  /**
   * Android TV: connecting makes the TV display a 6-char code; the user writes
   * it to `pairing_code` (see submitCode) and on success the trusted client
   * certificate is persisted for the driver.
   */
  private probeAndroid(candidate: MdnsCandidate): void {
    if (!this.active || !this.events || this.awaitingCode) return;
    const { ip } = candidate;
    const id = `androidtv_${ip.replace(/[^0-9]/g, '_')}`;
    if (this.events.isManaged(id, ip)) return;

    const name = candidate.name || `Android TV ${ip}`;
    const def: DeviceDefinition = { type: 'androidtv', id, name, ip };
    const remote = this.androidFn(ip, 'domotic-lan-bridge');
    this.awaitingCode = { remote, def };

    remote.on('secret', () => {
      this.logger.log(
        `"${name}" (${ip}) is showing a pairing code — write it to "Pairing code" on the LAN Bridge card.`,
      );
      this.events?.onStateChange({
        discovered: `${name} (${ip}) is showing a code on screen — type it in "Pairing code"`,
      });
    });
    remote.on('ready', () => {
      if (this.awaitingCode?.remote !== remote) return;
      this.awaitingCode = undefined;
      const cert = remote.getCertificate();
      try {
        remote.stop();
      } catch {
        // best effort
      }
      saveCert(this.config.dataDir, id, cert);
      void (async () => {
        const mac = await this.macFn(ip);
        const paired: DeviceDefinition = { ...def, mac };
        this.results.push(`${name} (${ip}) paired`);
        this.logger.log(`Paired "${name}" (${ip}) as ${id}.`);
        this.events?.onPaired(paired);
        this.events?.onStateChange({
          discovered: this.results.join(' | '),
          pairing_code: '',
        });
      })();
    });
    remote.on('error', (err: any) =>
      this.logger.debug(`Android pairing (${ip}): ${err?.message ?? err}`),
    );

    remote.start().catch((err: any) => {
      this.logger.debug(`Android pairing start failed (${ip}): ${err?.message ?? err}`);
      if (this.awaitingCode?.remote === remote) this.awaitingCode = undefined;
    });
  }

  private async probe(candidate: SsdpCandidate): Promise<void> {
    if (!this.active || !this.events) return;
    const { ip } = candidate;
    if (this.probes.has(ip)) return;

    const id =
      deviceIdFromUsn(candidate.usn) ??
      `webos_${ip.replace(/[^0-9]/g, '_')}`;
    if (this.events.isManaged(id, ip)) return;

    const name = (await this.nameFn(candidate.location)) ?? `LG TV ${ip}`;
    if (!this.active || this.probes.has(ip)) return;
    this.logger.log(
      `Found "${name}" at ${ip} — connecting; accept the prompt on the TV to pair.`,
    );

    // Same keyFile the WebosDriver uses, so the accepted client-key is reused
    // by the real driver right after pairing.
    const probe = this.connectFn({
      url: `ws://${ip}:3000`,
      keyFile: path.join(this.config.dataDir, `webos-key-${id}`),
      reconnect: false,
    });
    this.probes.set(ip, probe);

    probe.on('error', () => {
      // Unreachable / refused — drop silently; the window may retry later.
    });
    probe.on('connect', () => {
      void (async () => {
        this.probes.delete(ip);
        try {
          probe.disconnect();
        } catch {
          // best effort
        }
        const mac = await this.macFn(ip);
        const def: DeviceDefinition = { type: 'webos', id, name, ip, mac };
        this.results.push(
          `${name} (${ip}) paired${mac ? '' : ', no MAC (power-on unavailable)'}`,
        );
        this.logger.log(`Paired "${name}" (${ip}) as ${id}.`);
        this.events?.onPaired(def);
        this.events?.onStateChange({ discovered: this.results.join(' | ') });
      })();
    });
  }
}
