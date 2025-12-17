import { SessionUser } from '@app/models';
import 'express-session';

declare module 'express-session' {
    interface SessionData {
        passport?: {
            user?: SessionUser;
        };
    }
}
