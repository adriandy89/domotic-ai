import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FindByHomeIdDto {
  @ApiProperty({
    description: 'Home ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  readonly home_id: string;
}
