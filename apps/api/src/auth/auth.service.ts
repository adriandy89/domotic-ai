import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import { User } from 'generated/prisma/client';
import { OAuthUserDto } from './dto/oauth-user.dto';
import { OAuthAccountsService } from './oauth-accounts.service';
import { SessionUser } from './interfaces/session-user.interface';
import { UserSelect } from 'generated/prisma/models';

export const SELECT_USER_SESSION = {
    id: true,
    email: true,
    name: true,
    is_org_admin: true,
    organization_id: true,
    is_active: true,
    role: true,
    phone: true,
    attributes: true,
    telegram_chat_id: true,
    channels: true,
    notification_batch_minutes: true,
    created_at: true,
    updated_at: true,
} as const;

@Injectable()
export class AuthService {
    constructor(
        private prisma: DbService,
        private oauthAccountsService: OAuthAccountsService,
    ) { }

    /**
     * Validates and provisions OAuth users
     * Creates organization and user if first-time OAuth login
     * Links OAuth account to existing user if email matches
     */
    async validateOAuthUser(oauthUser: OAuthUserDto): Promise<SessionUser> {
        // 1. Check if OAuth account already exists
        const oauthAccount = await this.oauthAccountsService.findByProvider(
            oauthUser.provider,
            oauthUser.providerId,
        );

        if (oauthAccount) {
            // Existing OAuth user - return the linked user
            return oauthAccount.user;
        }

        // 2. Check if user with same email exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: oauthUser.email },
        });

        if (existingUser) {
            // Link OAuth account to existing user
            await this.oauthAccountsService.create(
                oauthUser.provider,
                oauthUser,
                existingUser,
            );
            return existingUser;
        }

        // 3. New user - create organization and user
        const organization = await this.prisma.organization.create({
            data: {
                name: `Organization of ${oauthUser.email}`,
                is_active: true,
            },
        });

        const newUser = await this.prisma.user.create({
            data: {
                email: oauthUser.email,
                name: `${oauthUser.firstName} ${oauthUser.lastName}`.trim(),
                is_org_admin: true, // OAuth users are org admins
                organization_id: organization.id,
                is_active: true,
                password: null, // No password for OAuth users
                role: 'ADMIN', // Set as admin role
            },
            select: SELECT_USER_SESSION,
        });

        // Create OAuth account link
        await this.oauthAccountsService.create(
            oauthUser.provider,
            oauthUser,
            newUser,
        );

        return newUser;
    }

    async findUserById(id: string): Promise<SessionUser | null> {
        return this.prisma.user.findUnique({
            where: { id },
            select: SELECT_USER_SESSION,
        });
    }
}
