import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from '@app/db';
import { NatsClientModule } from '@app/nats-client';
import { WatchdogService } from './watchdog.service';
import { WatchdogProcessor } from './watchdog.processor';
import { WATCHDOG_QUEUE_NAME } from './watchdog-queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: WATCHDOG_QUEUE_NAME }),
    DbModule,
    NatsClientModule,
  ],
  providers: [WatchdogService, WatchdogProcessor],
})
export class WatchdogModule {}
