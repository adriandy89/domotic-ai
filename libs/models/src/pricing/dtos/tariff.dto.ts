import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PRICING_SOURCES,
  PricingSource,
  TARIFF_MODES,
  TariffMode,
} from '../enums';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TouPeriodDto {
  @ApiPropertyOptional({ description: 'Stable id for UI editing (e.g. "p1")' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  readonly id?: string;

  @ApiProperty({ description: 'Display label (e.g. "Punta")' })
  @IsString()
  @MaxLength(64)
  readonly label: string;

  @ApiProperty({
    description: 'Days of week the period applies to (0=Sunday .. 6=Saturday)',
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  readonly days: number[];

  @ApiProperty({ description: 'Start time "HH:MM" in the tariff timezone' })
  @Matches(HHMM_REGEX)
  readonly start: string;

  @ApiProperty({
    description:
      'End time "HH:MM" (exclusive). When end <= start the period wraps past midnight.',
  })
  @Matches(HHMM_REGEX)
  readonly end: string;

  @ApiProperty({ description: 'Energy price for the period (currency/kWh)' })
  @IsNumber()
  @Min(0)
  @Max(10)
  readonly price: number;
}

export class UpdateHomeTariffDto {
  @ApiProperty({ enum: TARIFF_MODES })
  @IsIn(TARIFF_MODES)
  readonly mode: TariffMode;

  @ApiPropertyOptional({ description: 'Fixed/fallback price (currency/kWh)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  readonly kwh_price?: number;

  @ApiPropertyOptional({ description: 'ISO 4217 currency code (e.g. "EUR")' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  readonly currency?: string;

  // --- tou ---
  @ApiPropertyOptional({ description: 'IANA timezone for TOU periods' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly timezone?: string;

  @ApiPropertyOptional({
    type: [TouPeriodDto],
    description: 'TOU periods (first match wins)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TouPeriodDto)
  readonly periods?: TouPeriodDto[];

  @ApiPropertyOptional({
    description: 'Price when no TOU period matches (currency/kWh)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  readonly default_price?: number;

  // --- dynamic ---
  @ApiPropertyOptional({ enum: PRICING_SOURCES })
  @IsOptional()
  @IsIn(PRICING_SOURCES)
  readonly provider?: PricingSource;

  @ApiPropertyOptional({ description: 'Provider zone id (e.g. "ES-PEN")' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  readonly zone?: string;
}

export class HomeTariffResponseDto {
  @ApiProperty()
  readonly home_id: string;

  @ApiProperty({ enum: TARIFF_MODES })
  readonly mode: TariffMode;

  @ApiProperty()
  readonly kwh_price: number;

  @ApiProperty()
  readonly currency: string;

  @ApiPropertyOptional()
  readonly timezone?: string;

  @ApiPropertyOptional({ type: [TouPeriodDto] })
  readonly periods?: TouPeriodDto[];

  @ApiPropertyOptional()
  readonly default_price?: number;

  @ApiPropertyOptional({ enum: PRICING_SOURCES })
  readonly provider?: PricingSource;

  @ApiPropertyOptional()
  readonly zone?: string;
}

/** Shape persisted in `homes.tariff_config` for TOU mode. */
export interface TouTariffConfig {
  timezone: string;
  default_price?: number;
  periods: TouPeriodDto[];
}

/** Shape persisted in `homes.tariff_config` for DYNAMIC mode. */
export interface DynamicTariffConfig {
  provider: PricingSource;
  zone: string;
}
