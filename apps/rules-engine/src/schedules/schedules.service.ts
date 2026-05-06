import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from 'generated/prisma/client';
import { ScheduleFrequency } from 'generated/prisma/enums';
import {
  IScheduleJob,
  SCHEDULES_JOB_NAME,
  SCHEDULES_QUEUE_NAME,
} from './schedules-queue.constants';
import { buildJobTiming } from './cron-from-schedule';

type ScheduleForExecution = Prisma.ScheduleGetPayload<{
  include: {
    actions: true;
    home: { select: { unique_id: true } };
  };
}>;

type ScheduleForScheduling = Prisma.ScheduleGetPayload<{
  select: {
    id: true;
    active: true;
    date: true;
    frequency: true;
    days: true;
  };
}>;

@Injectable()
export class SchedulesService implements OnModuleInit {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
    @InjectQueue(SCHEDULES_QUEUE_NAME)
    private readonly schedulesQueue: Queue<IScheduleJob>,
  ) {}

  async onModuleInit() {
    try {
      const active = await this.dbService.schedule.findMany({
        where: { active: true },
        select: {
          id: true,
          active: true,
          date: true,
          frequency: true,
          days: true,
        },
      });
      this.logger.log(`Resyncing ${active.length} active schedule(s) on boot`);
      for (const s of active) {
        await this.upsert(s);
      }
    } catch (error) {
      this.logger.error('Failed to resync schedules on boot', error);
    }
  }

  async upsert(schedule: ScheduleForScheduling): Promise<void> {
    // Always remove any previous version (frequency / time may have changed)
    await this.removeAllJobsFor(schedule.id);

    if (!schedule.active) {
      this.logger.log(`Schedule ${schedule.id} is inactive, not scheduled`);
      return;
    }

    const timing = buildJobTiming({
      frequency: schedule.frequency,
      date: schedule.date,
      days: schedule.days,
    });

    if (timing.kind === 'invalid') {
      this.logger.warn(
        `Schedule ${schedule.id} not scheduled: ${timing.reason}`,
      );
      return;
    }

    if (timing.kind === 'once') {
      await this.schedulesQueue.add(
        SCHEDULES_JOB_NAME,
        { scheduleId: schedule.id },
        {
          jobId: schedule.id,
          delay: timing.delayMs,
          removeOnComplete: true,
          removeOnFail: { age: 3600 },
        },
      );
      this.logger.log(
        `Scheduled ONCE ${schedule.id} in ${timing.delayMs}ms`,
      );
      return;
    }

    // repeat
    await this.schedulesQueue.upsertJobScheduler(
      schedule.id,
      { pattern: timing.pattern, tz: timing.tz },
      {
        name: SCHEDULES_JOB_NAME,
        data: { scheduleId: schedule.id },
        opts: {
          removeOnComplete: true,
          removeOnFail: { age: 3600 },
        },
      },
    );
    this.logger.log(
      `Scheduled ${schedule.frequency} ${schedule.id} with cron "${timing.pattern}" tz=${timing.tz}`,
    );
  }

  async remove(id: string): Promise<void> {
    await this.removeAllJobsFor(id);
    this.logger.log(`Removed schedule ${id}`);
  }

  private async removeAllJobsFor(id: string): Promise<void> {
    // Repeatable side
    try {
      await this.schedulesQueue.removeJobScheduler(id);
    } catch (error) {
      this.logger.debug(
        `removeJobScheduler(${id}) noop or failed: ${(error as Error).message}`,
      );
    }
    // Delayed/once side
    try {
      const job = await this.schedulesQueue.getJob(id);
      if (job) await job.remove();
    } catch (error) {
      this.logger.debug(
        `getJob(${id}).remove() noop or failed: ${(error as Error).message}`,
      );
    }
  }

  async executeSchedule(scheduleId: string): Promise<void> {
    const schedule = await this.dbService.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        actions: true,
        home: { select: { unique_id: true } },
      },
    });

    if (!schedule) {
      this.logger.warn(`Schedule ${scheduleId} not found, skipping execution`);
      return;
    }

    if (!schedule.active) {
      this.logger.warn(
        `Schedule ${scheduleId} is inactive, skipping execution`,
      );
      return;
    }

    this.logger.log(
      `Executing schedule ${schedule.id} "${schedule.name}" with ${schedule.actions.length} action(s)`,
    );

    for (const action of schedule.actions) {
      try {
        await this.executeAction(schedule, action);
      } catch (error) {
        this.logger.error(
          `Error executing action ${action.id} for schedule ${schedule.id}`,
          error,
        );
      }
    }

    if (schedule.frequency === ScheduleFrequency.ONCE) {
      await this.dbService.schedule.update({
        where: { id: schedule.id },
        data: { active: false },
      });
      this.logger.log(`ONCE schedule ${schedule.id} deactivated after fire`);
    }
  }

  private async executeAction(
    schedule: ScheduleForExecution,
    action: ScheduleForExecution['actions'][number],
  ): Promise<void> {
    if (!action.device_id) {
      this.logger.warn(
        `Action ${action.id} of schedule ${schedule.id} has no device_id`,
      );
      return;
    }

    const device = await this.dbService.device.findUnique({
      where: { id: action.device_id },
      select: { unique_id: true, organization_id: true },
    });

    if (!device) {
      this.logger.warn(
        `Device ${action.device_id} not found for action ${action.id}`,
      );
      return;
    }

    const command = this.buildCommand(action.attribute, action.data);

    this.logger.log(
      `Schedule ${schedule.id} → device ${device.unique_id}: ${JSON.stringify(command)}`,
    );

    await this.natsClient.emit<{
      homeUniqueId: string;
      deviceUniqueId: string;
      organizationId: string;
      command: Record<string, any>;
      source: 'schedule';
    }>('mqtt-core.publish-command', {
      homeUniqueId: schedule.home.unique_id,
      deviceUniqueId: device.unique_id,
      organizationId: device.organization_id,
      command,
      source: 'schedule',
    });
  }

  private buildCommand(
    attribute: string | null,
    data: any,
  ): Record<string, any> {
    if (attribute && data) {
      const value = (data as { value?: any })?.value;
      if (value !== undefined) {
        return { [attribute]: value };
      }
    }
    if (data && typeof data === 'object') {
      return data as Record<string, any>;
    }
    return {};
  }
}
