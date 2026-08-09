import { DbService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TOKEN_TTL_S = 3600;

export interface TokenPair {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  refresh_token: string;
}

/** RFC 6749-style failure; the controller maps it to an OAuth error body. */
export class OAuthGrantError extends Error {
  constructor(
    public readonly error:
      | 'invalid_request'
      | 'invalid_client'
      | 'invalid_grant'
      | 'unsupported_grant_type',
    public readonly description?: string,
  ) {
    super(description ?? error);
  }
}

@Injectable()
export class AlexaOAuthService {
  private readonly logger = new Logger(AlexaOAuthService.name);

  constructor(private readonly db: DbService) {}

  /** Issues a single-use authorization code; returns the raw code once. */
  async issueAuthCode(input: {
    userId: string;
    clientId: string;
    redirectUri: string;
    scope?: string;
  }): Promise<string> {
    const raw = 'alexacode_' + crypto.randomBytes(32).toString('base64url');
    await this.db.alexaAuthCode.create({
      data: {
        code_hash: sha256(raw),
        client_id: input.clientId,
        user_id: input.userId,
        redirect_uri: input.redirectUri,
        scope: input.scope ?? null,
        expires_at: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    this.logger.log(
      `alexa auth code issued user=${input.userId} client=${input.clientId}`,
    );
    return raw;
  }

  async exchangeAuthCode(input: {
    clientId: string;
    code: string;
    redirectUri: string;
  }): Promise<TokenPair> {
    const row = await this.db.alexaAuthCode.findUnique({
      where: { code_hash: sha256(input.code ?? '') },
    });
    if (!row || row.client_id !== input.clientId) {
      throw new OAuthGrantError('invalid_grant', 'Unknown authorization code');
    }
    if (row.redirect_uri !== input.redirectUri) {
      throw new OAuthGrantError('invalid_grant', 'redirect_uri mismatch');
    }
    if (row.expires_at.getTime() < Date.now()) {
      throw new OAuthGrantError('invalid_grant', 'Authorization code expired');
    }
    // Atomic single-use guard: only the first exchange flips consumed_at.
    const consumed = await this.db.alexaAuthCode.updateMany({
      where: { code_hash: row.code_hash, consumed_at: null },
      data: { consumed_at: new Date() },
    });
    if (consumed.count === 0) {
      // Replayed code: revoke everything issued from it (RFC 6749 §4.1.2).
      await this.revokeAllForUserClient(row.user_id, row.client_id);
      throw new OAuthGrantError(
        'invalid_grant',
        'Authorization code already used',
      );
    }
    return this.issueTokenPair(row.user_id, row.client_id, row.scope);
  }

  /** Rotates the refresh token and issues a fresh access token. */
  async refresh(input: {
    clientId: string;
    refreshToken: string;
  }): Promise<TokenPair> {
    const row = await this.db.alexaRefreshToken.findUnique({
      where: { token_hash: sha256(input.refreshToken ?? '') },
    });
    if (!row || row.client_id !== input.clientId || row.revoked_at) {
      throw new OAuthGrantError('invalid_grant', 'Invalid refresh token');
    }
    await this.db.alexaRefreshToken.update({
      where: { token_hash: row.token_hash },
      data: { revoked_at: new Date(), last_used_at: new Date() },
    });
    return this.issueTokenPair(row.user_id, row.client_id, row.scope);
  }

  /** "Linked" = the user holds at least one live refresh token. */
  async linkStatus(userId: string) {
    const latest = await this.db.alexaRefreshToken.findFirst({
      where: { user_id: userId, revoked_at: null },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });
    return { linked: !!latest, last_linked_at: latest?.created_at ?? null };
  }

  /** Unlink: drop every credential the user holds. */
  async revokeAllForUser(userId: string) {
    await this.db.$transaction([
      this.db.alexaRefreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
      this.db.alexaAccessToken.deleteMany({ where: { user_id: userId } }),
      this.db.alexaAuthCode.deleteMany({ where: { user_id: userId } }),
    ]);
    this.logger.log(`alexa tokens revoked user=${userId}`);
  }

  private async revokeAllForUserClient(userId: string, clientId: string) {
    await this.db.$transaction([
      this.db.alexaRefreshToken.updateMany({
        where: { user_id: userId, client_id: clientId, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
      this.db.alexaAccessToken.deleteMany({
        where: { user_id: userId, client_id: clientId },
      }),
    ]);
  }

  private async issueTokenPair(
    userId: string,
    clientId: string,
    scope: string | null,
  ): Promise<TokenPair> {
    const access = 'alexaat_' + crypto.randomBytes(32).toString('base64url');
    const refresh = 'alexart_' + crypto.randomBytes(32).toString('base64url');
    await this.db.$transaction([
      this.db.alexaAccessToken.create({
        data: {
          token_hash: sha256(access),
          client_id: clientId,
          user_id: userId,
          scope,
          expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000),
        },
      }),
      this.db.alexaRefreshToken.create({
        data: {
          token_hash: sha256(refresh),
          client_id: clientId,
          user_id: userId,
          scope,
        },
      }),
      // Opportunistic cleanup so expired rows don't pile up.
      this.db.alexaAccessToken.deleteMany({
        where: { user_id: userId, expires_at: { lt: new Date() } },
      }),
      this.db.alexaAuthCode.deleteMany({
        where: { user_id: userId, expires_at: { lt: new Date() } },
      }),
    ]);
    return {
      access_token: access,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      refresh_token: refresh,
    };
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
