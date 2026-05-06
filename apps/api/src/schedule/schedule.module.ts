import { Module } from '@nestjs/common';
import { NatsClientModule } from '@app/nats-client';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';

@Module({
  imports: [NatsClientModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
