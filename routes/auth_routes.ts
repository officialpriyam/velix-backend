import { Router } from 'express';
import { AuthService } from '../services/AuthService';
import { dbService } from '../services/DatabaseService';
import { requireAuth, sessionCookieOptions } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { cacheService } from '../services/CacheService';

const router = Router();

router.post('/register', asyncHandler(async (req, res) => {
    const { email, name, password } = req.body;
    try {
        const { user, token } = await AuthService.register(email, name, password);

        // Set cookie
        res.cookie('token', token, sessionCookieOptions);

        res.json({ user });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    try {
        const { user, token } = await AuthService.login(email, password);

        res.cookie('token', token, sessionCookieOptions);

        // Cache user data for immediate use
        if (user) {
            await cacheService.setCachedUser(user.id, user);
        }

        res.json({ user });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

router.get('/pricing', asyncHandler(async (req, res) => {
    const settings = await dbService.getSettings();
    res.json({
        plans: Array.isArray(settings?.pricing) && settings.pricing.length > 0 ? settings.pricing : [],
        payment_gateway: settings?.payment_gateway || {
            enabled: false,
            provider: '',
            discord_invite_url: 'https://discord.gg/FD6QrzeATb'
        }
    });
}));

router.get('/site-status', asyncHandler(async (req, res) => {
    const whitelist = (process.env.SITE_WHITELIST || '').split(',').map(item => item.trim()).filter(Boolean);
    const requestIp = (req.ip || '').replace(/^::ffff:/, '');
    const isWhitelisted = whitelist.length === 0 || whitelist.includes(requestIp);

    if (!isWhitelisted) {
        return res.status(503).json({
            open: false,
            message: 'The site is currently unavailable for your address. Please contact support or join the Discord for access.'
        });
    }

    const oauthRedirectUrl = process.env.OAUTH_REDIRECT_URL || '';
    res.json({ open: true, message: 'Site is available.', oauthRedirectUrl });
}));

router.get('/me', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    res.json({ user: req.auth!.user });
}));

router.post('/logout', async (req, res) => {
    const token = req.cookies?.token;
    if (token) {
        await cacheService.invalidateAuth(token);
    }
    res.clearCookie('token', { path: '/' });
    res.json({ success: true });
});

// OAuth: exchange Supabase access_token for backend session cookie
router.post('/oauth', asyncHandler(async (req, res) => {
    const { access_token } = req.body;
    if (!access_token) {
        return res.status(400).json({ error: 'access_token is required' });
    }

    try {
        // Check if we already have this OAuth session cached
        const cachedSession = await cacheService.getCachedOAuthSession(access_token);
        let user: any;

        if (cachedSession) {
            user = cachedSession;
        } else {
            const payload = await AuthService.verifyToken(access_token);
            if (!payload) {
                return res.status(401).json({ error: 'Invalid or expired token' });
            }

            user = await dbService.getUserById(payload.userId);
            if (!user) {
                await dbService.createUser({
                    id: payload.userId,
                    email: payload.email,
                    name: payload.email?.split('@')[0] || 'User'
                });
                user = await dbService.getUserById(payload.userId);
            }

            // Cache both the OAuth session and user data
            if (user) {
                await cacheService.setCachedOAuthSession(access_token, user);
                await cacheService.setCachedUser(user.id, user);
            }
        }

        res.cookie('token', access_token, sessionCookieOptions);
        res.json({ user });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

// Update Profile
router.patch('/profile', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { displayName, email, discordId } = req.body;
    if (!displayName || !email) {
        return res.status(400).json({ error: 'Display name and email are required' });
    }

    try {
        await dbService.updateUserProfile(req.auth!.userId, displayName, email, discordId || "");
        await AuthService.updateAuthEmail(req.auth!.userId, email);
        const user = await dbService.getUserById(req.auth!.userId);
        if (user) await cacheService.setCachedUser(req.auth!.userId, user);
        res.json({ success: true, user });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

// Update Preferences
router.patch('/preferences', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const {
        history_quick_access,
        email_notifications,
        paste_as_file,
        texture_generation,
        knowledge_refractor
    } = req.body;

    try {
        await dbService.updateUserPreferences(req.auth!.userId, {
            history_quick_access: history_quick_access ? 1 : 0,
            email_notifications: email_notifications ? 1 : 0,
            paste_as_file: paste_as_file ? 1 : 0,
            texture_generation: texture_generation ? 1 : 0,
            knowledge_refractor: knowledge_refractor ? 1 : 0
        });
        const user = await dbService.getUserById(req.auth!.userId);
        if (user) await cacheService.setCachedUser(req.auth!.userId, user);
        res.json({ success: true, user });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

// Get Credits History
router.get('/credits', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        const user = await dbService.getUserById(req.auth!.userId);
        const transactions = await dbService.getCreditsTransactions(req.auth!.userId);
        res.json({ credits: user.credits, transactions });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

// Mock Buy Credits
router.post('/buy-credits', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { amount, packName } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    try {
        const settings = await dbService.getSettings();
        const gateway = settings?.payment_gateway || {
            enabled: false,
            provider: '',
            discord_invite_url: 'https://discord.gg/FD6QrzeATb'
        };

        if (!gateway?.enabled) {
            return res.status(403).json({ error: 'Payments are temporarily disabled. Please contact support or join our Discord for access.' });
        }

        await dbService.addCredits(req.auth!.userId, amount, 'purchase', `Bought ${packName || 'Credits Pack'}`);
        const user = await dbService.getUserById(req.auth!.userId);
        if (user) await cacheService.setCachedUser(req.auth!.userId, user);
        res.json({ success: true, user });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

// Get User Profile details
router.get('/profile/:profileId', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    try {
        const user = await dbService.getPublicProfileByProfileId(parseInt(profileId));
        if (!user) return res.status(404).json({ error: 'User profile not found' });

        const projects = await dbService.getProjectsByUserId(user.id);
        const activityData = await dbService.getUserActivityHeatmap(user.id);

        res.json({
            user: {
                id: user.id,
                name: user.name,
                displayName: user.display_name,
                discordId: user.discord_id,
                profileId: user.profile_id,
                created_at: user.created_at
            },
            projects: projects.slice(0, 6),
            stats: {
                projectsCount: projects.length,
                totalViews: projects.length * 2,
                totalDownloads: projects.length * 2
            },
            activity: {
                totalActions: activityData.totalActions,
                heatmap: activityData.heatmap,
                monthlyCounts: activityData.monthlyCounts,
                breakdown: activityData.breakdown
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
