import { Module } from '@nestjs/common';
import { RulesEngineController } from './rules-engine.controller';
import { RulesEngineService } from './rules-engine.service';
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
    NatsClientModule,
    DbModule,
  ],
  controllers: [RulesEngineController],
  providers: [RulesEngineService],
})
export class RulesEngineModule { }
