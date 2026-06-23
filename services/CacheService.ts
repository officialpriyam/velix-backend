import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || '';

let redis: Redis | null = null;

if (REDIS_URL) {
    try {
        redis = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy(times: number) {
                if (times > 3) return null;
                return Math.min(times * 200, 2000);
            },
            lazyConnect: true,
            connectTimeout: 3000
        });

        redis.on('connect', () => console.log('[Redis] Connected'));
        redis.on('error', (err) => console.warn('[Redis] Error:', err.message));

        redis.connect().catch(() => console.warn('[Redis] Could not connect — using in-memory cache'));
    } catch {
        redis = null;
    }
}

// ─── In-Memory LRU Cache (fallback when Redis unavailable) ───
class MemoryCache {
    private store = new Map<string, { value: any; expiresAt: number }>();
    private maxSize = 500;

    get(key: string): any | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    set(key: string, value: any, ttlMs: number): void {
        if (this.store.size >= this.maxSize) {
            // Evict oldest entry
            const firstKey = this.store.keys().next().value;
            if (firstKey) this.store.delete(firstKey);
        }
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }

    del(key: string): void {
        this.store.delete(key);
    }

    keys(pattern: string): string[] {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Array.from(this.store.keys()).filter(k => regex.test(k));
    }
}

const memoryCache = new MemoryCache();

const DEFAULT_TTL = 300; // 5 minutes
const AUTH_TTL = 60;     // 1 minute for auth tokens
const USER_TTL = 120;    // 2 minutes for user data
const MODELS_TTL = 300;  // 5 minutes for model lists

class CacheService {
    private isRedisConfigured(): boolean {
        return redis !== null && redis.status === 'ready';
    }

    async get<T = any>(key: string): Promise<T | null> {
        // Try Redis first
        if (this.isRedisConfigured()) {
            try {
                const data = await redis!.get(key);
                if (!data) return null;
                return JSON.parse(data) as T;
            } catch { /* fall through to memory */ }
        }
        // Fallback to in-memory cache
        return memoryCache.get(key) as T | null;
    }

    async set(key: string, value: any, ttl: number = DEFAULT_TTL): Promise<void> {
        const serialized = JSON.stringify(value);
        // Try Redis
        if (this.isRedisConfigured()) {
            try {
                await redis!.set(key, serialized, 'EX', ttl);
            } catch { /* fall through to memory */ }
        }
        // Also store in memory (works without Redis)
        memoryCache.set(key, value, ttl * 1000);
    }

    async del(key: string): Promise<void> {
        if (this.isRedisConfigured()) {
            try { await redis!.del(key); } catch { /* ignore */ }
        }
        memoryCache.del(key);
    }

    async invalidatePattern(pattern: string): Promise<void> {
        if (this.isRedisConfigured()) {
            try {
                const keys = await redis!.keys(pattern);
                if (keys.length > 0) {
                    await redis!.del(...keys);
                }
            } catch { /* ignore */ }
        }
        const memKeys = memoryCache.keys(pattern);
        for (const k of memKeys) memoryCache.del(k);
    }

    // ─── Auth-specific caching ───

    async getCachedAuth(token: string): Promise<{ userId: string; email: string } | null> {
        return this.get(`auth:${token}`);
    }

    async setCachedAuth(token: string, payload: { userId: string; email: string }): Promise<void> {
        await this.set(`auth:${token}`, payload, AUTH_TTL);
    }

    async invalidateAuth(token: string): Promise<void> {
        await this.del(`auth:${token}`);
    }

    // ─── User-specific caching ───

    async getCachedUser(userId: string): Promise<any | null> {
        return this.get(`user:${userId}`);
    }

    async setCachedUser(userId: string, user: any): Promise<void> {
        await this.set(`user:${userId}`, user, USER_TTL);
    }

    async invalidateUser(userId: string): Promise<void> {
        await this.del(`user:${userId}`);
        await this.invalidatePattern(`user:${userId}:*`);
    }

    // ─── Model list caching ───

    async getCachedModels(): Promise<any[] | null> {
        return this.get('models:all');
    }

    async setCachedModels(models: any[]): Promise<void> {
        await this.set('models:all', models, MODELS_TTL);
    }

    // ─── OAuth token exchange caching ───

    async getCachedOAuthSession(accessToken: string): Promise<any | null> {
        return this.get(`oauth:${accessToken}`);
    }

    async setCachedOAuthSession(accessToken: string, session: any): Promise<void> {
        await this.set(`oauth:${accessToken}`, session, AUTH_TTL);
    }

    // ─── Compile history caching ───

    async getCachedCompileHistory(sessionId: string): Promise<any[] | null> {
        return this.get(`compile_history:${sessionId}`);
    }

    async setCachedCompileHistory(sessionId: string, history: any[]): Promise<void> {
        await this.set(`compile_history:${sessionId}`, history, 300);
    }

    async invalidateCompileHistory(sessionId: string): Promise<void> {
        await this.del(`compile_history:${sessionId}`);
    }

    // ─── Generic with TTL ───

    async getOrSet<T = any>(key: string, fetcher: () => Promise<T>, ttl: number = DEFAULT_TTL): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;
        const fresh = await fetcher();
        if (fresh !== null && fresh !== undefined) {
            await this.set(key, fresh, ttl);
        }
        return fresh;
    }
}

export const cacheService = new CacheService();
