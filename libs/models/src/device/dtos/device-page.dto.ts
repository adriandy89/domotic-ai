import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { DevicePageMetaDto } from './device-page-meta.dto';
import { DeviceDto } from './device.dto';

export class DevicePageDto {
  @IsArray()
  @ApiProperty()
  readonly data: DeviceDto[];

  @ApiProperty({ type: () => DevicePageMetaDto })
  readonly meta: DevicePageMetaDto;

  constructor(data: DeviceDto[], meta: DevicePageMetaDto) {
    this.meta = meta;
    this.data = data;
  }
}
