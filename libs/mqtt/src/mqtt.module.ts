import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { connect, MqttClient } from 'mqtt';

@Global()
@Module({})
export class MqttModule {
  static forRootAsync(): DynamicModule {
    return {
      module: MqttModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'MQTT_CLIENT',
          useFactory: async (configService: ConfigService): Promise<MqttClient> => {
            const client: MqttClient = connect(
              configService.get<string>('MQTT_SERVER_BASE') || 'mqtt://localhost',
              {
                port: parseInt(configService.get<string>('MQTT_PORT') || '1883', 10),
                clientId: configService.get<string>('MQTT_CLIENT_ID') || undefined,
                clean: true,
                connectTimeout: parseInt(
                  configService.get<string>('MQTT_CONNECT_TIMEOUT') || '4000',
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