import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { User } from 'generated/prisma/client';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
    constructor(
        private configService: ConfigService,
        private authService: AuthService,
    ) {
        super({
            clientID: configService.get<string>('MICROSOFT_CLIENT_ID')!,
            clientSecret: configService.get<string>('MICROSOFT_CLIENT_SECRET')!,
            callbackURL: configService.get<string>('MICROSOFT_CALLBACK_URL')!,
            scope: ['user.read'],
            tenant: configService.get<string>('MICROSOFT_TENANT_ID') || 'common',
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (error: any, user?: any) => void,
    ): Promise<any> {
        const { id, emails, displayName, name } = profile;

        try {
            const user: User = await this.authService.validateOAuthUser({
                provider: 'microsoft',
                providerId: id,
                email: emails?.[0]?.value || profile.userPrincipalName,
                firstName: name?.givenName || displayName || '',
                lastName: name?.familyName || '',
                picture: profile.photos?.[0]?.value,
            });

            done(null, user);
        } catch (error) {
            done(error, null);
        }
    }
}
