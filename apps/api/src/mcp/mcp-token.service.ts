import { DbService } from '@app/db';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Role } from 'generated/prisma/enums';

export interface AuthenticatedToken {
  token: { id: string };
  user: { id: string; role: Role; organization_id: string };
}

@Injectable()
export class McpTokenService {
  private readonly logger = new Logger(McpTokenService.name);
  private readonly lastTouch = new Map<string, number>();
  private readonly TOUCH_THROTTLE_MS = 60_000;

  constructor(private readonly db: DbService) {}

  listForUser(userId: string) {
    return this.db.mcpToken.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        token_prefix: true,
        last_used_at: true,
        revoked_at: true,
        created_at: true,
      },
    });
  }

  async create(userId: string, name: string) {
    const raw = 'mcp_' + crypto.randomBytes(32).toString('base64url');
    const token_hash = crypto.createHash('sha256').update(raw).digest('hex');
    const token_prefix = raw.slice(0, 12);
    const record = await this.db.mcpToken.create({
      data: { user_id: userId, name, token_hash, token_prefix },
      select: {
        id: true,
        name: true,
        token_prefix: true,
        last_used_at: true,
        revoked_at: true,
        created_at: true,
      },
    });
    this.logger.log(
      `mcp_token created id=${record.id} user=${userId} name="${name}"`,
    );
    return { token: raw, record };
  }

  async revoke(userId: string, id: string) {
    const updated = await this.db.mcpToken.updateMany({
      where: { id, user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Token not found');
    }
    this.logger.log(`mcp_token revoked id=${id} user=${userId}`);
  }

  async authenticate(raw: string): Promise<AuthenticatedToken | null> {
    if (!raw || !raw.startsWith('mcp_')) return null;
    const token_hash = crypto.createHash('sha256').update(raw).digest('hex');
    const row = await this.db.mcpToken.findUnique({
      where: { token_hash },
      select: {
        id: true,
        revoked_at: true,
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
    if (!row || row.revoked_at || !row.user.is_active) return null;
    return {
      token: { id: row.id },
      user: {
        id: row.user.id,
        role: row.user.role,
        organization_id: row.user.organization_id,
      },
    };
  }

  async touchLastUsed(tokenId: string) {
    const now = Date.now();
    const last = this.lastTouch.get(tokenId);
    if (last && now - last < this.TOUCH_THROTTLE_MS) return;
    this.lastTouch.set(tokenId, now);
    try {
      await this.db.mcpToken.update({
        where: { id: tokenId },
        data: { last_used_at: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `failed to touch last_used_at for token=${tokenId}: ${(err as Error).message}`,
      );
    }
  }
}
