import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Captures a validated `?next=` on the social-login entry routes so the OAuth
 * callback can send the user back where they started (e.g. the Alexa
 * account-linking /authorize page) instead of the hardcoded dashboard.
 */
@Injectable()
export class CaptureReturnToMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const target = safeReturnTo(req.query?.next);
    if (target && req.session) req.session.returnTo = target;
    next();
  }
}

/** Only same-origin relative paths — rejects absolute URLs and `//host`. */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.includes('\\')) return null;
  return value;
}
