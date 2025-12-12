import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber } from 'class-validator';

export class UpdateDeviceMapDto {
  @ApiProperty({
    description: 'show_on_map',
    example: true,
    required: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  readonly show_on_map: boolean;

  @ApiProperty({
    description: 'x',
    example: 0,
    required: false,
  })
  @IsNotEmpty()
  @IsNumber()
  readonly x: number;

  @ApiProperty({
    description: 'y',
    example: 0,
    required: false,
  })
  @IsNotEmpty()
  @IsNumber()
  readonly y: number;
}
