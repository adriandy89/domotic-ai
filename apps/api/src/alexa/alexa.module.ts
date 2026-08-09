import { DbModule } from '@app/db';
import { NatsClientModule } from '@app/nats-client';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AlexaAuthMiddleware } from './alexa-auth.middleware';
import { AlexaIntegrationController } from './alexa-integration.controller';
import { AlexaTokenService } from './alexa-token.service';
import { AlexaDirectiveController } from './directives/alexa-directive.controller';
import { AlexaDirectiveService } from './directives/alexa-directive.service';
import { AlexaOAuthClientService } from './oauth/alexa-oauth-client.service';
import { AlexaOAuthController } from './oauth/alexa-oauth.controller';
import { AlexaOAuthService } from './oauth/alexa-oauth.service';

@Module({
  imports: [DbModule, NatsClientModule],
  controllers: [
    AlexaOAuthController,
    AlexaDirectiveController,
    AlexaIntegrationController,
  ],
  providers: [
    AlexaOAuthClientService,
    AlexaOAuthService,
    AlexaTokenService,
    AlexaDirectiveService,
  ],
})
export class AlexaModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Bearer auth only on the directive endpoint; the OAuth endpoints use
    // session cookies (authorize) or client credentials (token).
    consumer
      .apply(AlexaAuthMiddleware)
      .forRoutes({ path: 'alexa/directives', method: RequestMethod.POST });
  }
}
