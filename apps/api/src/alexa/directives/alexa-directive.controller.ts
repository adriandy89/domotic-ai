import { Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AlexaRequest } from '../alexa-auth.middleware';
import type { AlexaDirective } from '../mapping/alexa.types';
import { AlexaDirectiveService } from './alexa-directive.service';

/**
 * Receives Smart Home directives forwarded verbatim by the Lambda proxy.
 * Auth (bearer → req.alexa) happens in AlexaAuthMiddleware. The body is read
 * raw from the request — no DTO — so the global whitelist ValidationPipe
 * can't strip Alexa's envelope fields.
 */
@ApiTags('Alexa')
@Controller('alexa')
export class AlexaDirectiveController {
  constructor(private readonly directives: AlexaDirectiveService) {}

  @Post('directives')
  handle(@Req() req: AlexaRequest) {
    // Fail closed if the auth middleware was not applied for any reason.
    if (!req.alexa) {
      throw new UnauthorizedException('Alexa bearer authentication required');
    }
    return this.directives.handle(req.body as AlexaDirective, req.alexa);
  }
}
