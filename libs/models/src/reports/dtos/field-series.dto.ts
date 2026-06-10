import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ReportBucket } from '../enums';
import { ReportSeriesPointDto } from './series-response.dto';

/**
 * Query for the generic per-field statistics (`sensor_field_hourly/daily`):
 * any numeric payload field of any protocol, not just the fixed
 * {@link ReportMetric} set — e.g. an HA sound sensor's `leq_db` / `band_bass`.
 */
export class ReportFieldSeriesQueryDto {
  @ApiProperty({ description: 'Device id (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  readonly device_id!: string;

  @ApiProperty({ description: 'Raw payload field name (e.g. "leq_db")' })
  @Matches(/^[a-zA-Z0-9_]+$/)
  @MaxLength(64)
  readonly field!: string;

  @ApiProperty({ description: 'ISO8601 start date' })
  @Type(() => Date)
  @IsDate()
  readonly from: Date;

  @ApiProperty({ description: 'ISO8601 end date' })
  @Type(() => Date)
  @IsDate()
  readonly to: Date;

  @ApiPropertyOptional({ enum: ['raw', 'hour', 'day'], default: 'hour' })
  @IsOptional()
  @IsIn(['raw', 'hour', 'day'])
  readonly bucket?: ReportBucket = 'hour';
}

export class ReportFieldSeriesResponseDto {
  @ApiProperty()
  readonly device_id: string;

  @ApiProperty()
  readonly field: string;

  @ApiProperty()
  readonly bucket: ReportBucket;

  @ApiProperty()
  readonly from: string;

  @ApiProperty()
  readonly to: string;

  @ApiProperty({ type: [ReportSeriesPointDto] })
  readonly points: ReportSeriesPointDto[];

  /** Unit hint from the device's readable attributes, when declared. */
  @ApiProperty({ required: false, nullable: true })
  readonly unit?: string | null;

  /** HA device_class from the device's readable attributes, when declared. */
  @ApiProperty({ required: false, nullable: true })
  readonly deviceClass?: string | null;

  /** HA state_class from the device's readable attributes, when declared. */
  @ApiProperty({ required: false, nullable: true })
  readonly stateClass?: string | null;
}
