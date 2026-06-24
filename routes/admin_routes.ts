import { Router } from 'express';
import { dbService } from '../services/DatabaseService';
import { requireAdminApiKey } from '../middleware/adminApiKeyAuth';
import { AuthService } from '../services/AuthService';
import { asyncHandler } from '../middleware/asyncHandler';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import config from '../utils/config';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    // Supabase login — check DB role
    try {
        const { user } = await AuthService.login(email, password);
        const fullUser = await dbService.getUserById(user.id);
        const role = typeof (fullUser as any)?.role === 'string' ? (fullUser as any).role.toLowerCase() : '';

        if (fullUser && (role === 'admin' || role === 'superadmin')) {
            res.cookie('admin_session', 'true', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000
            });
            return res.json({ success: true, admin: true });
        }

        return res.status(403).json({ error: 'Insufficient permissions — admin role required' });
    } catch (err) {
        console.error('Admin login error:', err);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
}));

router.post('/logout', asyncHandler(async (req, res) => {
    res.clearCookie('admin_session');
    res.json({ success: true });
}));

router.get('/check', asyncHandler(async (req, res) => {
    const adminSession = req.cookies?.admin_session;
    if (adminSession === 'true') {
        return res.json({ authenticated: true });
    }
    res.status(401).json({ authenticated: false });
}));

router.use((req, res, next) => {
    const whitelistEnv = process.env.ADMIN_IP_WHITELIST;
    if (!whitelistEnv) {
        return next();
    }
    const whitelist = whitelistEnv.split(',').map((ip) => ip.trim());
    const requestIp = (req.ip || '').replace(/^::ffff:/, '');
    if (whitelist.includes(requestIp)) {
        return next();
    }
    return res.status(403).json({ error: 'IP not allowed' });
});

router.use(requireAdminApiKey);

router.get('/users', asyncHandler(async (req, res) => {
    try {
        const users = await dbService.getAllUsers();
        res.json({ users });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        await dbService.deleteUser(id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/users/:id/details', asyncHandler(async (req, res) => {
    try {
        const details = await dbService.getUserAdminDetails(req.params.id);
        if (!details) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(details);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/users/:id/credits', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const delta = Number(req.body?.delta ?? req.body?.amount ?? 0);
        const description = typeof req.body?.description === 'string' ? req.body.description : 'Admin adjustment';

        if (!Number.isFinite(delta)) {
            return res.status(400).json({ error: 'A numeric delta is required' });
        }

        const credits = await dbService.adjustUserCredits(id, delta, description);
        res.json({ success: true, credits });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/users/:id/ban', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const banned = Boolean(req.body?.banned);
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;

        await dbService.setUserBan(id, banned, reason || undefined);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/settings', asyncHandler(async (req, res) => {
    try {
        const settings = await dbService.getSettings();
        res.json({
            oauth: settings?.oauth || null,
            pricing: settings?.pricing || null,
            payment_gateway: settings?.payment_gateway || null,
            api_keys: {
                openrouter_api_key: config.openrouter_api_key || "",
                nvidia_api_key: config.nvidia_api_key || ""
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/settings', asyncHandler(async (req, res) => {
    try {
        const { oauth, api_keys, pricing, payment_gateway } = req.body;

        if (oauth !== undefined || pricing !== undefined || payment_gateway !== undefined) {
            await dbService.saveSettings({ oauth, pricing, payment_gateway });
        }

        if (api_keys) {
            const configPath = path.join(process.cwd(), 'config.yml');
            const file = fs.readFileSync(configPath, 'utf8');
            const configData = yaml.parse(file);

            configData.openrouter_api_key = api_keys.openrouter_api_key;
            configData.nvidia_api_key = api_keys.nvidia_api_key;

            fs.writeFileSync(configPath, yaml.stringify(configData));

            config.openrouter_api_key = api_keys.openrouter_api_key;
            config.nvidia_api_key = api_keys.nvidia_api_key;
            console.log('Saved settings and API keys to config.yml');
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
