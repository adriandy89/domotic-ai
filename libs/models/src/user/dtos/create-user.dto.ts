import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsEmail,
} from 'class-validator';
import { RoleTrack } from '../enums';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'email',
    example: 'johndoe@example.com',
    maxLength: 255,
    minLength: 2,
  })
  @IsString()
  @IsEmail()
  @MinLength(2)
  @MaxLength(255)
  readonly email: string;

  // phone
  @ApiProperty({
    description: 'phone with country code',
    example: '341234567890',
    minLength: 8,
    maxLength: 32,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  readonly phone?: string;

  @ApiProperty({
    description: 'name',
    example: 'John Doe',
    maxLength: 124,
    minLength: 2,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(124)
  readonly name: string;

  @ApiProperty({
    description: 'password',
    example: 'Password123*',
    maxLength: 32,
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])(?=.{8,})/)
  readonly password: string;

  @ApiProperty({
    description: `Enable/Disable`,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly is_active: boolean = false;

  @ApiProperty({
    description: 'role',
    example: RoleTrack.USER,
    enum: RoleTrack,
  })
  @IsOptional()
  @IsEnum(RoleTrack)
  readonly role?: RoleTrack;
}
