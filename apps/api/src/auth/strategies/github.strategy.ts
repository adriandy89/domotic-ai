import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { SessionUser } from '../interfaces/session-user.interface';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
    constructor(
        private configService: ConfigService,
        private authService: AuthService,
    ) {
        super({
            clientID: configService.get<string>('GITHUB_CLIENT_ID')!,
            clientSecret: configService.get<string>('GITHUB_CLIENT_SECRET')!,
            callbackURL: configService.get<string>('GITHUB_CALLBACK_URL')!,
            scope: ['user:email'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (error: any, user?: any) => void,
    ): Promise<any> {
        const { id, emails, displayName, name, photos } = profile;

        try {
            // GitHub might not provide email if not public
            const email = emails?.[0]?.value || `${profile.username}@github.local`;

            const user: SessionUser = await this.authService.validateOAuthUser({
                provider: 'github',
                providerId: id,
                email: email,
                firstName: name?.givenName || displayName || profile.username || '',
                lastName: name?.familyName || '',
                picture: photos?.[0]?.value,
            });

            done(null, user);
        } catch (error) {
            done(error, null);
        }
    }
}
