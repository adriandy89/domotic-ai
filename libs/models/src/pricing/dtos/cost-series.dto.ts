import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { TariffMode } from '../enums';

export type CostBucket = 'hour' | 'day';

export class ReportCostSeriesQueryDto {
  @ApiProperty({ description: 'Device id (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  readonly device_id!: string;

  @ApiProperty({ description: 'ISO8601 start date' })
  @Type(() => Date)
  @IsDate()
  readonly from: Date;

  @ApiProperty({ description: 'ISO8601 end date' })
  @Type(() => Date)
  @IsDate()
  readonly to: Date;

  @ApiPropertyOptional({ enum: ['hour', 'day'], default: 'day' })
  @IsOptional()
  @IsIn(['hour', 'day'])
  readonly bucket?: CostBucket = 'day';
}

export class CostSeriesPointDto {
  @ApiProperty({ description: 'ISO8601 bucket start' })
  readonly bucket: string;

  @ApiProperty({ description: 'Consumption in the bucket (kWh)' })
  readonly energy_kwh: number;

  @ApiProperty({
    nullable: true,
    description:
      'Average price applied in the bucket (currency/kWh); null when no consumption',
  })
  readonly price_kwh: number | null;

  @ApiProperty({ description: 'Cost of the bucket (currency)' })
  readonly cost: number;
}

export class CostSeriesTotalsDto {
  @ApiProperty()
  readonly energy_kwh: number;

  @ApiProperty()
  readonly cost: number;

  @ApiProperty({ description: 'Hours priced with real tariff data' })
  readonly priced_hours: number;

  @ApiProperty({
    description:
      'Hours priced with the fixed kwh_price fallback because no market price was stored — when > 0 the UI should flag the total as an estimate',
  })
  readonly fallback_hours: number;
}

export class ReportCostSeriesResponseDto {
  @ApiProperty()
  readonly device_id: string;

  @ApiProperty({ enum: ['hour', 'day'] })
  readonly bucket: CostBucket;

  @ApiProperty()
  readonly from: string;

  @ApiProperty()
  readonly to: string;

  @ApiProperty()
  readonly mode: TariffMode;

  @ApiProperty()
  readonly currency: string;

  @ApiProperty({ type: [CostSeriesPointDto] })
  readonly points: CostSeriesPointDto[];

  @ApiProperty({ type: CostSeriesTotalsDto })
  readonly totals: CostSeriesTotalsDto;
}
