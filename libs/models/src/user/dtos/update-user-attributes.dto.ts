import { IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserAttributesDto {
  @ApiProperty({
    description: 'attributes',
    example: {},
    default: {},
    required: false,
  })
  @IsOptional()
  @IsObject()
  readonly attributes: object = {};
}
