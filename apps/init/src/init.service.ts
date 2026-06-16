import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import {
  DeviceProtocol,
  getKeyHomeUniqueIdsDisconnected,
  getKeyHomeNotifiedDisconnections,
  getKeyHomeUniqueIdOrgId,
  deriveAvailability,
  HaDeviceAttributes,
  IDeviceAvailability,
  IHomeConnectedEvent,
  IHomeConnectionNotification,
} from '@app/models';
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
  /** Mark a device offline after this many hours without any reported state. */
  deviceOfflineAfterHours: number;

  // ? execute every 1 minute = check the mqtt client id status in api, cron job
  @Cron('0 */1 * * * *')
  async checkHomeStatus() {
    try {
      // get all homes
      const homes = await this.dbService.home.findMany({
        select: {
          unique_id: true,
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
        const connected = await this.isHomeConnected(
          home.unique_id,
          resp.data.token,
        );
        if (connected) {
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
      }
    } catch (error: any) {
      console.log(error);
    }
  }

  /**
   * Hourly staleness sweep: mark devices offline when they haven't reported any
   * state for longer than {@link deviceOfflineAfterHours}. This is the fallback for
   * devices that don't publish an MQTT availability topic (most Zigbee sensors that
   * only report data). Devices whose discovery config declares availability (see
   * `deriveAvailability`) are owned by the real-time path in mqtt-core and skipped here.
   *
   * The sweep only ever flips devices to offline; a fresh state message revives them
   * to online in mqtt-core's ingest path. Both transitions emit
   * `mqtt-core.device.availability` so the dashboard updates over SSE.
   *
   * Note: a global threshold is a coarse signal — purely event-driven sensors (door
   * contacts, PIR) can be genuinely online yet silent for long stretches, so keep the
   * threshold generous (`DEVICE_OFFLINE_AFTER_HOURS`, default 24).
   */
  @Cron('0 0 * * * *')
  async checkDeviceStaleness() {
    try {
      const cutoff = new Date(
        Date.now() - this.deviceOfflineAfterHours * 60 * 60 * 1000,
      );

      const staleDevices = await this.dbService.device.findMany({
        where: {
          online: true,
          disabled: false,
          sensorDataLasts: { some: { timestamp: { lt: cutoff } } },
        },
        select: {
          id: true,
          unique_id: true,
          attributes: true,
          home: {
            select: { id: true, users: { select: { user_id: true } } },
          },
        },
      });

      for (const device of staleDevices) {
        if (!device.home) continue;
        // Devices with an availability contract are driven by mqtt-core in real time.
        const attrs = device.attributes as HaDeviceAttributes | null;
        if (attrs?.source === 'hadiscovery' && deriveAvailability(attrs.config)) {
          continue;
        }

        await this.dbService.device.update({
          where: { id: device.id },
          data: { online: false },
        });
        await this.natsClient.emit<IDeviceAvailability>(
          'mqtt-core.device.availability',
          {
            homeId: device.home.id,
            userIds: device.home.users.map((u) => u.user_id),
            deviceId: device.id,
            online: false,
          },
        );
        this.logger.debug(
          `Device ${device.unique_id} marked offline (no state for >${this.deviceOfflineAfterHours}h)`,
        );
      }
    } catch (error: any) {
      console.log(error);
      this.logger.error('Error in device staleness sweep');
    }
  }

  /**
   * A home is connected if ANY of its edge bridges has a live broker session.
   * Each protocol bridge uses a distinct MQTT client_id (`{uuid}-{protocol}`),
   * and the bare `{uuid}` is kept as a candidate for backward compatibility with
   * homes whose zigbee2mqtt still uses the legacy (pre-multi-protocol) client_id.
   */
  private async isHomeConnected(
    uniqueId: string,
    token: string,
  ): Promise<boolean> {
    const candidateClientIds = [
      uniqueId,
      ...Object.values(DeviceProtocol).map((p) => `${uniqueId}-${p}`),
    ];
    for (const clientId of candidateClientIds) {
      if (await this.isClientConnected(clientId, token)) return true;
    }
    return false;
  }

  /** True if the broker reports an active CONNECTED session for this client_id. */
  private async isClientConnected(
    clientId: string,
    token: string,
  ): Promise<boolean> {
    const url = `${this.mqttWebApi}/api/client-session?clientId=${encodeURIComponent(
      clientId,
    )}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }),
      );
      return response.data?.connectionState === 'CONNECTED';
    } catch (error: any) {
      // 404 = no such session (this bridge isn't connected) — not an error.
      if (!(error.response && error.response.status === 404)) {
        this.logger.error(
          `Error checking session for client ${clientId}: ${error.message}`,
        );
      }
      return false;
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
    this.mqttWebUser = this.configService.get<string>(
      'MQTT_SERVER_WEB_USER',
      '',
    );
    this.mqttWebPassword = this.configService.get<string>(
      'MQTT_SERVER_WEB_PASS',
      '',
    );
    this.deviceOfflineAfterHours = this.configService.get<number>(
      'DEVICE_OFFLINE_AFTER_HOURS',
      24,
    );
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
        await this.cacheService.set(
          getKeyHomeUniqueIdOrgId(home.unique_id),
          home.organization_id,
        );
      }
      this.logger.log('Homes Cache initialized OK!');
    } catch (error: any) {
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
      this.logger.debug(`Home ${unique_id} disconnected (1st check)`);
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
        name: true,
        users: {
          select: {
            user_id: true,
            user: {
              select: {
                id: true,
                channels: true,
                telegram_chat_id: true,
                email: true,
                is_active: true,
                language: true,
              },
            },
          },
        },
      },
      data: { connected },
    });

    if (updated) {
      // Emit NATS event with userIds for SSE notification
      await this.natsClient.emit<IHomeConnectedEvent>(
        'mqtt-core.home.connected',
        {
          homeId: updated.id,
          userIds: updated.users.map((u) => u.user_id),
          connected,
        },
      );

      // Emit NATS event for email/telegram notification dispatch
      await this.natsClient.emit<IHomeConnectionNotification>(
        'notification.home-connection',
        {
          homeId: updated.id,
          homeName: updated.name,
          connected,
          users: updated.users.map((u) => ({
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
}
