import { DbService } from '@app/db';
import { EDGE_PATTERNS } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Fire-and-forget trigger that asks mqtt-core to (re)publish a home's retained
 * offline bundle. Call after any run_offline rule/schedule or home.edge_enabled
 * change. Resolves the home unique_id from an internal id when needed.
 */
@Injectable()
export class EdgeSyncNotifier {
  private readonly logger = new Logger(EdgeSyncNotifier.name);

  constructor(
    private readonly db: DbService,
    private readonly nats: NatsClientService,
  ) {}

  async notifyByHomeId(homeId: string): Promise<void> {
    const home = await this.db.home.findUnique({
      where: { id: homeId },
      select: { unique_id: true, edge_enabled: true },
    });
    if (home?.edge_enabled) await this.notify(home.unique_id);
  }

  async notify(homeUniqueId: string): Promise<void> {
    try {
      await this.nats.emit(EDGE_PATTERNS.PUBLISH_BUNDLE, { homeUniqueId });
    } catch (e: any) {
      this.logger.error(`Failed to trigger edge bundle publish: ${e?.message}`);
    }
  }
}
