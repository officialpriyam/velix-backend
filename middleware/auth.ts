import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { dbService } from '../services/DatabaseService';

declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId: string;
                email: string;
                user?: any;
            };
        }
    }
}

export const sessionCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: Number(process.env.SESSION_COOKIE_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000),
    path: '/'
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.token;
        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const payload = await AuthService.verifyToken(token);
        if (!payload) {
            res.clearCookie('token', { path: '/' });
            return res.status(401).json({ error: 'Invalid session' });
        }

        const user = await dbService.getUserById(payload.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        req.auth = { ...payload, user };
        next();
    } catch (err: any) {
        console.error('[Auth] requireAuth error:', err);
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.token;
        if (!token) return next();

        const payload = await AuthService.verifyToken(token);
        if (payload) {
            const user = await dbService.getUserById(payload.userId);
            req.auth = { ...payload, user };
        }
    } catch (err: any) {
        console.warn('[Auth] optionalAuth error (continuing):', err?.message);
    }
    next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const configuredEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(Boolean);

    if (!req.auth) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (configuredEmails.length > 0) {
        const email = String(req.auth.user?.email || req.auth.email || '').toLowerCase();
        if (!configuredEmails.includes(email)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
    }

    next();
}
