import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { connect, MqttClient } from 'mqtt';

@Global()
@Module({})
export class MqttModule {
  /**
   * Omit `opts` for the primary consumer (mqtt-core), which keeps the bare
   * shared `MQTT_CLIENT_ID` / `MQTT_USERNAME` / `MQTT_PASSWORD`.
   *
   * @param opts.envPrefix For a second service sharing the same env (e.g.
   *   appliance-monitor alongside mqtt-core): its own credentials are read from
   *   `<envPrefix>_CLIENT_ID` / `_USERNAME` / `_PASSWORD`, falling back to the
   *   shared `MQTT_*` ones. Needed because TBMQ Basic credentials that pin a
   *   Client ID reject any other id ("Not authorized").
   * @param opts.clientIdSuffix Fallback when `<envPrefix>_CLIENT_ID` is unset:
   *   appended to the shared `MQTT_CLIENT_ID` so the id stays DISTINCT — same id
   *   would make the broker disconnect one client when the other connects.
   */
  static forRootAsync(opts?: {
    envPrefix?: string;
    clientIdSuffix?: string;
  }): DynamicModule {
    return {
      module: MqttModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'MQTT_CLIENT',
          useFactory: (configService: ConfigService): MqttClient => {
            const own = (key: string): string | undefined =>
              opts?.envPrefix
                ? configService.get<string>(`${opts.envPrefix}_${key}`) ||
                  undefined
                : undefined;

            const baseClientId = configService.get<string>('MQTT_CLIENT_ID');
            const ownClientId = own('CLIENT_ID');
            const clientId =
              ownClientId ??
              (baseClientId && opts?.clientIdSuffix
                ? `${baseClientId}${opts.clientIdSuffix}`
                : baseClientId || undefined);
            const username =
              own('USERNAME') ?? configService.get<string>('MQTT_USERNAME');
            const password =
              own('PASSWORD') ?? configService.get<string>('MQTT_PASSWORD');

            if (opts?.envPrefix) {
              // Sharing mqtt-core's id would evict it from the broker on connect.
              if (clientId && clientId === baseClientId) {
                throw new Error(
                  `${opts.envPrefix}_CLIENT_ID must differ from MQTT_CLIENT_ID (${baseClientId}).`,
                );
              }
              if (!ownClientId) {
                console.warn(
                  `${opts.envPrefix}_CLIENT_ID not set, using "${clientId}" with the shared MQTT_* credentials. ` +
                    'TBMQ rejects it if those credentials pin a Client ID.',
                );
              }
            }

            const client: MqttClient = connect(
              configService.get<string>('MQTT_SERVER_BASE') ||
                'mqtt://localhost',
              {
                port: parseInt(
                  configService.get<string>('MQTT_PORT', '1883'),
                  10,
                ),
                clientId,
                clean: true,
                connectTimeout: parseInt(
                  configService.get<string>('MQTT_CONNECT_TIMEOUT', '4000'),
                  10,
                ),
                username,
                password,
                reconnectPeriod: parseInt(
                  configService.get<string>('MQTT_RECONNECT_PERIOD') || '1000',
                  10,
                ),
              },
            );
            client.on('connect', () => {
              console.log('====== Connected to MQTT server ====== ');
              console.log(
                'Server:',
                configService.get<string>('MQTT_SERVER_BASE', 'default'),
                'Port:',
                configService.get<string>('MQTT_PORT', 'default'),
                'ClientId:',
                clientId,
              );
            });
            client.on('error', (e) => {
              console.log(`MQTT server Error (clientId: ${clientId}): `, e);
            });
            return client;
          },
          inject: [ConfigService],
        },
      ],
      exports: ['MQTT_CLIENT'],
    };
  }
}
