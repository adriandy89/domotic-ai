import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { SessionUser } from './interfaces/session-user.interface';

@Injectable()
export class SessionSerializer extends PassportSerializer {
    constructor() {
        super();
    }

    // Save user ID, organization_id and role in session
    serializeUser(
        user: SessionUser,
        done: (err: Error | null,
            payload: SessionUser) => void) {
        done(null, user);
    }

    // Retrieve full user from database using ID stored in session and add role from session
    async deserializeUser(
        payload: SessionUser,
        done: (err: Error | null, user: SessionUser | null) => void,
    ) {
        try {
            done(null, payload);
        } catch (err) {
            done(err, null);
        }
    }
}
