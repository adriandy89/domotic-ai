import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DbService } from '@app/db';

/** In-memory view of one active monitor, keyed by its internal source Device.id. */
export interface MonitorConfig {
  id: string;
  sourceDeviceId: string;
  homeUniqueId: string;
  applianceUniqueId: string;
  powerField: string;
  runThresholdW: number;
  idleThresholdW: number;
  minRunSeconds: number;
  minFinishSeconds: number;
}

const RELOAD_INTERVAL_MS = 60_000;

/**
 * Loads active appliance monitors into an in-memory index keyed by the source
 * plug's internal Device.id (which matches ISensorData.deviceId), refreshed on a
 * timer so config changes propagate without a bespoke NATS hook. The index gives
 * the hot path (every sensor event) an O(1) early-return filter.
 */
@Injectable()
export class ConfigStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConfigStoreService.name);
  private bySource = new Map<string, MonitorConfig>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: DbService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    this.timer = setInterval(() => {
      this.reload().catch((e) => this.logger.error('Monitor reload failed', e));
    }, RELOAD_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  monitorForSource(sourceDeviceId: string): MonitorConfig | undefined {
    return this.bySource.get(sourceDeviceId);
  }

  private async reload(): Promise<void> {
    const rows = await this.db.applianceMonitor.findMany({
      where: { active: true },
      select: {
        id: true,
        source_device_id: true,
        home_unique_id: true,
        appliance_unique_id: true,
        power_field: true,
        run_threshold_w: true,
        idle_threshold_w: true,
        min_run_seconds: true,
        min_finish_seconds: true,
      },
    });
    const next = new Map<string, MonitorConfig>();
    for (const m of rows) {
      next.set(m.source_device_id, {
        id: m.id,
        sourceDeviceId: m.source_device_id,
        homeUniqueId: m.home_unique_id,
        applianceUniqueId: m.appliance_unique_id,
        powerField: m.power_field,
        runThresholdW: Number(m.run_threshold_w),
        idleThresholdW: Number(m.idle_threshold_w),
        minRunSeconds: m.min_run_seconds,
        minFinishSeconds: m.min_finish_seconds,
      });
    }
    this.bySource = next;
  }
}
