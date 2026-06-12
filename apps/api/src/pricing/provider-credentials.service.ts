import { aesGcmDecrypt, aesGcmEncrypt, loadEncryptionKey } from '@app/crypto';
import { DbService } from '@app/db';
// Deep import keeps jest specs off the @app/models barrel (it pulls in the
// ESM-only generated Prisma client through the device DTOs).
import { ProviderTokenStatus } from '@app/models/pricing/dtos/provider-admin.dto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Env var fallback per provider source when no DB token is saved. */
const ENV_VAR_BY_SOURCE: Record<string, string> = {
  esios_pvpc: 'ESIOS_API_TOKEN',
  entsoe: 'ENTSOE_API_TOKEN',
};

export interface ProviderTokenInfo {
  status: ProviderTokenStatus;
  origin: 'db' | 'env' | null;
  masked: string | null;
  updatedAt: string | null;
}

/**
 * Resolves market price provider API tokens: DB rows (saved by an ADMIN from
 * Settings → Energy, AES-256-GCM encrypted) win over env vars. Rows are
 * decrypted once into an in-memory snapshot so providers can keep their
 * synchronous `enabled` getters; saves update the snapshot in place.
 *
 * Also tracks per-provider auth rejection (401/403 from the platform), which
 * previously lived inside EsiosPvpcProvider and required a restart to clear —
 * saving a new token now re-enables the provider immediately.
 */
@Injectable()
export class ProviderCredentialsService implements OnModuleInit {
  private readonly logger = new Logger(ProviderCredentialsService.name);
  private readonly key: Buffer;
  private readonly dbTokens = new Map<
    string,
    { token: string; updatedAt: Date | null }
  >();
  private readonly authRejected = new Set<string>();

  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {
    this.key = loadEncryptionKey();
  }

  async onModuleInit(): Promise<void> {
    const rows = await this.db.pricingProviderCredential.findMany();
    for (const row of rows) {
      try {
        this.dbTokens.set(row.source, {
          token: aesGcmDecrypt(row.token_encrypted, this.key),
          updatedAt: row.updated_at ?? row.created_at,
        });
      } catch (error) {
        this.logger.error(
          `Failed to decrypt stored token for "${row.source}" — ignoring it (was INTEGRATIONS_ENCRYPTION_KEY rotated?): ${(error as Error).message}`,
        );
      }
    }
    if (rows.length) {
      this.logger.log(`Loaded ${this.dbTokens.size} provider credential(s)`);
    }
  }

  /** Active token for a source: DB first, env var fallback. */
  getToken(source: string): string | null {
    const db = this.dbTokens.get(source);
    if (db) return db.token;
    const envVar = ENV_VAR_BY_SOURCE[source];
    const env = envVar ? this.config.get<string>(envVar, '') : '';
    return env || null;
  }

  /** Save (token) or clear (null/empty) the DB token for a source. */
  async setToken(source: string, token: string | null): Promise<void> {
    const trimmed = token?.trim() || null;
    if (trimmed) {
      const token_encrypted = aesGcmEncrypt(trimmed, this.key);
      const row = await this.db.pricingProviderCredential.upsert({
        where: { source },
        create: { source, token_encrypted },
        update: { token_encrypted },
      });
      this.dbTokens.set(source, {
        token: trimmed,
        updatedAt: row.updated_at ?? row.created_at,
      });
    } else {
      await this.db.pricingProviderCredential.deleteMany({
        where: { source },
      });
      this.dbTokens.delete(source);
    }
    // A fresh token gets a fresh chance regardless of past 401/403s.
    this.clearAuthRejected(source);
    this.logger.log(
      `Provider credentials ${trimmed ? 'updated' : 'cleared'} for "${source}"`,
    );
  }

  reportAuthRejected(source: string): void {
    this.authRejected.add(source);
  }

  clearAuthRejected(source: string): void {
    this.authRejected.delete(source);
  }

  isAuthRejected(source: string): boolean {
    return this.authRejected.has(source);
  }

  tokenInfo(source: string): ProviderTokenInfo {
    const db = this.dbTokens.get(source);
    const token = this.getToken(source);
    if (!token) {
      return {
        status: ProviderTokenStatus.not_configured,
        origin: null,
        masked: null,
        updatedAt: null,
      };
    }
    return {
      status: this.isAuthRejected(source)
        ? ProviderTokenStatus.rejected
        : ProviderTokenStatus.configured,
      origin: db ? 'db' : 'env',
      masked: maskToken(token),
      updatedAt: db?.updatedAt ? db.updatedAt.toISOString() : null,
    };
  }
}

export function maskToken(token: string): string {
  return token.length <= 4 ? '••••' : `••••${token.slice(-4)}`;
}
