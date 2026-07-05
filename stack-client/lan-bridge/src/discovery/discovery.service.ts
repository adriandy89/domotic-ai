import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BRIDGE_CONFIG, BridgeConfig } from '../config';
import { DeviceStoreService } from '../store/device-store.service';
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
    const candidates = await ssdpSearch(WEBOS_ST, SCAN_WINDOW_MS);
    for (const c of candidates) {
      if (this.deviceStore.hasIp(c.ip) || this.announced.has(c.ip)) continue;
      this.announced.add(c.ip);
      this.logger.log(
        `LG webOS TV discovered at ${c.ip} — not paired yet. ` +
          'Turn ON "Pairing mode" on the LAN Bridge card (or send {"pairing":"ON"}) and accept the prompt on the TV.',
      );
    }
  }
}
