import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateCommandNameDto {
  @ApiProperty({
    description: 'name',
    example: 'name',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  readonly name: string;
}
