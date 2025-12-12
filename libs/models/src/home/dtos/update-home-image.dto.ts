import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateHomeImageDto {
  @ApiProperty({
    description: 'image',
    example: 'image',
    required: false,
    maxLength: 500,
    minLength: 1,
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  readonly image: string;
}
