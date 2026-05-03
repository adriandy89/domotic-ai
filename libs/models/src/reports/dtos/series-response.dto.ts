import { ApiProperty } from '@nestjs/swagger';
import { ReportBucket, ReportMetric } from '../enums';

export class ReportSeriesPointDto {
  @ApiProperty({ description: 'ISO8601 bucket start' })
  readonly bucket: string;

  @ApiProperty({ nullable: true })
  readonly value: number | null;

  @ApiProperty({ nullable: true, required: false })
  readonly min?: number | null;

  @ApiProperty({ nullable: true, required: false })
  readonly max?: number | null;

  @ApiProperty({ nullable: true, required: false })
  readonly count?: number | null;
}

export class ReportSeriesResponseDto {
  @ApiProperty()
  readonly device_id: string;

  @ApiProperty()
  readonly metric: ReportMetric;

  @ApiProperty()
  readonly bucket: ReportBucket;

  @ApiProperty()
  readonly from: string;

  @ApiProperty()
  readonly to: string;

  @ApiProperty({ type: [ReportSeriesPointDto] })
  readonly points: ReportSeriesPointDto[];

  /** Unit hint for the UI (°C, %, W, kWh, ...). */
  @ApiProperty({ required: false, nullable: true })
  readonly unit?: string | null;
}

export class ReportMultiSeriesResponseDto {
  @ApiProperty()
  readonly metric: ReportMetric;

  @ApiProperty()
  readonly bucket: ReportBucket;

  @ApiProperty({ type: [ReportSeriesResponseDto] })
  readonly series: ReportSeriesResponseDto[];
}

export class ReportAggregateResponseDto {
  @ApiProperty()
  readonly device_id: string;

  @ApiProperty()
  readonly from: string;

  @ApiProperty()
  readonly to: string;

  /**
   * Map of metric → aggregate value. The set of keys depends on which metrics
   * the device has reported in the period (skips empty ones).
   *
   *  temperature_avg/min/max, humidity_avg, pressure_avg, illuminance_avg,
   *  power_avg/max, energy_kwh, voltage_avg, current_avg,
   *  contact_open_count, occupancy_count, presence_count, motion_count,
   *  vibration_count, smoke_count, water_leak_count, tamper_count, action_count,
   *  co2_avg, voc_avg, pm25_avg, pm10_avg,
   *  battery_min, lqi_avg, sample_count
   */
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  readonly metrics: Record<string, number | null>;
}
