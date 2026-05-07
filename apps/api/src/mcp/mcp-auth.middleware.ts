import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { McpTokenService } from './mcp-token.service';

@Injectable()
export class McpAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(McpAuthMiddleware.name);

  constructor(private readonly tokens: McpTokenService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const raw = bearer(req) ?? queryToken(req);
    if (!raw) return jsonRpcError(res, 401, -32001, 'Missing token');

    const result = await this.tokens.authenticate(raw);
    if (!result) {
      this.logger.warn(`mcp auth failed ip=${req.ip}`);
      return jsonRpcError(res, 401, -32001, 'Invalid or revoked token');
    }

    // Mastra's MCPServer reads `req.auth` and exposes it to tools as
    // `context.mcp.extra.authInfo`. Custom fields go under `.extra`.
    (req as Request & { auth?: unknown }).auth = {
      token: raw,
      extra: {
        userId: result.user.id,
        organizationId: result.user.organization_id,
        userRole: result.user.role,
        timeZone: req.header('x-timezone') ?? undefined,
        tokenId: result.token.id,
      },
    };

    void this.tokens
      .touchLastUsed(result.token.id)
      .catch(() => undefined);

    next();
  }
}

function bearer(req: Request): string | null {
  const h = req.header('authorization');
  if (!h?.toLowerCase().startsWith('bearer ')) return null;
  return h.slice(7).trim() || null;
}

function queryToken(req: Request): string | null {
  const q = req.query?.token;
  return typeof q === 'string' ? q : null;
}

function jsonRpcError(
  res: Response,
  http: number,
  code: number,
  message: string,
) {
  res.status(http).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}
