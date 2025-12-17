import { SessionUser } from "@app/models";

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
