import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleApplianceMonitorDto {
  @ApiProperty({ description: 'active', example: true })
  @IsBoolean()
  @IsNotEmpty()
  readonly active: boolean;
}
