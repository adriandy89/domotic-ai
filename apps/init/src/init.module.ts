import { Module } from '@nestjs/common';
import { InitController } from './init.controller';
import { InitService } from './init.service';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@app/cache';
import { ScheduleModule } from '@nestjs/schedule';
import { NatsClientModule } from '@app/nats-client';
import { DbModule } from '@app/db';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
