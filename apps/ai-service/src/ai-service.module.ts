import { Module } from '@nestjs/common';
import { AiServiceController } from './ai-service.controller';
import { AiServiceService } from './ai-service.service';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@app/cache';
import { NatsClientModule } from '@app/nats-client';
import { DbModule } from '@app/db';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.forRootAsync(),
    // BullModule.forRootAsync({
    //   inject: [ConfigService],
    //   useFactory: async (configService: ConfigService) => ({
    //     connection: {
    //       host: configService.get<string>('REDIS_HOST', 'localhost'),
    //       port: configService.get<number>('REDIS_PORT', 6379),
    //       password: configService.get<string>('REDIS_PASSWORD', ''),
    //     },
    //   }),
    // }),
    // BullModule.registerQueue(
    //   { name: RULES_QUEUE_NAME },
    //   { name: RULES_DELAYED_QUEUE_NAME },
    // ),
    NatsClientModule,
    DbModule,
  ],
  controllers: [AiServiceController],
  providers: [AiServiceService],
})
export class AiServiceModule { }
