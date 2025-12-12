import { ApiProperty } from '@nestjs/swagger';

export class DeviceDto {
  @ApiProperty()
  readonly id: string;

  @ApiProperty()
  readonly unique_id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly model?: string;

  @ApiProperty()
  readonly category?: string;

  @ApiProperty()
  readonly description?: string;

  @ApiProperty()
  readonly icon?: string;

  @ApiProperty()
  readonly attributes?: object;

  @ApiProperty()
  readonly disabled?: boolean;

  @ApiProperty()
  readonly created_at: Date;

  @ApiProperty()
  readonly updated_at?: Date;

  @ApiProperty()
  readonly organization_id: string;

  @ApiProperty()
  readonly home_id?: string;

  @ApiProperty()
  readonly x?: number;

  @ApiProperty()
  readonly y?: number;

  @ApiProperty()
  readonly show_on_map?: boolean;

  constructor(partial: Partial<DeviceDto>) {
    Object.assign(this, partial);
  }
}
