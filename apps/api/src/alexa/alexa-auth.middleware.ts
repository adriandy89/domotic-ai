import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import * as crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AlexaAuthContext, AlexaTokenService } from './alexa-token.service';

export type AlexaRequest = Request & { alexa?: AlexaAuthContext };

@Injectable()
export class AlexaAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AlexaAuthMiddleware.name);

  constructor(private readonly tokens: AlexaTokenService) {}

  async use(req: AlexaRequest, res: Response, next: NextFunction) {
    const raw = bearer(req) ?? scopeToken(req.body);
    const ctx = raw ? await this.tokens.authenticate(raw) : null;
    if (!ctx) {
      this.logger.warn(`alexa auth failed ip=${req.ip}`);
      // Alexa expects an ErrorResponse event, not a bare HTTP error.
      return res.status(401).json({
        event: {
          header: {
            namespace: 'Alexa',
            name: 'ErrorResponse',
            payloadVersion: '3',
            messageId: crypto.randomUUID(),
          },
          payload: {
            type: 'INVALID_AUTHORIZATION_CREDENTIAL',
            message: 'Invalid or expired access token',
          },
        },
      });
    }
    req.alexa = ctx;
    next();
  }
}

function bearer(req: Request): string | null {
  const h = req.header('authorization');
  if (!h?.toLowerCase().startsWith('bearer ')) return null;
  return h.slice(7).trim() || null;
}

/**
 * The Lambda proxy forwards the directive verbatim and sets the Authorization
 * header, but a directive carries its own token too — accept it as fallback
 * so the endpoint is testable with plain fixture JSON.
 */
function scopeToken(body: unknown): string | null {
  const directive = (body as any)?.directive;
  const token =
    directive?.endpoint?.scope?.token ??
    directive?.payload?.scope?.token ??
    directive?.payload?.grantee?.token;
  return typeof token === 'string' && token ? token : null;
}
