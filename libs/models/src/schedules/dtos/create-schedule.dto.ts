import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import {
  NotificationChannel,
  ScheduleDays,
  ScheduleFrequency,
} from 'generated/prisma/enums';
import { ICreateScheduleAction } from '../interfaces';

export class CreateScheduleDto {
  @ApiProperty({
    description: 'name',
    example: 'Turn off lights at night',
    maxLength: 124,
    minLength: 2,
  })
  @Length(2, 124)
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @ApiProperty({
    description: 'active',
    example: true,
    default: true,
    required: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  readonly active: boolean;

  @ApiProperty({
    description: 'Run this schedule locally on edge-enabled homes when offline',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly run_offline?: boolean;

  @ApiProperty({
    description: 'Date/time for ONCE frequency or daily anchor for DAILY/CUSTOM',
    example: '2026-05-04T22:30:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  readonly date?: string;

  @ApiProperty({
    description: 'frequency',
    enum: ScheduleFrequency,
    example: 'DAILY',
    required: true,
  })
  @IsEnum(ScheduleFrequency)
  @IsNotEmpty()
  readonly frequency: ScheduleFrequency;

  @ApiProperty({
    description: 'days of week (used when frequency=CUSTOM)',
    enum: ScheduleDays,
    isArray: true,
    example: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
    required: true,
  })
  @IsArray()
  @IsEnum(ScheduleDays, { each: true })
  readonly days: ScheduleDays[];

  @ApiProperty({
    description: 'notification channels (when an action is a notification)',
    enum: NotificationChannel,
    isArray: true,
    example: ['EMAIL'],
    required: true,
  })
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  readonly channel: NotificationChannel[];

  @ApiProperty({
    description: 'actions to execute on trigger',
    example: [],
    required: true,
  })
  @IsArray()
  readonly actions: ICreateScheduleAction[];

  @ApiProperty({
    description: 'home_id',
    example: 'uuid',
    required: true,
  })
  @IsUUID()
  @IsNotEmpty()
  readonly home_id: string;
}
