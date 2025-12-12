import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCommandDeviceDto {
  @ApiProperty({
    description: 'A valid id of device',
    example: '123e4567-e89b-12d3-a456-426614174000',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  readonly device_id: string;

  @ApiProperty({
    description: 'name',
    example: 'name',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  readonly name: string;

  @ApiProperty({
    description: 'command',
    example: 'command000',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2040)
  readonly command: string;
}
