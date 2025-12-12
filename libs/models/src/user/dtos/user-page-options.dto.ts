import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { UserOrderBy } from '../enums/user-order-by.enum';
import { PageOptionsDto } from '@app/models/common';

export class UserPageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({
    enum: UserOrderBy,
    default: UserOrderBy.created_at,
  })
  @IsEnum(UserOrderBy)
  @IsOptional()
  readonly orderBy: UserOrderBy = UserOrderBy.created_at;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  readonly search: string;
}
