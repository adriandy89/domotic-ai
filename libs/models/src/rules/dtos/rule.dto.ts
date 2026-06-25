import { ApiProperty } from '@nestjs/swagger';
import { ICreateCondition, ICreateResult } from '../interfaces';
import { RuleType, ScheduleDays } from 'generated/prisma/enums';

export class RuleDto {
  @ApiProperty()
  readonly id: string;

  @ApiProperty()
  readonly type: RuleType;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly description: string;

  @ApiProperty()
  readonly active: boolean;

  @ApiProperty()
  readonly all: boolean;

  @ApiProperty()
  readonly interval: number;

  @ApiProperty()
  readonly timestamp: Date;

  @ApiProperty()
  readonly created_at: Date;

  @ApiProperty()
  readonly updated_at: Date;

  @ApiProperty()
  readonly conditions: ICreateCondition[];

  @ApiProperty()
  readonly results: ICreateResult[];

  @ApiProperty()
  readonly user_id: string;

  @ApiProperty()
  readonly home_id: string;

  @ApiProperty()
  readonly window_active: boolean;

  @ApiProperty({ enum: ScheduleDays, isArray: true })
  readonly window_days: ScheduleDays[];

  @ApiProperty()
  readonly window_all_day: boolean;

  @ApiProperty({ required: false, nullable: true })
  readonly window_start: number | null;

  @ApiProperty({ required: false, nullable: true })
  readonly window_end: number | null;

  @ApiProperty()
  resend_after: number;

  constructor(partial: Partial<RuleDto>) {
    Object.assign(this, partial);
  }
}
