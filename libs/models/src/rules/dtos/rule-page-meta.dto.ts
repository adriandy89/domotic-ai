import { ApiProperty } from '@nestjs/swagger';
import { RuleOrderBy } from '../enums/rule-order-by.enum';
import { IRulePageMetaParametersDto } from '../interfaces/rule-page-meta-parameters.interface';
import { PageMetaDto } from '@app/models/common';
import { Prisma } from 'generated/prisma/client';

export class RulePageMetaDto extends PageMetaDto {
  @ApiProperty({ nullable: true })
  readonly search: string | null;

  @ApiProperty({ enum: RuleOrderBy })
  readonly orderBy: RuleOrderBy;

  @ApiProperty({ enum: Prisma.SortOrder })
  readonly sortOrder: Prisma.SortOrder;

  constructor({ pageOptions, itemCount }: IRulePageMetaParametersDto) {
    super({ pageOptions, itemCount });
    this.search = pageOptions.search;
    this.orderBy = pageOptions.orderBy;
    this.sortOrder = pageOptions.sortOrder;
  }
}
