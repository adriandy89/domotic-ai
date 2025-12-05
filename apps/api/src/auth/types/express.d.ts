import { SessionUser } from '../interfaces/session-user.interface';

declare global {
    namespace Express {
        interface User extends SessionUser { }

        interface Request {
            user?: SessionUser;
            logout(done: (err: any) => void): void;
            isAuthenticated(): boolean;
        }
    }
}

export { };
