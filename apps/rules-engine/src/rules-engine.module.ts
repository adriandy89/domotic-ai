import { Module } from '@nestjs/common';
import { RulesEngineController } from './rules-engine.controller';
import { RulesEngineService } from './rules-engine.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@app/cache';
import { NatsClientModule } from '@app/nats-client';
import { DbModule } from '@app/db';
import { BullModule } from '@nestjs/bullmq';
import { RulesQueueProcessor, RulesDelayedProcessor } from './rules-queue.processor';
import { RULES_QUEUE_NAME, RULES_DELAYED_QUEUE_NAME } from './rules-queue.constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.forRootAsync(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD', ''),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: RULES_QUEUE_NAME },
      { name: RULES_DELAYED_QUEUE_NAME },
    ),
    NatsClientModule,
    DbModule,
  ],
  controllers: [RulesEngineController],
  providers: [RulesEngineService, RulesQueueProcessor, RulesDelayedProcessor],
})
export class RulesEngineModule { }
