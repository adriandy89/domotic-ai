import { ApiProperty } from '@nestjs/swagger';
import { UserOrderBy } from '../enums/user-order-by.enum';
import { IUserPageMetaParametersDto } from '../interfaces/user-page-meta-parameters.interface';
import { PageMetaDto } from '@app/models/common';
import { Prisma } from '@prisma/client';

export class UserPageMetaDto extends PageMetaDto {
  @ApiProperty({ enum: UserOrderBy })
  readonly orderBy: UserOrderBy;

  @ApiProperty({ enum: Prisma.SortOrder })
  readonly sortOrder: Prisma.SortOrder;

  constructor({ pageOptions, itemCount }: IUserPageMetaParametersDto) {
    super({ pageOptions, itemCount });
    this.orderBy = pageOptions.orderBy;
    this.sortOrder = pageOptions.sortOrder;
  }
}
