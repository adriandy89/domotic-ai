import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from '@app/db';
import { NatsClientModule } from '@app/nats-client';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SchedulesProcessor } from './schedules.processor';
import { SCHEDULES_QUEUE_NAME } from './schedules-queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: SCHEDULES_QUEUE_NAME }),
    DbModule,
    NatsClientModule,
  ],
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulesProcessor],
})
export class SchedulesModule {}
