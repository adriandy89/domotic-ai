import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query for the device state-change logbook (`device_state_events`): actual
 * transitions of non-numeric scalar states (relay OFF→ON, trigger
 * schedule→remote, contact true→false), written at ingestion time.
 */
export class ReportStateEventsQueryDto {
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

  @ApiPropertyOptional({
    description: 'Filter by payload field (e.g. "relay")',
  })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_]+$/)
  @MaxLength(64)
  readonly field?: string;

  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  readonly limit?: number = 500;
}

export class ReportStateEventDto {
  @ApiProperty({ description: 'ISO8601 event time' })
  readonly timestamp: string;

  @ApiProperty({ description: 'Payload field that changed' })
  readonly property: string;

  @ApiProperty({ nullable: true })
  readonly prev_value: string | null;

  @ApiProperty()
  readonly value: string;
}

export class ReportStateEventsResponseDto {
  @ApiProperty()
  readonly device_id: string;

  @ApiProperty()
  readonly from: string;

  @ApiProperty()
  readonly to: string;

  @ApiProperty({ type: [ReportStateEventDto], description: 'Newest first' })
  readonly events: ReportStateEventDto[];
}
