import { Module } from '@nestjs/common';
import { NatsClientModule } from '@app/nats-client';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { EdgeModule } from '../edge/edge.module';

@Module({
  imports: [NatsClientModule, EdgeModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
