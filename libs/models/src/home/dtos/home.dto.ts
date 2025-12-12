import { ApiProperty } from '@nestjs/swagger';

export class HomeDto {
  @ApiProperty()
  readonly id: string;

  @ApiProperty()
  readonly unique_id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly mqtt_password?: string;

  @ApiProperty()
  readonly mqtt_username?: string;

  @ApiProperty()
  readonly mqtt_id?: string;

  @ApiProperty()
  readonly description?: string;

  @ApiProperty()
  readonly icon?: string;

  @ApiProperty()
  readonly image?: string;

  @ApiProperty()
  readonly attributes?: object;

  @ApiProperty()
  readonly disabled?: boolean;

  @ApiProperty()
  readonly connected?: boolean;

  @ApiProperty()
  readonly created_at: Date;

  @ApiProperty()
  readonly updated_at?: Date;

  @ApiProperty()
  readonly last_update?: Date;

  @ApiProperty()
  readonly organization_id: string;

  constructor(partial: Partial<HomeDto>) {
    Object.assign(this, partial);
  }
}
