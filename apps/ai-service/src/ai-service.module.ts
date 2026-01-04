import { CacheModule } from '@app/cache';
import { DbModule } from '@app/db';
import { NatsClientModule } from '@app/nats-client';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiServiceController } from './ai-service.controller';
import { AiServiceService } from './ai-service.service';
import { MastraAgentFactory, MastraService } from './mastra';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.forRootAsync(),
    NatsClientModule,
    DbModule,
  ],
  controllers: [AiServiceController],
  providers: [AiServiceService, MastraService, MastraAgentFactory],
})
export class AiServiceModule { }
