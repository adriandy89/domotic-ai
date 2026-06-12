import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PricingProviderDto } from './price-query.dto';

/**
 * Where the active token for a provider comes from:
 *  - `db`  — saved by an admin from Settings → Energy (wins over env).
 *  - `env` — ESIOS_API_TOKEN / ENTSOE_API_TOKEN fallback.
 */
export const ProviderTokenStatus = {
  not_configured: 'not_configured',
  configured: 'configured',
  rejected: 'rejected',
} as const;
export type ProviderTokenStatus =
  (typeof ProviderTokenStatus)[keyof typeof ProviderTokenStatus];

export class UpdateProviderCredentialsDto {
  @ApiPropertyOptional({
    description:
      'Provider API token. Empty/null clears the stored token (falls back to the env var).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  readonly token?: string | null;
}

export class PricingProviderAdminDto extends PricingProviderDto {
  @ApiProperty({ enum: Object.values(ProviderTokenStatus) })
  readonly token_status: ProviderTokenStatus;

  @ApiProperty({ enum: ['db', 'env'], nullable: true })
  readonly token_origin: 'db' | 'env' | null;

  @ApiProperty({
    nullable: true,
    description: 'Masked token, last 4 chars only (e.g. "••••42ab")',
  })
  readonly token_masked: string | null;

  @ApiProperty({
    nullable: true,
    description: 'ISO8601 timestamp of the last DB token save (db origin only)',
  })
  readonly token_updated_at: string | null;
}
