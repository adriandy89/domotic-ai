import { DbService } from '@app/db';
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Role } from 'generated/prisma/enums';

export interface AlexaAuthContext {
  userId: string;
  organizationId: string;
  role: Role;
}

@Injectable()
export class AlexaTokenService {
  constructor(private readonly db: DbService) {}

  /** Resolves an Alexa access token (bearer) to its user context. */
  async authenticate(raw: string): Promise<AlexaAuthContext | null> {
    if (!raw || !raw.startsWith('alexaat_')) return null;
    const token_hash = crypto.createHash('sha256').update(raw).digest('hex');
    const row = await this.db.alexaAccessToken.findUnique({
      where: { token_hash },
      select: {
        expires_at: true,
        client_id: true,
        user: {
          select: {
            id: true,
            role: true,
            organization_id: true,
            is_active: true,
          },
        },
      },
    });
    if (!row || row.expires_at.getTime() < Date.now() || !row.user.is_active) {
      return null;
    }
    // Disabling (or deleting) the org's client must cut access immediately,
    // not when the 1h access token expires; and a token may only act inside
    // the client's own organization.
    const client = await this.db.alexaOAuthClient.findUnique({
      where: { client_id: row.client_id },
      select: { disabled: true, organization_id: true },
    });
    if (
      !client ||
      client.disabled ||
      client.organization_id !== row.user.organization_id
    ) {
      return null;
    }
    return {
      userId: row.user.id,
      organizationId: row.user.organization_id,
      role: row.user.role,
    };
  }
}
