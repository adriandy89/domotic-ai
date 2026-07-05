import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BRIDGE_CONFIG, BridgeConfig } from '../config';
import { DeviceStoreService } from '../store/device-store.service';
import { ANDROIDTV_MDNS_TYPE, mdnsSearch } from './mdns';
import { ssdpSearch, WEBOS_ST } from './ssdp';

const SCAN_WINDOW_MS = 5000;
const SCAN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Passive background discovery: periodically M-SEARCHes for known TV
 * signatures and logs any device that is not yet managed, so the user knows
 * there is something to pair. Actual pairing happens on demand through the
 * bridge device's `pairing` switch (see PairingService) — this service never
 * adds anything by itself.
 */
@Injectable()
export class DiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscoveryService.name);
  private readonly announced = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig,
    private readonly deviceStore: DeviceStoreService,
  ) {}

  onModuleInit(): void {
    if (!this.config.discoveryEnabled) return;
    void this.scan();
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async scan(): Promise<void> {
    const [webos, android] = await Promise.all([
      ssdpSearch(WEBOS_ST, SCAN_WINDOW_MS),
      mdnsSearch(ANDROIDTV_MDNS_TYPE, SCAN_WINDOW_MS),
    ]);
    for (const c of webos) {
      this.report('LG webOS TV', c.ip, 'accept the prompt on the TV');
    }
    for (const c of android) {
      this.report(
        `Android TV "${c.name}"`,
        c.ip,
        'type the on-screen code in "Pairing code"',
      );
    }
  }

  private report(kind: string, ip: string, how: string): void {
    if (this.deviceStore.hasIp(ip) || this.announced.has(ip)) return;
    this.announced.add(ip);
    this.logger.log(
      `${kind} discovered at ${ip} — not paired yet. ` +
        `Turn ON "Pairing mode" on the LAN Bridge card and ${how}.`,
    );
  }
}
