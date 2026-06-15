import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PRICING_SOURCES, PricingSource, TariffMode } from '../enums';

export class HomePricesQueryDto {
  @ApiPropertyOptional({
    description: 'ISO8601 start (defaults to local today 00:00)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly from?: Date;

  @ApiPropertyOptional({
    description: 'ISO8601 end (defaults to end of tomorrow)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly to?: Date;
}

export class AdminPricingRefreshDto {
  @ApiPropertyOptional({
    enum: PRICING_SOURCES,
    description: 'Defaults to all active sources',
  })
  @IsOptional()
  @IsIn(PRICING_SOURCES)
  readonly source?: PricingSource;

  @ApiPropertyOptional({ description: 'Zone id; defaults to all active zones' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  readonly zone?: string;

  @ApiPropertyOptional({ description: 'ISO8601 start day (defaults to today)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly from?: Date;

  @ApiPropertyOptional({
    description: 'ISO8601 end day (defaults to tomorrow)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly to?: Date;
}

export class ProviderPricesQueryDto {
  @ApiProperty({ enum: PRICING_SOURCES })
  @IsIn(PRICING_SOURCES)
  readonly source: PricingSource;

  @ApiProperty({ description: 'Provider-specific zone id (e.g. ES-PEN, FR)' })
  @IsString()
  @MaxLength(16)
  readonly zone: string;

  @ApiProperty({ description: 'ISO8601 start (UTC)' })
  @Type(() => Date)
  @IsDate()
  readonly from: Date;

  @ApiProperty({ description: 'ISO8601 end (UTC, exclusive)' })
  @Type(() => Date)
  @IsDate()
  readonly to: Date;
}

export class PricePointDto {
  @ApiProperty({ description: 'ISO8601 hour start (UTC)' })
  readonly ts: string;

  @ApiProperty({ description: 'Energy price (currency/kWh)' })
  readonly price_kwh: number;
}

export class ProviderPricesResponseDto {
  @ApiProperty({ enum: PRICING_SOURCES })
  readonly source: string;

  @ApiProperty()
  readonly zone: string;

  @ApiProperty()
  readonly currency: string;

  @ApiProperty({ type: [PricePointDto] })
  readonly points: PricePointDto[];
}

export class HomePriceCurveResponseDto {
  @ApiProperty()
  readonly home_id: string;

  @ApiProperty()
  readonly mode: TariffMode;

  @ApiProperty()
  readonly currency: string;

  @ApiProperty({ type: [PricePointDto] })
  readonly points: PricePointDto[];

  @ApiProperty({ nullable: true, description: 'Price for the current hour' })
  readonly current_price: number | null;

  @ApiProperty({
    description:
      'False for dynamic homes when tomorrow has no published prices yet (PVPC publishes ~20:15 CET)',
  })
  readonly tomorrow_published: boolean;
}

export class PricingProviderDto {
  @ApiProperty()
  readonly source: string;

  @ApiProperty()
  readonly label: string;

  @ApiProperty()
  readonly enabled: boolean;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: { id: { type: 'string' }, label: { type: 'string' } },
    },
  })
  readonly zones: { id: string; label: string }[];
}
