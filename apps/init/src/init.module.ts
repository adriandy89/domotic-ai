import { Module } from '@nestjs/common';
import { InitController } from './init.controller';
import { InitService } from './init.service';
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
      // baseURL: process.env.TRACCAR_BASE_URL || 'http://localhost:8082/api/',
    }),
    ScheduleModule.forRoot(),
    CacheModule.forRootAsync(),
    NatsClientModule,
    DbModule,
  ],
  controllers: [InitController],
  providers: [InitService],
})
export class InitModule { }
