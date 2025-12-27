import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { ICreateCondition, ICreateResult } from '../interfaces';
import { RuleType } from 'generated/prisma/enums';

export class CreateRuleDto {
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
  @MaxLength(500)
  @IsOptional()
  @IsString()
  readonly description?: string;

  @ApiProperty({
    description: 'active',
    example: true,
    default: true,
    required: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  readonly active: boolean;

  @ApiProperty({
    description: 'all',
    example: true,
    default: true,
    required: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  readonly all: boolean;

  @ApiProperty({
    description: 'interval in seconds',
    example: 60,
    required: true,
    minimum: 0,
  })
  @IsInt()
  @IsNotEmpty()
  @Min(0)
  readonly interval: number;

  @ApiProperty({
    description: 'timestamp',
    example: new Date(),
    required: false,
  })
  @IsOptional()
  readonly timestamp?: Date;

  @ApiProperty({
    description: 'type',
    example: 'type',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  readonly type: RuleType;

  @ApiProperty({
    description: 'conditions',
    example: [],
    required: true,
  })
  @IsArray()
  @IsNotEmpty()
  readonly conditions: ICreateCondition[];

  @ApiProperty({
    description: 'results',
    example: [],
    required: true,
  })
  @IsArray()
  @IsNotEmpty()
  readonly results: ICreateResult[];

  @ApiProperty({
    description: 'home_id',
    example: 1,
    required: true,
  })
  @IsInt()
  @IsNotEmpty()
  readonly home_id: number;
}
