import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EDGE_CONFIG, EdgeConfig } from '../config';
import { SqliteService } from '../store/sqlite.service';

const UPLOAD_INTERVAL_MS = 60_000;

/**
 * Drains the local executions buffer to central when connectivity is available.
 * Idempotent on the server (dedup by home + dedup_key); both accepted and
 * duplicate keys are cleared locally so the buffer can't grow unbounded.
 */
@Injectable()
export class UploadService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(EDGE_CONFIG) private readonly config: EdgeConfig,
    private readonly sqlite: SqliteService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), UPLOAD_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async flush(): Promise<void> {
    if (!this.config.centralApiUrl) return;
    const pending = this.sqlite.pendingExecutions();
    if (pending.length === 0) return;

    const url = `${this.config.centralApiUrl}/api/v1/edge/executions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Edge-Token': this.config.edgeAuthToken,
        },
        body: JSON.stringify({
          homeUniqueId: this.config.homeUniqueId,
          executions: pending.map((e) => ({
            dedup_key: e.dedup_key,
            rule_id: e.rule_id,
            device_id: e.device_id,
            triggered_at: e.triggered_at,
            conditions_met: e.conditions_met,
            executed: e.executed,
            results_count: e.results_count,
            source: e.source,
            error: e.error,
          })),
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Upload → HTTP ${res.status}; will retry`);
        return;
      }
      const { accepted = [], duplicates = [] } = (await res.json()) as {
        accepted: string[];
        duplicates: string[];
      };
      this.sqlite.markUploaded([...accepted, ...duplicates]);
      this.logger.log(
        `Uploaded ${accepted.length} execution(s), ${duplicates.length} duplicate(s)`,
      );
    } catch (e: any) {
      this.logger.warn(`Upload failed (offline?): ${e?.message}`);
    }
  }
}
