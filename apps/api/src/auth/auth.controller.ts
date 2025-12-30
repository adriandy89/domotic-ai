import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthenticatedGuard, PermissionsGuard } from './guards';
import { GetUserInfo, Permissions } from './decorators';
import { Role } from 'generated/prisma/enums';
import type { SessionUser } from '@app/models';
import { UserService } from '../user/user.service';

@Controller('auth')
export class AuthController {
    constructor(private readonly userService: UserService) { }

    // ==================== GOOGLE OAUTH ====================

    @Get('google')
    @UseGuards(AuthGuard('google'))
    async googleAuth() {
        // Passport automatically redirects to Google
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
        // Explicitly login user to save in session
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication failed' });
        }
        req.login(req.user, async (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging in' });
            }
            if (req.user) {
                await this.userService.saveUserSession((req.user as any).id, req.sessionID);
            }
            // Redirect to frontend dashboard or home
            res.redirect('/'); // Change this to your frontend URL
        });
    }

    // ==================== MICROSOFT OAUTH ====================

    @Get('microsoft')
    @UseGuards(AuthGuard('microsoft'))
    async microsoftAuth() {
        // Passport automatically redirects to Microsoft
    }

    @Get('microsoft/callback')
    @UseGuards(AuthGuard('microsoft'))
    async microsoftAuthCallback(@Req() req: Request, @Res() res: Response) {
        // Explicitly login user to save in session
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication failed' });
        }
        req.login(req.user, async (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging in' });
            }
            if (req.user) {
                await this.userService.saveUserSession((req.user as any).id, req.sessionID);
            }
            res.redirect('/');
        });
    }

    // ==================== GITHUB OAUTH ====================

    @Get('github')
    @UseGuards(AuthGuard('github'))
    async githubAuth() {
        // Passport automatically redirects to GitHub
    }

    @Get('github/callback')
    @UseGuards(AuthGuard('github'))
    async githubAuthCallback(@Req() req: Request, @Res() res: Response) {
        // Explicitly login user to save in session
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication failed' });
        }
        req.login(req.user, async (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging in' });
            }
            if (req.user) {
                await this.userService.saveUserSession((req.user as any).id, req.sessionID);
            }
            res.redirect('/');
        });
    }

    // ==================== SESSION MANAGEMENT ====================

    @Get('logout')
    async logout(@Req() req: Request, @Res() res: Response) {
        if (req.user && (req.user as any).id) {
            await this.userService.removeUserSession((req.user as any).id, req.sessionID);
        }
        req.logout((err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging out' });
            }
            req.session.destroy((err) => {
                if (err) {
                    return res.status(500).json({ message: 'Error destroying session' });
                }
                res.clearCookie('domotic.sh'); // session cookie name from main.ts
                res.redirect('/');
            });
        });
    }

    @Get('me')
    @UseGuards(AuthenticatedGuard)
    async getCurrentUser(@GetUserInfo() user: SessionUser) {
        // Return current user from session
        return {
            user
        };
    }

    @Get('test-permissions')
    @Permissions([Role.ADMIN])
    @UseGuards(AuthenticatedGuard, PermissionsGuard)
    async testPermissions(@GetUserInfo() user: SessionUser) {
        return {
            user
        };
    }
}
