import { ApiProperty } from '@nestjs/swagger';
import { HomeOrderBy } from '../enums/home-order-by.enum';
import { IHomePageMetaParametersDto } from '../interfaces/home-page-meta-parameters.interface';
import { PageMetaDto } from '@app/models/common';
import { Prisma } from 'generated/prisma/client';

export class HomePageMetaDto extends PageMetaDto {
  @ApiProperty({ nullable: true })
  readonly search: string | null;

  @ApiProperty({ enum: HomeOrderBy })
  readonly orderBy: HomeOrderBy;

  @ApiProperty({ enum: Prisma.SortOrder })
  readonly sortOrder: Prisma.SortOrder;

  constructor({ pageOptions, itemCount }: IHomePageMetaParametersDto) {
    super({ pageOptions, itemCount });
    this.search = pageOptions.search;
    this.orderBy = pageOptions.orderBy;
    this.sortOrder = pageOptions.sortOrder;
  }
}
