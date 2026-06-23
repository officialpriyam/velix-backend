import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { dbService } from '../services/DatabaseService';
import { GitBookService } from '../services/GitBookService';
import { generateCode } from '../services/AIService';

const router = Router();

interface GitBookConnectionRow {
    user_id: string;
    encrypted_token: string;
    gitbook_user_id: string;
    gitbook_user_name: string;
    gitbook_user_email: string;
    connected_at: string;
}

interface ProjectRow {
    id: string;
    user_id: string;
    name: string;
    gitbook_space_id?: string;
    [key: string]: unknown;
}

async function getConnection(userId: string): Promise<GitBookConnectionRow | null> {
    try {
        const rows = await (dbService as unknown as {
            request: <T>(table: string, init: Record<string, unknown>) => Promise<T>;
        }).request<GitBookConnectionRow[]>('gitbook_connections', {
            method: 'GET',
            filters: { user_id: userId }
        });
        return rows?.[0] || null;
    } catch {
        return null;
    }
}

async function getDecryptedToken(userId: string): Promise<string> {
    const conn = await getConnection(userId);
    if (!conn) throw new Error('GitBook not connected');
    return GitBookService.decryptToken(conn.encrypted_token);
}

router.post('/connect', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token is required' });
    }

    try {
        const user = await GitBookService.validateToken(token);
        const encryptedToken = GitBookService.encryptToken(token);
        const userId = req.auth!.userId;

        const existing = await getConnection(userId);
        if (existing) {
            const rows = await (dbService as unknown as {
                request: <T>(table: string, init: Record<string, unknown>) => Promise<T>;
            }).request<GitBookConnectionRow[]>('gitbook_connections', {
                method: 'PATCH',
                filters: { user_id: userId },
                body: JSON.stringify({
                    encrypted_token: encryptedToken,
                    gitbook_user_id: user.id,
                    gitbook_user_name: user.name,
                    gitbook_user_email: user.email
                })
            });
            return res.json({ connected: true, user: { id: user.id, name: user.name, email: user.email } });
        }

        await (dbService as unknown as {
            request: <T>(table: string, init: Record<string, unknown>) => Promise<T>;
        }).request('gitbook_connections', {
            method: 'POST',
            body: JSON.stringify({
                user_id: userId,
                encrypted_token: encryptedToken,
                gitbook_user_id: user.id,
                gitbook_user_name: user.name,
                gitbook_user_email: user.email
            })
        });

        res.json({ connected: true, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'GITBOOK_AUTH_EXPIRED') {
            return res.status(401).json({ error: 'Invalid GitBook token' });
        }
        console.error('[GitBook] Connect error:', message);
        res.status(500).json({ error: message });
    }
}));

router.get('/status', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const conn = await getConnection(req.auth!.userId);
    if (!conn) {
        return res.json({ connected: false });
    }
    res.json({
        connected: true,
        gitbook_user_name: conn.gitbook_user_name
    });
}));

router.delete('/disconnect', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        await (dbService as unknown as {
            request: <T>(table: string, init: Record<string, unknown>) => Promise<T>;
        }).request('gitbook_connections', {
            method: 'DELETE',
            filters: { user_id: req.auth!.userId }
        });
        res.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
}));

router.get('/organizations', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        const token = await getDecryptedToken(req.auth!.userId);
        const orgs = await GitBookService.listOrganizations(token);
        res.json({ organizations: orgs });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'GITBOOK_AUTH_EXPIRED') {
            return res.status(401).json({ error: 'GitBook token expired. Please reconnect.' });
        }
        console.error('[GitBook] List organizations error:', message);
        // Return empty instead of crashing — wiki can still work without orgs
        res.json({ organizations: [] });
    }
}));

router.post('/create-space', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { organizationId, title } = req.body;
    if (!organizationId || !title) {
        return res.status(400).json({ error: 'organizationId and title are required' });
    }

    try {
        const token = await getDecryptedToken(req.auth!.userId);
        const space = await GitBookService.createSpace(token, organizationId, title);
        res.json({ spaceId: space.id, spaceUrl: `https://app.gitbook.com/o/${encodeURIComponent(organizationId)}/s/${space.id}` });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'GITBOOK_AUTH_EXPIRED') {
            return res.status(401).json({ error: 'GitBook token expired. Please reconnect.' });
        }
        console.error('[GitBook] Create space error:', message);
        res.status(500).json({ error: message });
    }
}));

router.post('/import-pages', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { spaceId, pages } = req.body;
    if (!spaceId || !Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({ error: 'spaceId and pages array are required' });
    }

    interface ImportPageInput {
        title: string;
        content: string;
    }

    try {
        const token = await getDecryptedToken(req.auth!.userId);
        const results: { title: string; success: boolean; error?: string }[] = [];

        for (const page of pages as ImportPageInput[]) {
            try {
                await GitBookService.importPage(token, spaceId, page.title, page.content);
                results.push({ title: page.title, success: true });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                results.push({ title: page.title, success: false, error: msg });
            }
        }

        const successCount = results.filter(r => r.success).length;
        res.json({ imported: successCount, total: pages.length, results });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'GITBOOK_AUTH_EXPIRED') {
            return res.status(401).json({ error: 'GitBook token expired. Please reconnect.' });
        }
        console.error('[GitBook] Import pages error:', message);
        res.status(500).json({ error: message });
    }
}));

router.get('/spaces/:spaceId/pages', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { spaceId } = req.params;

    try {
        const token = await getDecryptedToken(req.auth!.userId);
        const pages = await GitBookService.listSpacePages(token, spaceId);
        res.json({ pages });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'GITBOOK_AUTH_EXPIRED') {
            return res.status(401).json({ error: 'GitBook token expired. Please reconnect.' });
        }
        console.error('[GitBook] List pages error:', message);
        res.status(500).json({ error: message });
    }
}));

router.post('/generate-wiki', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { projectId, spaceId, organizationId } = req.body;
    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    try {
        const token = await getDecryptedToken(req.auth!.userId);
        const userId = req.auth!.userId;

        let targetSpaceId = spaceId;
        let spaceUrl = '';

        if (!targetSpaceId) {
            if (!organizationId) {
                const orgs = await GitBookService.listOrganizations(token);
                if (orgs.length === 0) {
                    return res.status(400).json({ error: 'No GitBook organizations found. Provide an organizationId.' });
                }
                targetSpaceId = (await GitBookService.createSpace(token, orgs[0].id, `Project Wiki`)).id;
                spaceUrl = `https://app.gitbook.com/o/${encodeURIComponent(orgs[0].id)}/s/${targetSpaceId}`;
            } else {
                const project = await dbService.getProjectById(projectId) as ProjectRow | null;
                const spaceTitle = project?.name ? `${project.name} Wiki` : 'Project Wiki';
                const space = await GitBookService.createSpace(token, organizationId, spaceTitle);
                targetSpaceId = space.id;
                spaceUrl = `https://app.gitbook.com/o/${encodeURIComponent(organizationId)}/s/${targetSpaceId}`;
            }
        }

        const project = await dbService.getProjectById(projectId) as ProjectRow | null;
        const projectName = project?.name || 'Project';

        const systemPrompt = `You are a technical documentation writer. Generate comprehensive wiki documentation for the Minecraft project "${projectName}".

Generate the following wiki pages as a single JSON array. Each element must have "title" (string) and "content" (string, valid Markdown).

Pages to generate:
1. "Getting Started" — Installation, setup, first steps
2. "Features" — Overview of all features with usage examples
3. "Configuration" — All config options, defaults, and what they control
4. "API Reference" — Public API, classes, methods, parameters
5. "FAQ" — Common questions and answers

RULES:
- Write clear, accurate Markdown
- Use headings, code blocks, and tables where appropriate
- Be specific and concrete
- Return ONLY a JSON array, no other text`;

        const result = await generateCode(
            `Generate a complete wiki for "${projectName}" with 5 pages: Getting Started, Features, Configuration, API Reference, FAQ.`,
            undefined,
            systemPrompt,
            true,
            false
        );

        let pages: Array<{ title: string; content: string }> = [];
        try {
            const jsonMatch = result.rawResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                pages = JSON.parse(jsonMatch[0]);
            }
        } catch {
            pages = [
                { title: 'Documentation', content: result.rawResponse }
            ];
        }

        if (pages.length === 0) {
            pages = [{ title: 'Documentation', content: result.rawResponse }];
        }

        let importedCount = 0;
        for (const page of pages) {
            try {
                await GitBookService.importPage(token, targetSpaceId, page.title, page.content);
                importedCount++;
            } catch (err: unknown) {
                console.error(`[GitBook] Failed to import page "${page.title}":`, err instanceof Error ? err.message : err);
            }
        }

        try {
            await (dbService as unknown as {
                request: <T>(table: string, init: Record<string, unknown>) => Promise<T>;
            }).request('projects', {
                method: 'PATCH',
                filters: { id: projectId, user_id: userId },
                body: JSON.stringify({ gitbook_space_id: targetSpaceId })
            });
        } catch (err: unknown) {
            console.warn('[GitBook] Failed to save gitbook_space_id on project:', err instanceof Error ? err.message : err);
        }

        res.json({
            spaceId: targetSpaceId,
            pagesImported: importedCount,
            spaceUrl: spaceUrl || `https://app.gitbook.com/s/${targetSpaceId}`
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'GITBOOK_AUTH_EXPIRED') {
            return res.status(401).json({ error: 'GitBook token expired. Please reconnect.' });
        }
        console.error('[GitBook] Generate wiki error:', message);
        res.status(500).json({ error: message });
    }
}));

export default router;
