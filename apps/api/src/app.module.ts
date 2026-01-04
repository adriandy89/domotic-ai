import { CacheModule } from '@app/cache';
import { DbModule } from '@app/db';
import { NatsClientModule } from '@app/nats-client';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai';
import { AuthModule } from './auth';
import { DeviceModule } from './device';
import { HomeModule } from './home';
import { NotificationModule } from './notification';
import { RuleModule } from './rule';
import { SSEModule } from './sse';
import { UserModule } from './user';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.forRootAsync(),
    NatsClientModule,
    DbModule,
    HttpModule.register({
      global: true,
      timeout: 15_000,
      maxRedirects: 5,
      // baseURL: process.env.TRACCAR_BASE_URL || 'http://localhost:8082/api/',
    }),
    SSEModule,
    AuthModule,
    HomeModule,
    UserModule,
    DeviceModule,
    RuleModule,
    NotificationModule,
    AiModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
