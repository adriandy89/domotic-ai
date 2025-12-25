import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateRestrictedDeviceDto {
  @ApiProperty({
    description: 'name',
    example: 'My Device1',
    maxLength: 64,
    minLength: 2,
  })
  @Length(2, 64)
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  readonly name?: string;

  @ApiProperty({
    description: 'category',
    example: 'category',
    required: false,
    maxLength: 124,
    minLength: 1,
  })
  @Length(1, 124)
  @IsOptional()
  @IsString()
  readonly category?: string;

  @ApiProperty({
    description: 'description',
    example: 'description',
    required: false,
    maxLength: 500,
    minLength: 1,
  })
  @Length(1, 500)
  @IsOptional()
  @IsString()
  readonly description?: string;

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
  readonly icon?: string;
}
