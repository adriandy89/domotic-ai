import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  EdgeBundle,
  EdgeDeviceMeta,
  EdgeRule,
} from '../vendor/rules-evaluator';
import { SqliteService } from '../store/sqlite.service';

/**
 * In-memory view of the current rules bundle with lookups the engine needs.
 * Loaded from SQLite at boot and replaced by the sync service (Phase 4).
 */
@Injectable()
export class RulesStoreService implements OnModuleInit {
  private readonly logger = new Logger(RulesStoreService.name);

  private bundle: EdgeBundle | null = null;
  private devicesById = new Map<string, EdgeDeviceMeta>();
  private devicesByUniqueId = new Map<string, EdgeDeviceMeta>();
  /** internal device id → rules that reference it in a condition. */
  private rulesByDeviceId = new Map<string, EdgeRule[]>();

  constructor(private readonly sqlite: SqliteService) {}

  onModuleInit(): void {
    const stored = this.sqlite.getBundle();
    if (stored) {
      this.setBundle(stored);
      this.logger.log(
        `Loaded bundle v${stored.version}: ${stored.rules.length} rules, ${stored.schedules.length} schedules`,
      );
    } else {
      this.logger.warn('No rules bundle yet; waiting for sync.');
    }
  }

  setBundle(bundle: EdgeBundle): void {
    this.bundle = bundle;
    this.devicesById = new Map(bundle.devices.map((d) => [d.id, d]));
    this.devicesByUniqueId = new Map(
      bundle.devices.map((d) => [d.uniqueId, d]),
    );
    this.rulesByDeviceId = new Map();
    for (const rule of bundle.rules) {
      if (!rule.active) continue;
      const deviceIds = new Set(rule.conditions.map((c) => c.device_id));
      for (const id of deviceIds) {
        const list = this.rulesByDeviceId.get(id) ?? [];
        list.push(rule);
        this.rulesByDeviceId.set(id, list);
      }
    }
  }

  get version(): number {
    return this.bundle?.version ?? 0;
  }

  get timezone(): string | null {
    return this.bundle?.timezone ?? null;
  }

  get schedules() {
    return this.bundle?.schedules ?? [];
  }

  get rules() {
    return this.bundle?.rules ?? [];
  }

  deviceById(id: string): EdgeDeviceMeta | undefined {
    return this.devicesById.get(id);
  }

  deviceByUniqueId(uniqueId: string): EdgeDeviceMeta | undefined {
    return this.devicesByUniqueId.get(uniqueId);
  }

  /** Active rules whose conditions reference this internal device id. */
  rulesForDevice(deviceId: string): EdgeRule[] {
    return this.rulesByDeviceId.get(deviceId) ?? [];
  }
}
