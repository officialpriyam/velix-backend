import crypto from 'crypto';

const GITBOOK_API = 'https://api.gitbook.com/v1';

function getEncryptionKey(): Buffer {
    const hexKey = process.env.GITBOOK_ENCRYPTION_KEY;
    if (hexKey) {
        const key = Buffer.from(hexKey, 'hex');
        if (key.length === 32) return key;
    }

    const secret = process.env.SESSION_SECRET || 'velix-default-dev-key-change-in-production';
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(plain: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(encrypted: string): string {
    const key = getEncryptionKey();
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
}

interface GitBookUser {
    id: string;
    name: string;
    email: string;
}

interface GitBookOrganization {
    id: string;
    name: string;
    [key: string]: unknown;
}

interface GitBookSpace {
    id: string;
    title: string;
    [key: string]: unknown;
}

interface GitBookPage {
    id: string;
    title: string;
    path: string;
    [key: string]: unknown;
}

async function gitbookFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    const url = `${GITBOOK_API}${path}`;
    const res = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...init.headers
        }
    });

    if (res.status === 401) {
        throw new Error('GITBOOK_AUTH_EXPIRED');
    }

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitBook API error ${res.status}: ${body}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

export class GitBookService {
    static encryptToken = encryptToken;
    static decryptToken = decryptToken;

    static async validateToken(token: string): Promise<GitBookUser> {
        return gitbookFetch<GitBookUser>('/user', token);
    }

    static async listOrganizations(token: string): Promise<GitBookOrganization[]> {
        try {
            const data = await gitbookFetch<{ items: GitBookOrganization[] }>('/user/organizations', token);
            return data.items || [];
        } catch {
            // Fallback: try the v2 /orgs endpoint
            try {
                const data = await gitbookFetch<{ items: GitBookOrganization[] }>('/orgs', token);
                return data.items || [];
            } catch {
                return [];
            }
        }
    }

    static async createSpace(token: string, organizationId: string, title: string): Promise<GitBookSpace> {
        return gitbookFetch<GitBookSpace>(
            `/orgs/${encodeURIComponent(organizationId)}/spaces`,
            token,
            { method: 'POST', body: JSON.stringify({ title }) }
        );
    }

    static async importPage(
        token: string,
        spaceId: string,
        name: string,
        content: string
    ): Promise<GitBookPage> {
        return gitbookFetch<GitBookPage>(
            `/spaces/${encodeURIComponent(spaceId)}/import`,
            token,
            {
                method: 'POST',
                body: JSON.stringify({ format: 'markdown', content, name })
            }
        );
    }

    static async listSpacePages(token: string, spaceId: string): Promise<GitBookPage[]> {
        const data = await gitbookFetch<{ items: GitBookPage[] }>(
            `/spaces/${encodeURIComponent(spaceId)}/content/pages`,
            token
        );
        return data.items || [];
    }

    static async deleteSpace(token: string, spaceId: string): Promise<void> {
        await gitbookFetch<void>(
            `/spaces/${encodeURIComponent(spaceId)}`,
            token,
            { method: 'DELETE' }
        );
    }
}
