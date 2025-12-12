import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { UserPageMetaDto } from './user-page-meta.dto';
import { UserDto } from './user.dto';

export class UserPageDto {
  @IsArray()
  @ApiProperty()
  readonly data: UserDto[];

  @ApiProperty({ type: () => UserPageMetaDto })
  readonly meta: UserPageMetaDto;

  constructor(data: UserDto[], meta: UserPageMetaDto) {
    this.meta = meta;
    this.data = data;
  }
}
