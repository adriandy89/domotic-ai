import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth';
import { HomeModule } from './home';
import { UserModule } from './user';
import { DeviceModule } from './device';
import { CacheModule } from '@app/cache';
import { NatsClientModule } from '@app/nats-client';
import { DbModule } from '@app/db';
import { HttpModule } from '@nestjs/axios';
import { MqttModule } from '@app/mqtt';
import { SSEModule } from './sse';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.forRootAsync(),
    MqttModule.forRootAsync(),
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
