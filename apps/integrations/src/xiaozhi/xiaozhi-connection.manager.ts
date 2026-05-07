import { aesGcmDecrypt, loadEncryptionKey } from '@app/crypto';
import { DbService } from '@app/db';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ConnectionState,
  XiaozhiConnection,
} from './xiaozhi-connection';
import { XiaozhiToolDispatcher } from './xiaozhi-tool-dispatcher';

/**
 * Single-instance only. With 2+ replicas, every replica would
 * `OnModuleInit` and open WebSocket connections to xiaozhi for the same
 * integration → duplicate frames + races on `connection_state`. Enforce
 * `replicas: 1` in deployment until a distributed lock is added.
 */
@Injectable()
export class XiaozhiConnectionManager
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(XiaozhiConnectionManager.name);
  private readonly map = new Map<string, XiaozhiConnection>();
  private readonly debouncers = new Map<string, NodeJS.Timeout>();
  private readonly latestState = new Map<
    string,
    { state: ConnectionState; error: string | null }
  >();
  private readonly key: Buffer;

  constructor(
    private readonly db: DbService,
    private readonly dispatcher: XiaozhiToolDispatcher,
  ) {
    this.key = loadEncryptionKey();
  }

  async onModuleInit() {
    const rows = await this.db.xiaozhiIntegration.findMany({
      where: { enabled: true },
      select: { id: true },
    });
    this.logger.log(`bootstrapping ${rows.length} integrations`);
    for (const row of rows) {
      try {
        await this.openOrReplace(row.id);
      } catch (err) {
        this.logger.error(
          `boot open ${row.id} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  async onModuleDestroy() {
    await Promise.all(
      [...this.map.values()].map((c) => c.close('shutdown')),
    );
    this.map.clear();
    for (const t of this.debouncers.values()) clearTimeout(t);
    this.debouncers.clear();
  }

  async handleUpserted(id: string) {
    const row = await this.db.xiaozhiIntegration.findUnique({
      where: { id },
      select: { id: true, enabled: true },
    });
    if (!row || !row.enabled) {
      const existing = this.map.get(id);
      if (existing) {
        await existing.close(row ? 'disabled' : 'deleted');
        this.map.delete(id);
      }
      return;
    }
    await this.openOrReplace(id);
  }

  async handleDeleted(id: string) {
    const c = this.map.get(id);
    if (c) {
      await c.close('deleted');
      this.map.delete(id);
    }
  }

  async handleTest(id: string) {
    const c = this.map.get(id);
    if (c) {
      await c.forceReconnect();
      return;
    }
    await this.openOrReplace(id);
  }

  private async openOrReplace(id: string) {
    const prev = this.map.get(id);
    if (prev) {
      await prev.close('replace');
      this.map.delete(id);
    }

    const row = await this.db.xiaozhiIntegration.findUnique({
      where: { id },
      select: {
        id: true,
        endpoint_encrypted: true,
        user: {
          select: {
            id: true,
            role: true,
            organization_id: true,
            attributes: true,
          },
        },
      },
    });
    if (!row) return;

    const tz =
      (row.user.attributes as Record<string, unknown> | null)?.timeZone;
    const owner = {
      id: row.user.id,
      role: row.user.role,
      organization_id: row.user.organization_id,
      timeZone: typeof tz === 'string' && tz.length > 0 ? tz : 'UTC',
    };

    const conn = new XiaozhiConnection({
      id: row.id,
      owner,
      getEndpoint: () => aesGcmDecrypt(row.endpoint_encrypted, this.key),
      dispatcher: this.dispatcher,
      onStateChange: (state, error) => this.persistState(id, state, error),
      logger: new Logger(`Xiaozhi[${row.id.slice(0, 8)}]`),
    });
    this.map.set(id, conn);
    conn.connect();
  }

  private persistState(
    id: string,
    state: ConnectionState,
    error: string | null,
  ) {
    this.latestState.set(id, { state, error });
    const existing = this.debouncers.get(id);
    if (existing) clearTimeout(existing);
    this.debouncers.set(
      id,
      setTimeout(async () => {
        const s = this.latestState.get(id);
        if (!s) return;
        const data: Record<string, unknown> = {
          connection_state: s.state,
          last_error: s.error?.slice(0, 512) ?? null,
        };
        if (s.state === 'connected') {
          data.last_connected_at = new Date();
        } else if (s.state === 'error' || s.state === 'idle') {
          data.last_disconnected_at = new Date();
        }
        await this.db.xiaozhiIntegration
          .update({ where: { id }, data })
          .catch((err) =>
            this.logger.warn(
              `persistState ${id} failed: ${(err as Error).message}`,
            ),
          );
      }, 1_000),
    );
  }
}
