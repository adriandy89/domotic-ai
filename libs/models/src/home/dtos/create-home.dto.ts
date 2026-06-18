import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  IsNumber,
} from 'class-validator';

export class CreateHomeDto {
  @ApiProperty({
    description: 'name',
    example: 'Door1',
    maxLength: 124,
    minLength: 2,
  })
  @Length(2, 124)
  @IsString()
  @IsNotEmpty()
  readonly name: string;

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
  readonly image?: string;

  @ApiProperty({
    description: 'attributes',
    example: {},
    default: {},
    required: false,
  })
  @IsOptional()
  @IsObject()
  readonly attributes?: object;

  @ApiProperty({
    description: 'timezone',
    example: 'Europe/Madrid',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  readonly timezone?: string;

  @ApiProperty({
    description: 'address',
    example: 'Calle Falsa 123',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  readonly address?: string;

  @ApiProperty({
    description: 'latitude',
    example: 40.4168,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly latitude?: number;

  @ApiProperty({
    description: 'longitude',
    example: -3.7038,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly longitude?: number;

  @ApiProperty({
    description: `Enable/Disable home`,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly disabled?: boolean;
}
