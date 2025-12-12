import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FindHomeDto {
  @ApiProperty({
    description: 'Home ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    type: String,
  })
  @IsOptional()
  @IsString()
  readonly id?: string;

  @ApiProperty({
    description: 'Home unique ID',
    example: 'home-unique-id',
    type: String,
  })
  @IsOptional()
  @IsString()
  readonly unique_id?: string;
}
