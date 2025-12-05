import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { User } from 'generated/prisma/client';
import { AuthService } from './auth.service';
import { SessionUser } from './interfaces/session-user.interface';

@Injectable()
export class SessionSerializer extends PassportSerializer {
    constructor(private readonly authService: AuthService) {
        super();
    }

    // Save user ID and organization_id in session
    serializeUser(user: User | SessionUser, done: (err: Error | null, payload: { id: string; organization_id: string }) => void) {
        done(null, { id: user.id, organization_id: user.organization_id });
    }

    // Retrieve full user from database using ID stored in session
    async deserializeUser(
        payload: { id: string; organization_id: string },
        done: (err: Error | null, user: SessionUser | null) => void,
    ) {
        try {
            const user = await this.authService.findUserById(payload.id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    }
}
