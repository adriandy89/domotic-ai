import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import {
  getKeyHomeNotifiedDisconnections,
  getKeyHomeUniqueIdOrgId,
  getKeyHomeUniqueIdsDisconnected,
  IHomeConnectedEvent,
  IHomeConnectionNotification,
} from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable } from '@nestjs/common';
import { NotificationChannel } from 'generated/prisma/client';

/**
 * Home-level bookkeeping shared by every ingestion path: resolving a home's
 * organization (cache fast-path + DB fallback) and flipping a home back to
 * connected with its notification fan-out.
 */
@Injectable()
export class HomeRegistryService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly natsClient: NatsClientService,
    private readonly dbService: DbService,
  ) {}

  /**
   * Resolve a home's organization id. Cache fast-path (telemetry is frequent); on a
   * cache miss fall back to the DB and re-warm the cache. Returns null if no such
   * enabled home exists. Prevents dropping data when the cache is cold/flushed.
   */
  async resolveHomeOrgId(homeUniqueId: string): Promise<string | null> {
    const cached = await this.cacheService.get<string>(
      getKeyHomeUniqueIdOrgId(homeUniqueId),
    );
    if (cached) return cached;

    const home = await this.dbService.home.findUnique({
      where: { unique_id: homeUniqueId, disabled: false },
      select: { organization_id: true },
    });
    if (!home) return null;

    await this.cacheService.set(
      getKeyHomeUniqueIdOrgId(homeUniqueId),
      home.organization_id,
    );
    return home.organization_id;
  }

  /** Mark a home as connected and emit the connection notifications. */
  async markHomeConnected(foundHome: {
    id: string;
    unique_id: string;
    name: string;
    users: {
      user_id: string;
      user: {
        id: string;
        channels: NotificationChannel[];
        telegram_chat_id: string | null;
        email: string | null;
        is_active: boolean;
        language: string;
      };
    }[];
  }) {
    await this.dbService.home.update({
      where: { id: foundHome.id },
      data: { connected: true },
    });
    await this.cacheService.sRem(
      getKeyHomeUniqueIdsDisconnected(),
      foundHome.unique_id,
    );
    const wasNotified = await this.cacheService.sIsMember(
      getKeyHomeNotifiedDisconnections(),
      foundHome.unique_id,
    );
    if (wasNotified) {
      await this.cacheService.sRem(
        getKeyHomeNotifiedDisconnections(),
        foundHome.unique_id,
      );
    }
    await this.natsClient.emit<IHomeConnectedEvent>(
      'mqtt-core.home.connected',
      {
        homeId: foundHome.id,
        userIds: foundHome.users.map((user) => user.user_id),
        connected: true,
      },
    );
    await this.natsClient.emit<IHomeConnectionNotification>(
      'notification.home-connection',
      {
        homeId: foundHome.id,
        homeName: foundHome.name,
        connected: true,
        users: foundHome.users.map((u) => ({
          id: u.user.id,
          channels: u.user.channels,
          telegram_chat_id: u.user.telegram_chat_id,
          email: u.user.email,
          is_active: u.user.is_active,
          language: u.user.language,
        })),
      },
    );
  }
}
