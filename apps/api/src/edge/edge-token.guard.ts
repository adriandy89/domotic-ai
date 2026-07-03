import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deriveEdgeToken } from '@app/edge-bundle';
import { timingSafeEqual } from 'node:crypto';

/**
 * Authenticates edge devices via the `X-Edge-Token` header. The expected value is
 * the home's DERIVED token (deriveEdgeToken(master, homeUniqueId)), so a token is
 * only valid for its own home. The home id comes from the route param
 * (`/edge/rules/:homeUniqueId`) or the body (`/edge/executions`).
 */
@Injectable()
export class EdgeTokenGuard implements CanActivate {
  private readonly masterSecret: string;

  constructor(private readonly config: ConfigService) {
    this.masterSecret = this.config.get<string>('EDGE_SIGNING_SECRET', '');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided: unknown = req.headers['x-edge-token'];
    const homeUniqueId: unknown =
      req.params?.homeUniqueId ?? req.body?.homeUniqueId;

    if (
      !this.masterSecret ||
      typeof provided !== 'string' ||
      typeof homeUniqueId !== 'string' ||
      !homeUniqueId
    ) {
      throw new UnauthorizedException('invalid edge token');
    }

    const expected = deriveEdgeToken(this.masterSecret, homeUniqueId);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('invalid edge token');
    }
    return true;
  }
}
