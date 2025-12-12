import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { HomeOrderBy } from '../enums/home-order-by.enum';
import { PageOptionsDto } from '@app/models/common';

export class HomePageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({
    enum: HomeOrderBy,
    default: HomeOrderBy.created_at,
  })
  @IsEnum(HomeOrderBy)
  @IsOptional()
  readonly orderBy: HomeOrderBy = HomeOrderBy.created_at;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  readonly search: string;
}
