import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { RulePageMetaDto } from './rule-page-meta.dto';
import { RuleDto } from './rule.dto';

export class RulePageDto {
  @IsArray()
  @ApiProperty()
  readonly data: RuleDto[];

  @ApiProperty({ type: () => RulePageMetaDto })
  readonly meta: RulePageMetaDto;

  constructor(data: RuleDto[], meta: RulePageMetaDto) {
    this.meta = meta;
    this.data = data;
  }
}
