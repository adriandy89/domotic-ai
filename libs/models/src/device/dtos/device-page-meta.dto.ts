import { ApiProperty } from '@nestjs/swagger';
import { DeviceOrderBy } from '../enums/device-order-by.enum';
import { IDevicePageMetaParametersDto } from '../interfaces/device-page-meta-parameters.interface';
import { PageMetaDto } from '@app/models/common';
import { Prisma } from 'generated/prisma/client';

export class DevicePageMetaDto extends PageMetaDto {
  @ApiProperty({ nullable: true })
  readonly search: string | null;

  @ApiProperty({ enum: DeviceOrderBy })
  readonly orderBy: DeviceOrderBy;

  @ApiProperty({ enum: Prisma.SortOrder })
  readonly sortOrder: Prisma.SortOrder;

  constructor({ pageOptions, itemCount }: IDevicePageMetaParametersDto) {
    super({ pageOptions, itemCount });
    this.search = pageOptions.search;
    this.orderBy = pageOptions.orderBy;
    this.sortOrder = pageOptions.sortOrder;
  }
}
