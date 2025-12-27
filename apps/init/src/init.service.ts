import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { getKeyHomeUniqueIdsDisconnected, getKeyHomeNotifiedDisconnections, getKeyHomeUniqueIdOrgId, IHomeConnectedEvent } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class InitService implements OnModuleInit {
  private readonly logger = new Logger(InitService.name);

  mqttWebApi: string;
  mqttWebUser: string;
  mqttWebPassword: string;

  // ? execute every 1 minute = check the mqtt client id status in api, cron job
  @Cron('0 */1 * * * *')
  async checkHomeStatus() {
    try {
      // get all homes 
      const homes = await this.dbService.home.findMany({
        select: {
          unique_id: true
        },
        where: {
          disabled: false,
        },
      });

      if (!homes?.length) {
        return;
      }

      const resp = await firstValueFrom(
        this.httpService
          .post(
            this.mqttWebApi + '/api/auth/login',
            {
              username: this.mqttWebUser,
              password: this.mqttWebPassword,
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            catchError((error: AxiosError) => {
              console.log(error.response);
              throw 'An error happened!';
            }),
          ),
      );
      if (!resp?.data?.token) {
        this.logger.error('Error getting token');
        return;
      }

      for (const home of homes) {
        const url = `${this.mqttWebApi}/api/client-session?clientId=${home.unique_id}`;
        try {
          const response = await firstValueFrom(
            this.httpService.get(url, {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${resp?.data?.token}`,
              },
            }),
          );
          const data = response.data;
          if (data?.connectionState === 'CONNECTED') {
            this.logger.verbose(`Home ${home.unique_id} is connected`);
            // Remove from disconnected set if present
            await this.cacheService.sRem(
              getKeyHomeUniqueIdsDisconnected(),
              home.unique_id,
            );
            // Check if this home was previously notified as disconnected
            const wasNotified = await this.cacheService.sIsMember(
              getKeyHomeNotifiedDisconnections(),
              home.unique_id,
            );
            if (wasNotified) {
              await this.notifyConnection(home.unique_id, true);
              // Remove from notified set
              await this.cacheService.sRem(
                getKeyHomeNotifiedDisconnections(),
                home.unique_id,
              );
            }
          } else {
            this.logger.verbose(`Home ${home.unique_id} is not connected`);
            await this.handleDisconnection(home.unique_id);
          }
        } catch (error) {
          if (error.response && error.response.status === 404) {
            this.logger.verbose(`Home ${home.unique_id} not found`);
          } else {
            this.logger.error(
              `Error checking status for home ${home.unique_id}:`,
              error.message,
            );
          }
          await this.handleDisconnection(home.unique_id);
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
    private readonly httpService: HttpService,
  ) {
    this.mqttWebApi = this.configService.get<string>('MQTT_SERVER_API', '');
    this.mqttWebUser = this.configService.get<string>('MQTT_SERVER_WEB_USER', '');
    this.mqttWebPassword = this.configService.get<string>('MQTT_SERVER_WEB_PASS', '');
  }

  async onModuleInit() {
    await this.initializeCache();
  }

  async initializeCache() {
    this.logger.log('Clear All Redis caches ...');
    await this.cacheService.flushAll();
    this.logger.log('All Redis caches cleared OK!');

    await this.initializeHomesCache();

    this.logger.log('All Redis caches initialized OK!');
    return { ok: true };
  }

  async initializeHomesCache() {
    try {
      this.logger.log('Initialize Homes Cache ...');
      const homes = await this.dbService.home.findMany({
        select: {
          unique_id: true,
          organization_id: true,
        },
      });
      for (const home of homes) {
        await this.cacheService.set(getKeyHomeUniqueIdOrgId(home.unique_id), home.organization_id);
      }
      this.logger.log('Homes Cache initialized OK!');
    } catch (error) {
      console.log(error);
      this.logger.error('Error initializing Homes Cache');
    }
  }

  /**
   * Handle home disconnection using a simple two-step approach:
   * 1st disconnection: Add to disconnected set
   * 2nd disconnection: If still in disconnected set, notify and move to notified set
   */
  private async handleDisconnection(unique_id: string) {
    // Check if this is the first disconnection
    const isFirstDisconnection = !(await this.cacheService.sIsMember(
      getKeyHomeUniqueIdsDisconnected(),
      unique_id,
    ));

    if (isFirstDisconnection) {
      // First disconnection: just add to the set
      await this.cacheService.sAdd(
        getKeyHomeUniqueIdsDisconnected(),
        unique_id,
      );
      this.logger.debug(
        `Home ${unique_id} disconnected (1st check)`,
      );
    } else {
      // Second consecutive disconnection: check if already notified
      const alreadyNotified = await this.cacheService.sIsMember(
        getKeyHomeNotifiedDisconnections(),
        unique_id,
      );

      if (!alreadyNotified) {
        this.logger.debug(
          `Home ${unique_id} disconnected (2nd check) - notifying`,
        );
        await this.notifyConnection(unique_id, false);
        // Mark as notified
        await this.cacheService.sAdd(
          getKeyHomeNotifiedDisconnections(),
          unique_id,
        );
      }
    }
  }

  /**
   * Notify connection status change (connect or disconnect)
   */
  private async notifyConnection(unique_id: string, connected: boolean) {
    const action = connected ? 'reconnected' : 'disconnected';

    this.logger.warn(
      `Home ${unique_id} has ${action}${connected ? '' : ' for two consecutive checks'}.`,
    );

    // Update database
    const updated = await this.dbService.home.update({
      where: { unique_id },
      select: {
        id: true,
        users: {
          select: {
            user_id: true,
          },
        },
      },
      data: { connected },
    });

    if (updated) {
      // Emit NATS event with userIds for SSE notification
      await this.natsClient.emit<IHomeConnectedEvent>('mqtt-core.home.connected', {
        homeId: updated.id,
        userIds: updated.users.map((u) => u.user_id),
        connected,
      });
    }
  }
}
