import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ICreateCondition, ICreateResult } from '../interfaces';
import { RuleType, ScheduleDays } from 'generated/prisma/enums';

export class CreateRuleDto {
  @ApiProperty({
    description: 'name',
    example: 'Door1',
    maxLength: 124,
    minLength: 2,
  })
  @Length(2, 124)
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @ApiProperty({
    description: 'description',
    example: 'description',
    required: false,
    maxLength: 500,
    minLength: 1,
  })
  @MaxLength(500)
  @IsOptional()
  @IsString()
  readonly description?: string;

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
    description: 'all',
    example: true,
    default: true,
    required: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  readonly all: boolean;

  @ApiProperty({
    description: 'interval in seconds',
    example: 60,
    required: true,
    minimum: 0,
  })
  @IsInt()
  @IsNotEmpty()
  @Min(0)
  readonly interval: number;

  @ApiProperty({
    description: 'timestamp',
    example: new Date(),
    required: false,
  })
  @IsOptional()
  readonly timestamp?: Date;

  @ApiProperty({
    description: 'type',
    example: 'type',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  readonly type: RuleType;

  @ApiProperty({
    description: 'conditions',
    example: [],
    required: true,
  })
  @IsArray()
  @IsNotEmpty()
  readonly conditions: ICreateCondition[];

  @ApiProperty({
    description: 'results',
    example: [],
    required: true,
  })
  @IsArray()
  @IsNotEmpty()
  readonly results: ICreateResult[];

  @ApiProperty({
    description: 'home_id',
    example: 1,
    required: true,
  })
  @IsUUID()
  @IsNotEmpty()
  readonly home_id: string;

  // ── "When to execute" window (optional gate) ──────────────────────────────

  @ApiProperty({
    description: 'Enable the execution-time window gate',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly window_active?: boolean;

  @ApiProperty({
    description: 'Allowed weekdays (empty = every day)',
    enum: ScheduleDays,
    isArray: true,
    example: ['MONDAY', 'FRIDAY'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ScheduleDays, { each: true })
  readonly window_days?: ScheduleDays[];

  @ApiProperty({
    description: 'Allow any time of day (false = use window_start/window_end)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly window_all_day?: boolean;

  @ApiProperty({
    description: 'Window start as minute-of-day (0-1439). 480 = 08:00',
    example: 480,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  readonly window_start?: number;

  @ApiProperty({
    description: 'Window end as minute-of-day (0-1439). 1170 = 19:30',
    example: 1170,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  readonly window_end?: number;
}
