import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SchedulesService } from './schedules.service';
import {
  IScheduleJob,
  SCHEDULES_QUEUE_NAME,
} from './schedules-queue.constants';

@Processor(SCHEDULES_QUEUE_NAME, {
  concurrency: 5,
})
export class SchedulesProcessor extends WorkerHost {
  private readonly logger = new Logger(SchedulesProcessor.name);

  constructor(private readonly schedulesService: SchedulesService) {
    super();
  }

  async process(job: Job<IScheduleJob>): Promise<void> {
    this.logger.log(
      `Processing schedule job ${job.id} for schedule ${job.data.scheduleId}`,
    );
    try {
      await this.schedulesService.executeSchedule(job.data.scheduleId);
    } catch (error) {
      this.logger.error(
        `Schedule job ${job.id} failed for schedule ${job.data.scheduleId}`,
        error,
      );
      throw error;
    }
  }
}
