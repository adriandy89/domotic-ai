import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateHomeIconDto {
  @ApiProperty({
    description: 'icon',
    example: 'icon',
    required: false,
    maxLength: 500,
    minLength: 1,
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  readonly icon: string;
}
