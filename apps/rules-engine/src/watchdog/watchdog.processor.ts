import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WatchdogService } from './watchdog.service';
import { IWatchdogJob, WATCHDOG_QUEUE_NAME } from './watchdog-queue.constants';

@Processor(WATCHDOG_QUEUE_NAME, { concurrency: 1 })
export class WatchdogProcessor extends WorkerHost {
  private readonly logger = new Logger(WatchdogProcessor.name);

  constructor(private readonly watchdogService: WatchdogService) {
    super();
  }

  async process(job: Job<IWatchdogJob>): Promise<void> {
    this.logger.verbose(`Running watchdog scan (job ${job.id})`);
    try {
      await this.watchdogService.scan();
    } catch (error: any) {
      this.logger.error(`Watchdog scan job ${job.id} failed`, error);
      throw error;
    }
  }
}
