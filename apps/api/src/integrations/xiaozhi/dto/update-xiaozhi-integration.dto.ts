import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { XIAOZHI_ENDPOINT_REGEX } from './create-xiaozhi-integration.dto';

export class UpdateXiaozhiIntegrationDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  readonly name?: string;

  @IsOptional()
  @IsString()
  @Matches(XIAOZHI_ENDPOINT_REGEX, {
    message: 'endpoint must look like wss://api.xiaozhi.me/mcp/?token=...',
  })
  readonly endpoint?: string;

  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;
}
