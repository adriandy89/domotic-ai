import { Module } from '@nestjs/common';
import { InitController } from './init.controller';
import { InitService } from './init.service';
import { SensorDataDedupService } from './sensor-data-dedup.service';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@app/cache';
import { ScheduleModule } from '@nestjs/schedule';
import { NatsClientModule } from '@app/nats-client';
import { DbModule } from '@app/db';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule.register({
      global: true,
      timeout: 15_000,
      maxRedirects: 5,
    }),
    ScheduleModule.forRoot(),
    CacheModule.forRootAsync(),
    NatsClientModule,
    DbModule,
  ],
  controllers: [InitController],
  providers: [InitService, SensorDataDedupService],
})
export class InitModule {}
