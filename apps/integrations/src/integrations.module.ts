import { DbModule } from '@app/db';
import { NatsClientModule } from '@app/nats-client';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XiaozhiConnectionManager } from './xiaozhi/xiaozhi-connection.manager';
import { XiaozhiToolDispatcher } from './xiaozhi/xiaozhi-tool-dispatcher';
import { XiaozhiController } from './xiaozhi/xiaozhi.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    NatsClientModule,
  ],
  controllers: [XiaozhiController],
  providers: [XiaozhiConnectionManager, XiaozhiToolDispatcher],
})
export class IntegrationsModule {}
