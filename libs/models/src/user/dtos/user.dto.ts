import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'generated/prisma/enums';

export class UserDto {
  @ApiProperty()
  readonly id: string;

  @ApiProperty()
  readonly is_org_admin: boolean;

  @ApiProperty()
  readonly email: string;

  @ApiProperty()
  readonly phone?: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly role: Role;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty()
  readonly organization_id: string;

  @ApiProperty()
  readonly created_at: Date;

  @ApiProperty()
  readonly updated_at?: Date;

  @ApiProperty()
  readonly attributes?: any;

  @ApiProperty()
  readonly expiration_time?: Date;

  @ApiProperty()
  readonly notification_batch_minutes?: number;

  @ApiProperty()
  readonly fmc_tokens?: string[];

  @ApiProperty()
  readonly telegram_chat_id?: string;

  constructor(partial: Partial<UserDto>) {
    Object.assign(this, partial);
  }
}
