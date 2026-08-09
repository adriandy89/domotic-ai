import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AuthorizeDecisionDto {
  @IsString()
  @MaxLength(128)
  client_id: string;

  @IsString()
  @MaxLength(2048)
  redirect_uri: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  scope?: string;

  @IsIn(['allow', 'deny'])
  decision: 'allow' | 'deny';

  @IsString()
  @MaxLength(64)
  nonce: string;
}
