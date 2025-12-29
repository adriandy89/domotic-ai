import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({
    description: 'unique_id',
    example: '490154203237518',
    maxLength: 124,
    minLength: 2,
  })
  @Length(2, 124)
  @IsString()
  @IsNotEmpty()
  readonly unique_id: string;

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
    description: 'model',
    example: 'model',
    required: false,
    maxLength: 124,
    minLength: 1,
  })
  @MaxLength(124)
  @IsOptional()
  @IsString()
  readonly model?: string;

  @ApiProperty({
    description: 'category',
    example: 'category',
    required: false,
    maxLength: 124,
    minLength: 1,
  })
  @MaxLength(124)
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
  @MaxLength(500)
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
  @MaxLength(500)
  readonly icon?: string;

  @ApiProperty({
    description: `Enable/Disable device`,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly disabled: boolean = false;

  @ApiProperty({
    description: 'home_id',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  readonly home_id?: string;

  @ApiProperty({
    description: 'show_on_map',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly show_on_map?: boolean;

  @ApiProperty({
    description: 'x',
    example: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly x?: number;

  @ApiProperty({
    description: 'y',
    example: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly y?: number;
}
