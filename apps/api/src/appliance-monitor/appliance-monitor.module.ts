import { Module } from '@nestjs/common';
import { NatsClientModule } from '@app/nats-client';
import { ApplianceMonitorService } from './appliance-monitor.service';
import { ApplianceMonitorController } from './appliance-monitor.controller';
import { EdgeModule } from '../edge/edge.module';

@Module({
  imports: [NatsClientModule, EdgeModule],
  controllers: [ApplianceMonitorController],
  providers: [ApplianceMonitorService],
})
export class ApplianceMonitorModule {}
