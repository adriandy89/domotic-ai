import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { HomePageMetaDto } from './home-page-meta.dto';
import { HomeDto } from './home.dto';

export class HomePageDto {
  @IsArray()
  @ApiProperty()
  readonly data: HomeDto[];

  @ApiProperty({ type: () => HomePageMetaDto })
  readonly meta: HomePageMetaDto;

  constructor(data: HomeDto[], meta: HomePageMetaDto) {
    this.meta = meta;
    this.data = data;
  }
}
