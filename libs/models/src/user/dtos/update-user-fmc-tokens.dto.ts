import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserFmcTokenDto {
  @ApiProperty({
    description: 'fmc_token',
    example: 'fmcToken1',
  })
  @IsNotEmpty()
  @IsString()
  readonly fmc_token: string;
}
