import { ApiProperty } from '@nestjs/swagger';
import { ScheduleOrderBy } from '../enums/schedule-order-by.enum';
import { ISchedulePageMetaParametersDto } from '../interfaces/schedule-page-meta-parameters.interface';
import { PageMetaDto } from '@app/models/common';
import { Prisma } from 'generated/prisma/client';

export class SchedulePageMetaDto extends PageMetaDto {
  @ApiProperty({ nullable: true })
  readonly search: string | null;

  @ApiProperty({ enum: ScheduleOrderBy })
  readonly orderBy: ScheduleOrderBy;

  @ApiProperty({ enum: Prisma.SortOrder })
  readonly sortOrder: Prisma.SortOrder;

  constructor({ pageOptions, itemCount }: ISchedulePageMetaParametersDto) {
    super({ pageOptions, itemCount });
    this.search = pageOptions.search;
    this.orderBy = pageOptions.orderBy;
    this.sortOrder = pageOptions.sortOrder;
  }
}
