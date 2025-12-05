import 'express-session';
import { SessionUser } from '../interfaces/session-user.interface';

declare module 'express-session' {
    interface SessionData {
        passport?: {
            user?: SessionUser;
        };
    }
}
