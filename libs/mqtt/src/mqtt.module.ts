import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { connect, MqttClient } from 'mqtt';

@Global()
@Module({})
export class MqttModule {
  /**
   * @param opts.clientIdSuffix Appended to the configured `MQTT_CLIENT_ID` so a
   *   second service sharing the same env (e.g. appliance-monitor alongside
   *   mqtt-core) connects with a DISTINCT client id — same id would make the
   *   broker disconnect one client when the other connects. Omit for the primary
   *   consumer (mqtt-core), which keeps the bare configured id.
   */
  static forRootAsync(opts?: { clientIdSuffix?: string }): DynamicModule {
    return {
      module: MqttModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'MQTT_CLIENT',
          useFactory: (configService: ConfigService): MqttClient => {
            const baseClientId = configService.get<string>('MQTT_CLIENT_ID');
            const clientId =
              baseClientId && opts?.clientIdSuffix
                ? `${baseClientId}${opts.clientIdSuffix}`
                : baseClientId || undefined;
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
                username: configService.get<string>('MQTT_USERNAME'),
                password: configService.get<string>('MQTT_PASSWORD'),
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
              );
            });
            client.on('error', (e) => {
              console.log('MQTT server Error: ', e);
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
