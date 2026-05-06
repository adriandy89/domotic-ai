import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SCHEDULES_PATTERNS } from '@app/models';
import { ScheduleDays, ScheduleFrequency } from 'generated/prisma/enums';
import { SchedulesService } from './schedules.service';

interface ScheduleUpsertPayload {
  id: string;
  active: boolean;
  date: Date | string | null;
  frequency: ScheduleFrequency;
  days: ScheduleDays[];
}

@Controller()
export class SchedulesController {
  private readonly logger = new Logger(SchedulesController.name);

  constructor(private readonly schedulesService: SchedulesService) {}

  @EventPattern(SCHEDULES_PATTERNS.UPSERT)
  async onUpsert(@Payload() payload: ScheduleUpsertPayload): Promise<void> {
    this.logger.log(`Received ${SCHEDULES_PATTERNS.UPSERT} for ${payload.id}`);
    await this.schedulesService.upsert({
      id: payload.id,
      active: payload.active,
      date: payload.date ? new Date(payload.date) : null,
      frequency: payload.frequency,
      days: payload.days ?? [],
    });
  }

  @EventPattern(SCHEDULES_PATTERNS.DELETE)
  async onDelete(@Payload() payload: { id: string }): Promise<void> {
    this.logger.log(`Received ${SCHEDULES_PATTERNS.DELETE} for ${payload.id}`);
    await this.schedulesService.remove(payload.id);
  }
}
