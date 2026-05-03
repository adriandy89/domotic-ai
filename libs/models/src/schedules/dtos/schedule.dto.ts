import { ApiProperty } from '@nestjs/swagger';
import {
  NotificationChannel,
  ScheduleDays,
  ScheduleFrequency,
} from 'generated/prisma/enums';
import { ICreateScheduleAction } from '../interfaces';

export class ScheduleDto {
  @ApiProperty()
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly active: boolean;

  @ApiProperty({ required: false, nullable: true })
  readonly date: Date | null;

  @ApiProperty({ enum: ScheduleFrequency })
  readonly frequency: ScheduleFrequency;

  @ApiProperty({ enum: ScheduleDays, isArray: true })
  readonly days: ScheduleDays[];

  @ApiProperty({ enum: NotificationChannel, isArray: true })
  readonly channel: NotificationChannel[];

  @ApiProperty()
  readonly created_at: Date;

  @ApiProperty()
  readonly updated_at: Date;

  @ApiProperty()
  readonly user_id: string;

  @ApiProperty()
  readonly home_id: string;

  @ApiProperty()
  readonly actions: ICreateScheduleAction[];

  constructor(partial: Partial<ScheduleDto>) {
    Object.assign(this, partial);
  }
}
