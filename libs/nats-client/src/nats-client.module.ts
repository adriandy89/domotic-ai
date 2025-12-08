import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NatsClientService } from './nats-client.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClientsModule.registerAsync([
      {
        name: 'NATS_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.NATS,
          options: {
            servers: [
              configService.get<string>('NATS_URL') || 'nats://localhost:4222',
            ],
            timeout: 60_000, // 60 seconds
            user: configService.get<string>('NATS_USER') || 'defaultUser',
            pass: configService.get<string>('NATS_PASS') || 'defaultPass',
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [NatsClientService],
  exports: [NatsClientService],
})
export class NatsClientModule { }
