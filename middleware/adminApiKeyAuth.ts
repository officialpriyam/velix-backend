import { Request, Response, NextFunction } from 'express';

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction) {
    // Allow admin session cookie
    if (req.cookies?.admin_session === 'true') {
        return next();
    }

    const expectedKey = process.env.ADMIN_API_KEY;

    if (!expectedKey) {
        return next();
    }

    const headerKey = req.headers['x-admin-api-key'];
    const bearer = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '';
    const providedKey = (typeof headerKey === 'string' ? headerKey : '') || bearer;

    if (providedKey !== expectedKey) {
        return res.status(401).json({ error: 'Invalid or missing admin API key' });
    }

    next();
}
