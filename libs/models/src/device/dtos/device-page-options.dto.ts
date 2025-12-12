import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DeviceOrderBy } from '../enums/device-order-by.enum';
import { PageOptionsDto } from '@app/models/common';

export class DevicePageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({
    enum: DeviceOrderBy,
    default: DeviceOrderBy.created_at,
  })
  @IsEnum(DeviceOrderBy)
  @IsOptional()
  readonly orderBy: DeviceOrderBy = DeviceOrderBy.created_at;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  readonly search: string;
}
