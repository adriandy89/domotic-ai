import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { REPORT_METRICS, ReportBucket, ReportMetric } from '../enums';

export class ReportSeriesQueryDto {
  @ApiProperty({ description: 'Device id (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  readonly device_id!: string;

  @ApiProperty({ enum: REPORT_METRICS })
  @IsEnum(REPORT_METRICS)
  readonly metric: ReportMetric;

  @ApiProperty({ description: 'ISO8601 start date' })
  @Type(() => Date)
  @IsDate()
  readonly from: Date;

  @ApiProperty({ description: 'ISO8601 end date' })
  @Type(() => Date)
  @IsDate()
  readonly to: Date;

  @ApiPropertyOptional({
    description:
      'Bucket size; defaults to "hour" (recommended for ranges <= 30 days).',
    enum: ['raw', 'hour', 'day'],
    default: 'hour',
  })
  @IsOptional()
  @IsIn(['raw', 'hour', 'day'])
  readonly bucket?: ReportBucket = 'hour';
}

export class ReportMultiSeriesQueryDto {
  @ApiProperty({ description: 'Device ids (UUIDs)', isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  readonly device_ids: string[];

  @ApiProperty({ enum: REPORT_METRICS })
  @IsEnum(REPORT_METRICS)
  readonly metric: ReportMetric;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  readonly from: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  readonly to: Date;

  @ApiPropertyOptional({ enum: ['raw', 'hour', 'day'], default: 'hour' })
  @IsOptional()
  @IsIn(['raw', 'hour', 'day'])
  readonly bucket?: ReportBucket = 'hour';
}

export class ReportAggregateQueryDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  readonly device_id: string;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  readonly from: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  readonly to: Date;
}

export class ReportExportQueryDto extends ReportSeriesQueryDto {
  @ApiPropertyOptional({ enum: ['csv'], default: 'csv' })
  @IsOptional()
  @IsString()
  readonly format?: 'csv' = 'csv';
}
