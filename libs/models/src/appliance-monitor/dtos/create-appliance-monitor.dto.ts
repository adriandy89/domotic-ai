import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateApplianceMonitorDto {
  @ApiProperty({
    description: 'name',
    example: 'Lavadora cocina',
    maxLength: 124,
  })
  @Length(2, 124)
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @ApiProperty({ description: 'home_id', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  readonly home_id: string;

  @ApiProperty({
    description: 'The source smart plug (device id) whose power is monitored',
    example: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  readonly source_device_id: string;

  @ApiProperty({
    description: 'appliance type',
    example: 'washing_machine',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  readonly appliance_type?: string;

  @ApiProperty({
    description: 'Numeric telemetry field holding instantaneous power (W)',
    example: 'power',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  readonly power_field?: string;

  @ApiProperty({
    description: 'Power (W) sustained ≥ this starts a cycle',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  readonly run_threshold_w?: number;

  @ApiProperty({
    description: 'Power (W) sustained ≤ this ends a cycle (must be < run)',
    example: 2,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  readonly idle_threshold_w?: number;

  @ApiProperty({
    description: 'Seconds power must stay above run threshold',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly min_run_seconds?: number;

  @ApiProperty({
    description: 'Seconds power must stay below idle threshold',
    example: 120,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly min_finish_seconds?: number;

  @ApiProperty({ description: 'active', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  readonly active?: boolean;
}
