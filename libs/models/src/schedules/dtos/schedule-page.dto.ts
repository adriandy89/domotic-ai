import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { SchedulePageMetaDto } from './schedule-page-meta.dto';
import { ScheduleDto } from './schedule.dto';

export class SchedulePageDto {
  @IsArray()
  @ApiProperty()
  readonly data: ScheduleDto[];

  @ApiProperty({ type: () => SchedulePageMetaDto })
  readonly meta: SchedulePageMetaDto;

  constructor(data: ScheduleDto[], meta: SchedulePageMetaDto) {
    this.meta = meta;
    this.data = data;
  }
}
