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
import { XiaozhiIntegrationModule } from './integrations/xiaozhi/xiaozhi.module';
import { McpModule } from './mcp/mcp.module';
import { NotificationModule } from './notification';
import { PricingModule } from './pricing';
import { ReportsModule } from './reports';
import { RuleModule } from './rule';
import { ScheduleModule } from './schedule';
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
    }),
    SSEModule,
    AuthModule,
    HomeModule,
    UserModule,
    DeviceModule,
    RuleModule,
    ScheduleModule,
    ReportsModule,
    PricingModule,
    NotificationModule,
    AiModule,
    McpModule,
    XiaozhiIntegrationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
