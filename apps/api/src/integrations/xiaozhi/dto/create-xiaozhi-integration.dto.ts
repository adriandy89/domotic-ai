import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export const XIAOZHI_ENDPOINT_REGEX =
  /^wss:\/\/api\.xiaozhi\.me\/mcp\/\?token=[A-Za-z0-9._\-]+$/;

export class CreateXiaozhiIntegrationDto {
  @IsString()
  @Length(1, 80)
  readonly name!: string;

  @IsString()
  @Matches(XIAOZHI_ENDPOINT_REGEX, {
    message: 'endpoint must look like wss://api.xiaozhi.me/mcp/?token=...',
  })
  readonly endpoint!: string;

  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;
}
