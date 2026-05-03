import { DbService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

/**
 * Periodic deduplication of `sensor_data`.
 *
 * Adapted from the `executeDeviceDataDedup` pattern in
 * `trakcar-nest/apps/initializers/src/initializers.service.ts`. Differences vs.
 * the source pattern, documented in plans/sensor-data-dedup-domotic.md:
 *  - In trakcar, each row is one (device, key) sample → partition by
 *    (device_id, key). In domotic-ai every MQTT message yields one row whose
 *    JSON contains all reported fields → we partition by (device_id) only and
 *    compare the FULL JSON payload (`data::text`).
 *  - We use `timestamp` (TimescaleDB hypertable time column) where trakcar uses
 *    `(device_time, server_time)`.
 *
 * Strategy: classic "gaps and islands" — `LAG()` to detect when the JSON
 * changes, a running SUM to assign island ids per (device_id), then ROW_NUMBER
 * forwards and backwards to keep only the first and last row of each island.
 *
 * Window: [2h ago, 5min ago]. The 5-minute trailing buffer keeps us out of the
 * continuous aggregate refresh window (which has `end_offset => '5 minutes'`),
 * and the 2-hour leading bound caps the cost of the query while leaving plenty
 * of room for slow re-emissions.
 *
 * Lock: an in-memory boolean prevents overlapping runs if the previous one
 * takes longer than the cron interval. Idempotent — running twice on the same
 * window deletes nothing the second time.
 *
 * Index reuse: the hypertable already has `idx_sensor_data_device_timestamp`
 * over `(device_id, timestamp)`, which is exactly what `PARTITION BY device_id
 * ORDER BY timestamp` needs. Plus, `WHERE timestamp >= … AND timestamp < …`
 * triggers chunk pruning, so we only scan recent chunks.
 *
 * Toggle: set `SENSOR_DEDUP_ENABLED=false` to disable the cron entirely.
 */
@Injectable()
export class SensorDataDedupService {
  private readonly logger = new Logger(SensorDataDedupService.name);
  private isRunning = false;

  constructor(
    private readonly dbService: DbService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/5 * * * *') // every 5 minutes
  async runScheduled(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    if (this.isRunning) {
      this.logger.warn('Dedup already in progress, skipping…');
      return;
    }
    this.isRunning = true;
    try {
      const result = await this.runOnce();
      if (result.success) {
        this.logger.log(
          `Dedup completed: ${result.deleted} rows deleted in ${result.durationMs}ms ` +
            `(window ${result.windowStart.toISOString()} → ${result.windowEnd.toISOString()})`,
        );
      } else {
        this.logger.error(`Dedup failed: ${result.error}`);
      }
    } catch (err) {
      this.logger.error(
        `Unexpected error during sensor_data dedup: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run a single deduplication pass. Returns metrics for observability.
   * Safe to call manually (e.g. from a one-off REPL/admin endpoint).
   */
  async runOnce(): Promise<{
    success: boolean;
    deleted: number;
    durationMs: number;
    windowStart: Date;
    windowEnd: Date;
    error?: string;
  }> {
    const start = Date.now();
    const windowEnd = new Date(start - 5 * 60 * 1000); // -5 min
    const windowStart = new Date(start - 2 * 60 * 60 * 1000); // -2 h

    try {
      // The query keeps only the first and last row of each "island" of
      // identical consecutive JSON payloads, per device. Rows in the middle
      // are deleted.
      const deleted = await this.dbService.$executeRaw`
        WITH ordered AS (
          SELECT
            timestamp, id, device_id,
            data::text AS data_text,
            LAG(data::text) OVER (
              PARTITION BY device_id
              ORDER BY timestamp, id
            ) AS prev_data_text
          FROM sensor_data
          WHERE timestamp >= ${windowStart}::timestamptz
            AND timestamp <  ${windowEnd}::timestamptz
        ),
        grouped AS (
          SELECT
            timestamp, id, device_id,
            SUM(CASE WHEN data_text IS DISTINCT FROM prev_data_text THEN 1 ELSE 0 END)
              OVER (
                PARTITION BY device_id
                ORDER BY timestamp, id
                ROWS UNBOUNDED PRECEDING
              ) AS grp
          FROM ordered
        ),
        ranked AS (
          SELECT
            timestamp, id,
            ROW_NUMBER() OVER (
              PARTITION BY device_id, grp
              ORDER BY timestamp ASC, id ASC
            ) AS pos_asc,
            ROW_NUMBER() OVER (
              PARTITION BY device_id, grp
              ORDER BY timestamp DESC, id DESC
            ) AS pos_desc
          FROM grouped
        )
        DELETE FROM sensor_data
        WHERE (timestamp, id) IN (
          SELECT timestamp, id FROM ranked
          WHERE pos_asc > 1 AND pos_desc > 1
        )
      `;

      return {
        success: true,
        deleted: Number(deleted),
        durationMs: Date.now() - start,
        windowStart,
        windowEnd,
      };
    } catch (err) {
      return {
        success: false,
        deleted: 0,
        durationMs: Date.now() - start,
        windowStart,
        windowEnd,
        error: (err as Error).message,
      };
    }
  }

  private isEnabled(): boolean {
    const flag = this.configService.get<string>('SENSOR_DEDUP_ENABLED');
    // default ON when the variable is missing or any value other than 'false'
    return flag === undefined || flag.toLowerCase() !== 'false';
  }
}
