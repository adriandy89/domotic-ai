import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleRuleDto {
  @ApiProperty({
    description: 'active',
    example: true,
    default: true,
    required: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  readonly active: boolean;
}
