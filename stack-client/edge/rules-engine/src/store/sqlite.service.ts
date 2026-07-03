import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { EdgeBundle } from '../vendor/rules-evaluator';
import { EDGE_CONFIG, EdgeConfig } from '../config';

export interface BufferedExecution {
  dedup_key: string;
  rule_id: string;
  device_id: string | null;
  triggered_at: number;
  conditions_met: boolean;
  executed: boolean;
  results_count: number;
  source: 'rule' | 'schedule' | 'watchdog';
  error: string | null;
}

/**
 * Thin better-sqlite3 wrapper. Owns the on-disk edge state: the synced rules
 * bundle, latest device telemetry, state-transition history, and the buffer of
 * executions waiting to be uploaded to central.
 */
@Injectable()
export class SqliteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqliteService.name);
  private db!: Database.Database;

  constructor(@Inject(EDGE_CONFIG) private readonly config: EdgeConfig) {}

  onModuleInit(): void {
    mkdirSync(dirname(this.config.sqlitePath), { recursive: true });
    this.db = new Database(this.config.sqlitePath);
    this.db.pragma('journal_mode = WAL');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    this.db.exec(schema);
    this.logger.log(`SQLite ready at ${this.config.sqlitePath}`);
  }

  onModuleDestroy(): void {
    this.db?.close();
  }

  // ── Rules bundle ───────────────────────────────────────────────────────────
  saveBundle(bundle: EdgeBundle): void {
    this.db
      .prepare(
        `INSERT INTO rules_cache (id, version, bundle, synced_at)
         VALUES (1, @version, @bundle, @synced_at)
         ON CONFLICT(id) DO UPDATE SET
           version = excluded.version,
           bundle = excluded.bundle,
           synced_at = excluded.synced_at`,
      )
      .run({
        version: bundle.version,
        bundle: JSON.stringify(bundle),
        synced_at: Date.now(),
      });
  }

  getBundle(): EdgeBundle | null {
    const row = this.db
      .prepare(`SELECT bundle FROM rules_cache WHERE id = 1`)
      .get() as { bundle: string } | undefined;
    return row ? (JSON.parse(row.bundle) as EdgeBundle) : null;
  }

  // ── Device telemetry ────────────────────────────────────────────────────────
  upsertDeviceState(deviceUniqueId: string, data: Record<string, any>): void {
    this.db
      .prepare(
        `INSERT INTO device_state (device_unique_id, data, updated_at)
         VALUES (@id, @data, @ts)
         ON CONFLICT(device_unique_id) DO UPDATE SET
           data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run({ id: deviceUniqueId, data: JSON.stringify(data), ts: Date.now() });
  }

  getDeviceState(
    deviceUniqueId: string,
  ): { data: Record<string, any>; updated_at: number } | null {
    const row = this.db
      .prepare(
        `SELECT data, updated_at FROM device_state WHERE device_unique_id = ?`,
      )
      .get(deviceUniqueId) as
      | { data: string; updated_at: number }
      | undefined;
    return row
      ? { data: JSON.parse(row.data), updated_at: row.updated_at }
      : null;
  }

  recordStateEvent(
    deviceUniqueId: string,
    property: string,
    value: unknown,
    timestamp = Date.now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO state_events (device_unique_id, property, value, timestamp)
         VALUES (?, ?, ?, ?)`,
      )
      .run(deviceUniqueId, property, String(value), timestamp);
  }

  /** Newest-first recent events for a device attribute (bounded). */
  recentStateEvents(
    deviceUniqueId: string,
    property: string,
    limit = 50,
  ): { value: string; timestamp: number }[] {
    return this.db
      .prepare(
        `SELECT value, timestamp FROM state_events
         WHERE device_unique_id = ? AND property = ?
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(deviceUniqueId, property, limit) as {
      value: string;
      timestamp: number;
    }[];
  }

  pruneStateEvents(olderThanMs: number): void {
    this.db
      .prepare(`DELETE FROM state_events WHERE timestamp < ?`)
      .run(Date.now() - olderThanMs);
  }

  // ── Executions buffer ───────────────────────────────────────────────────────
  bufferExecution(exec: BufferedExecution): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO executions_buffer
           (dedup_key, rule_id, device_id, triggered_at, conditions_met,
            executed, results_count, source, error, uploaded)
         VALUES (@dedup_key, @rule_id, @device_id, @triggered_at, @conditions_met,
            @executed, @results_count, @source, @error, 0)`,
      )
      .run({
        ...exec,
        conditions_met: exec.conditions_met ? 1 : 0,
        executed: exec.executed ? 1 : 0,
      });
  }

  pendingExecutions(limit = 200): BufferedExecution[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM executions_buffer WHERE uploaded = 0
         ORDER BY triggered_at ASC LIMIT ?`,
      )
      .all(limit) as any[];
    return rows.map((r) => ({
      ...r,
      conditions_met: !!r.conditions_met,
      executed: !!r.executed,
    }));
  }

  markUploaded(dedupKeys: string[]): void {
    if (dedupKeys.length === 0) return;
    const stmt = this.db.prepare(
      `DELETE FROM executions_buffer WHERE dedup_key = ?`,
    );
    const tx = this.db.transaction((keys: string[]) => {
      for (const k of keys) stmt.run(k);
    });
    tx(dedupKeys);
  }

  // ── KV ──────────────────────────────────────────────────────────────────────
  kvGet(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  kvSet(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO kv (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }
}
