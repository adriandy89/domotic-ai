import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BRIDGE_CONFIG, BridgeConfig } from '../config';
import { DeviceDefinition } from '../types';

/**
 * Runtime device registry, persisted at `DATA_DIR/devices.json` so devices
 * paired from the dashboard survive restarts. The `DEVICES` env var acts as a
 * seed: its entries are added once when their id is not already in the file;
 * the file is the source of truth afterwards.
 */
@Injectable()
export class DeviceStoreService {
  private readonly logger = new Logger(DeviceStoreService.name);
  private readonly devices = new Map<string, DeviceDefinition>();
  private readonly file: string;

  constructor(@Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig) {
    this.file = path.join(config.dataDir, 'devices.json');
  }

  /** Load file entries, then env seeds for ids not present. Returns all. */
  load(): DeviceDefinition[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(parsed)) {
        for (const d of parsed as DeviceDefinition[]) this.devices.set(d.id, d);
      }
    } catch {
      // First run (no file yet) — start from the env seed only.
    }

    let seeded = false;
    for (const d of this.config.devices) {
      if (!this.devices.has(d.id)) {
        this.devices.set(d.id, d);
        seeded = true;
      }
    }
    if (seeded) this.save();

    return this.all();
  }

  all(): DeviceDefinition[] {
    return [...this.devices.values()];
  }

  has(id: string): boolean {
    return this.devices.has(id);
  }

  hasIp(ip: string): boolean {
    return this.all().some((d) => d.ip === ip);
  }

  add(def: DeviceDefinition): void {
    this.devices.set(def.id, def);
    this.save();
    this.logger.log(`Device ${def.id} (${def.ip}) persisted.`);
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.all(), null, 2));
  }
}
