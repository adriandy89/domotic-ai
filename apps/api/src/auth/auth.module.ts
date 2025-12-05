import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthAccountsService } from './oauth-accounts.service';
import { SessionSerializer } from './session.serializer';
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';
import { GitHubStrategy } from './strategies/github.strategy';
import { DbModule } from '@app/db';

@Module({
    imports: [
        PassportModule.register({ session: true }), // Enable session support
        ConfigModule,
        DbModule,
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        OAuthAccountsService,
        SessionSerializer,
        GoogleStrategy,
        MicrosoftStrategy,
        GitHubStrategy,
    ],
    exports: [AuthService, OAuthAccountsService],
})
export class AuthModule { }
