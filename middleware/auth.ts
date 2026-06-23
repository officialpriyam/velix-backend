import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { dbService } from '../services/DatabaseService';
import { cacheService } from '../services/CacheService';

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
            console.warn('[Auth] requireAuth: No token in cookies. Cookies:', JSON.stringify(req.cookies));
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // 1. Check Redis cache for auth payload
        const cachedAuth = await cacheService.getCachedAuth(token);
        let userId: string;
        let email: string;

        if (cachedAuth) {
            userId = cachedAuth.userId;
            email = cachedAuth.email;
            console.log(`[Auth] requireAuth: Cache hit for user ${userId}`);
        } else {
            const payload = await AuthService.verifyToken(token);
            if (!payload) {
                console.warn('[Auth] requireAuth: Token verification failed');
                res.clearCookie('token', { path: '/' });
                return res.status(401).json({ error: 'Invalid session' });
            }
            userId = payload.userId;
            email = payload.email;
            // Cache auth payload for next request
            await cacheService.setCachedAuth(token, { userId, email });
            console.log(`[Auth] requireAuth: Verified user ${userId} via Supabase`);
        }

        // 2. Check Redis cache for user data
        const cachedUser = await cacheService.getCachedUser(userId);
        let user: any;

        if (cachedUser) {
            user = cachedUser;
        } else {
            user = await dbService.getUserById(userId);
            if (!user) {
                console.warn(`[Auth] requireAuth: User ${userId} not found in DB`);
                return res.status(404).json({ error: 'User not found' });
            }
            // Cache user data for next request
            await cacheService.setCachedUser(userId, user);
        }

        req.auth = { userId, email, user };
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

        const cachedAuth = await cacheService.getCachedAuth(token);
        if (cachedAuth) {
            const cachedUser = await cacheService.getCachedUser(cachedAuth.userId);
            if (cachedUser) {
                req.auth = { ...cachedAuth, user: cachedUser };
            } else {
                const user = await dbService.getUserById(cachedAuth.userId);
                if (user) {
                    await cacheService.setCachedUser(cachedAuth.userId, user);
                    req.auth = { ...cachedAuth, user };
                }
            }
        } else {
            const payload = await AuthService.verifyToken(token);
            if (payload) {
                await cacheService.setCachedAuth(token, payload);
                const user = await dbService.getUserById(payload.userId);
                if (user) {
                    await cacheService.setCachedUser(payload.userId, user);
                    req.auth = { ...payload, user };
                }
            }
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
