import { ApiProperty } from '@nestjs/swagger';
import { ICreateCondition, ICreateResult } from '../interfaces';
import { RuleType } from 'generated/prisma/enums';

export class RuleDto {
  @ApiProperty()
  readonly id: string;

  @ApiProperty()
  readonly type: RuleType;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly description: string;

  @ApiProperty()
  readonly active: boolean;

  @ApiProperty()
  readonly all: boolean;

  @ApiProperty()
  readonly interval: number;

  @ApiProperty()
  readonly timestamp: Date;

  @ApiProperty()
  readonly created_at: Date;

  @ApiProperty()
  readonly updated_at: Date;

  @ApiProperty()
  readonly conditions: ICreateCondition[];

  @ApiProperty()
  readonly results: ICreateResult[];

  @ApiProperty()
  readonly user_id: string;

  @ApiProperty()
  readonly home_id: string;

  @ApiProperty()
  resend_after: number;

  constructor(partial: Partial<RuleDto>) {
    Object.assign(this, partial);
  }
}
