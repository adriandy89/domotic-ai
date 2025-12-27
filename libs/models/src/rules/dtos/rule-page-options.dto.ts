import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RuleOrderBy } from '../enums/rule-order-by.enum';
import { PageOptionsDto } from '@app/models/common';

export class RulePageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({
    enum: RuleOrderBy,
    default: RuleOrderBy.created_at,
  })
  @IsEnum(RuleOrderBy)
  @IsOptional()
  readonly orderBy: RuleOrderBy = RuleOrderBy.created_at;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  readonly search: string;
}
