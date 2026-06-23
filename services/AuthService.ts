import { dbService } from './DatabaseService';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type SupabaseSession = {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user: {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
    };
};

function requireAuthConfig() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Missing SUPABASE_URL and SUPABASE_ANON_KEY backend environment variables');
    }
}

async function supabaseAuth<T>(path: string, init: RequestInit = {}, token?: string) {
    requireAuthConfig();

    const res = await fetch(new URL(`/auth/v1${path}`, SUPABASE_URL), {
        ...init,
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            ...init.headers
        }
    });

    if (!res.ok) {
        const message = await res.text();
        throw new Error(`Supabase auth failed: ${res.status} ${message}`);
    }

    return res.json() as Promise<T>;
}

function displayNameFromSession(session: SupabaseSession, fallbackName?: string) {
    const metadataName = session.user.user_metadata?.name;
    return typeof metadataName === 'string' && metadataName.trim()
        ? metadataName
        : fallbackName || session.user.email?.split('@')[0] || 'User';
}

export class AuthService {
    static async register(email: string, name: string, password: string) {
        const session = await supabaseAuth<SupabaseSession>('/signup', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password,
                data: { name }
            })
        });

        await dbService.createUser({
            id: session.user.id,
            email: session.user.email || email,
            name: displayNameFromSession(session, name)
        });

        const user = await dbService.getUserById(session.user.id);
        return { user, token: session.access_token };
    }

    static async login(email: string, password: string) {
        const session = await supabaseAuth<SupabaseSession>('/token?grant_type=password', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        let user = await dbService.getUserById(session.user.id);
        if (!user) {
            await dbService.createUser({
                id: session.user.id,
                email: session.user.email || email,
                name: displayNameFromSession(session)
            });
            user = await dbService.getUserById(session.user.id);
        }

        return { user, token: session.access_token };
    }

    static async verifyToken(token: string) {
        try {
            const user = await supabaseAuth<SupabaseSession['user']>('/user', {
                method: 'GET'
            }, token);

            return { userId: user.id, email: user.email || '' };
        } catch {
            return null;
        }
    }

    static async updateAuthEmail(userId: string, email: string) {
        if (!SUPABASE_SERVICE_ROLE_KEY) return;

        await fetch(new URL(`/auth/v1/admin/users/${userId}`, SUPABASE_URL), {
            method: 'PUT',
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
    }
}
