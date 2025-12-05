import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import { OAuthAccount } from 'generated/prisma/client';
import { OAuthUserDto } from './dto/oauth-user.dto';
import { SELECT_USER_SESSION } from './auth.service';
import { SessionUser } from './interfaces/session-user.interface';

@Injectable()
export class OAuthAccountsService {
    constructor(private prisma: DbService) { }

    async findByProvider(
        provider: string,
        providerId: string,
    ): Promise<(OAuthAccount & { user: SessionUser }) | null> {
        return this.prisma.oAuthAccount.findUnique({
            where: {
                provider_provider_id: {
                    provider,
                    provider_id: providerId,
                },
            },
            include: {
                user: {
                    select: SELECT_USER_SESSION,
                },
            },
        });
    }

    async findByUserId(userId: string): Promise<OAuthAccount[]> {
        return this.prisma.oAuthAccount.findMany({
            where: { user_id: userId },
        });
    }

    async create(
        provider: string,
        oauthUser: OAuthUserDto,
        user: SessionUser,
    ): Promise<OAuthAccount> {
        return this.prisma.oAuthAccount.create({
            data: {
                provider,
                provider_id: oauthUser.providerId,
                user_id: user.id,
            },
        });
    }

    async unlinkAccount(userId: string, provider: string): Promise<void> {
        await this.prisma.oAuthAccount.deleteMany({
            where: {
                user_id: userId,
                provider,
            },
        });
    }
}
