import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { buildSignedEdgeBundle, deriveEdgeToken } from '@app/edge-bundle';
import { SignedEdgeBundle } from '@app/rules-evaluator';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EdgeExecutionInput {
  dedup_key: string;
  rule_id: string;
  device_id: string | null;
  triggered_at: number; // epoch ms
  conditions_met: boolean;
  executed: boolean;
  results_count: number;
  source: string;
  error: string | null;
}

export interface IngestResult {
  accepted: string[];
  duplicates: string[];
}

// 24h dedup window mirrored in Redis (fast path); the DB unique is the backstop.
const DEDUP_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class EdgeService {
  private readonly logger = new Logger(EdgeService.name);
  private readonly masterSecret: string;

  constructor(
    private readonly db: DbService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {
    this.masterSecret = this.config.get<string>('EDGE_SIGNING_SECRET', '');
  }

  /** The per-home edge token derived from the master secret (empty if unset). */
  tokenFor(homeUniqueId: string): string {
    return this.masterSecret
      ? deriveEdgeToken(this.masterSecret, homeUniqueId)
      : '';
  }

  /** Signed offline bundle for a home (HTTP pull fallback for the edge). */
  async getSignedBundle(homeUniqueId: string): Promise<SignedEdgeBundle | null> {
    return buildSignedEdgeBundle(this.db, homeUniqueId, this.tokenFor(homeUniqueId));
  }

  /** Ingest a batch of edge executions idempotently (dedup by home + dedup_key). */
  async ingestExecutions(
    homeUniqueId: string,
    executions: EdgeExecutionInput[],
  ): Promise<IngestResult> {
    const home = await this.db.home.findUnique({
      where: { unique_id: homeUniqueId },
      select: { id: true },
    });
    if (!home) return { accepted: [], duplicates: [] };

    const accepted: string[] = [];
    const duplicates: string[] = [];

    for (const e of executions) {
      const cacheKey = `edge:dedup:${home.id}:${e.dedup_key}`;
      // Fast path: Redis set-if-not-exists within the dedup window.
      const isNew = await this.cache.setnx(cacheKey, 1, DEDUP_TTL_SECONDS);
      if (!isNew) {
        duplicates.push(e.dedup_key);
        continue;
      }
      try {
        await this.db.edgeExecution.create({
          data: {
            home_id: home.id,
            rule_id: e.rule_id,
            device_id: e.device_id,
            triggered_at: new Date(e.triggered_at),
            conditions_met: e.conditions_met,
            executed: e.executed,
            results_count: e.results_count,
            source: e.source,
            error: e.error,
            dedup_key: e.dedup_key,
          },
        });
        accepted.push(e.dedup_key);
      } catch (err: any) {
        // Unique violation → already ingested (backstop for cache misses).
        if (err?.code === 'P2002') duplicates.push(e.dedup_key);
        else {
          this.logger.error(`Ingest failed for ${e.dedup_key}: ${err?.message}`);
          // Let the edge retry later: release the cache marker.
          await this.cache.del(cacheKey);
        }
      }
    }

    return { accepted, duplicates };
  }
}
