import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CommandDeviceDto {
  @ApiProperty({
    description: 'A valid id of device',
    example: '123e4567-e89b-12d3-a456-426614174000',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  readonly device_id: string;

  @ApiProperty({
    description: 'command',
    example: {},
    default: {},
  })
  @IsNotEmpty()
  readonly command: any;
}
