import axios from 'axios';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

function assertConfig() {
    if (!upstashUrl || !upstashToken) {
        throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in environment variables');
    }
}

async function command<T>(args: any[]): Promise<T> {
    assertConfig();

    const response = await axios.post(upstashUrl!, args, {
        headers: {
            Authorization: `Bearer ${upstashToken}`,
            'Content-Type': 'application/json'
        }
    });

    const data = response.data;
    if (data.error) {
        throw new Error(`Upstash Redis error: ${data.error}`);
    }

    return data.result as T;
}

export const redis = {
    get: async <T>(key: string): Promise<T | null> => {
        try {
            const val = await command<string | null>(['GET', key]);
            if (val === null) return null;
            return JSON.parse(val) as T;
        } catch (e) {
            console.error(`[Redis] GET failed for ${key}:`, e);
            return null;
        }
    },
    set: async (key: string, value: any, ttlSeconds?: number): Promise<'OK' | null> => {
        try {
            const args = ttlSeconds
                ? ['SET', key, JSON.stringify(value), 'EX', ttlSeconds]
                : ['SET', key, JSON.stringify(value)];
            return await command<'OK'>(args);
        } catch (e) {
            console.error(`[Redis] SET failed for ${key}:`, e);
            return null;
        }
    },
    del: async (key: string): Promise<number | null> => {
        try {
            return await command<number>(['DEL', key]);
        } catch (e) {
            console.error(`[Redis] DEL failed for ${key}:`, e);
            return null;
        }
    }
};

export const isUpstashConfigured = Boolean(upstashUrl && upstashToken);
