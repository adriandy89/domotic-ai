import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ScheduleOrderBy } from '../enums/schedule-order-by.enum';
import { PageOptionsDto } from '@app/models/common';

export class SchedulePageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({
    enum: ScheduleOrderBy,
    default: ScheduleOrderBy.created_at,
  })
  @IsEnum(ScheduleOrderBy)
  @IsOptional()
  readonly orderBy: ScheduleOrderBy = ScheduleOrderBy.created_at;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  readonly search: string;
}
