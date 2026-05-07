import { DbModule } from '@app/db';
import { NatsClientModule } from '@app/nats-client';
import { Module } from '@nestjs/common';
import { XiaozhiIntegrationController } from './xiaozhi.controller';
import { XiaozhiIntegrationService } from './xiaozhi-integration.service';

@Module({
  imports: [DbModule, NatsClientModule],
  controllers: [XiaozhiIntegrationController],
  providers: [XiaozhiIntegrationService],
})
export class XiaozhiIntegrationModule {}
