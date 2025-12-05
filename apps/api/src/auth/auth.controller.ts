import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthenticatedGuard } from './guards/authenticated.guard';

@Controller('auth')
export class AuthController {
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
        req.login(req.user, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging in' });
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
        req.login(req.user, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging in' });
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
        req.login(req.user, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging in' });
            }
            res.redirect('/');
        });
    }

    // ==================== SESSION MANAGEMENT ====================

    @Get('logout')
    async logout(@Req() req: Request, @Res() res: Response) {
        req.logout((err) => {
            if (err) {
                return res.status(500).json({ message: 'Error logging out' });
            }
            req.session.destroy((err) => {
                if (err) {
                    return res.status(500).json({ message: 'Error destroying session' });
                }
                res.clearCookie('connect.sid'); // Default session cookie name
                res.redirect('/');
            });
        });
    }

    @Get('me')
    @UseGuards(AuthenticatedGuard)
    async getCurrentUser(@Req() req: Request) {
        // Return current user from session
        return {
            user: req.user,
            isAuthenticated: req.isAuthenticated(),
        };
    }

    @Get('status')
    async getAuthStatus(@Req() req: Request) {
        return {
            isAuthenticated: req.isAuthenticated(),
            user: req.user || null,
        };
    }
}
