import { Router } from 'express';
import { dbService } from '../services/DatabaseService';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { generateCode } from '../services/AIService';
import { SandboxContext } from '../services/SandboxService';
import fs from 'fs';

const router = Router();

router.get('/projects/:projectId/pages', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    try {
        const pages = await dbService.getWikiPages(projectId);
        res.json(pages);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/pages/:pageId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    try {
        const page = await dbService.getWikiPageById(pageId);
        if (!page) return res.status(404).json({ error: 'Page not found' });
        res.json(page);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/projects/:projectId/pages', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { title, slug, content } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    try {
        const pageSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const page = await dbService.createWikiPage(projectId, title, pageSlug, content || '');
        res.json(page);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/pages/:pageId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { title, content, slug, sort_order, is_public } = req.body;
    try {
        const existing = await dbService.getWikiPageById(pageId);
        if (!existing) return res.status(404).json({ error: 'Page not found' });

        await dbService.updateWikiPage(pageId, {
            ...(title !== undefined && { title }),
            ...(content !== undefined && { content }),
            ...(slug !== undefined && { slug }),
            ...(sort_order !== undefined && { sort_order }),
            ...(is_public !== undefined && { is_public })
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.delete('/pages/:pageId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    try {
        await dbService.deleteWikiPage(pageId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/projects/:projectId/generate', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { prompt, type } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const user = req.auth!.user;
    if (user.credits < 5) {
        return res.status(402).json({ error: 'Insufficient credits. Wiki generation requires 5 credits. Buy more credits to continue.' });
    }

    try {
        const sandbox = new SandboxContext(projectId);
        let projectContext = '';
        if (fs.existsSync(sandbox.rootPath)) {
            const walk = (dir: string, prefix: string = '') => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        walk(`${dir}/${entry.name}`, relPath);
                    } else if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        try {
                            const content = fs.readFileSync(`${dir}/${entry.name}`, 'utf8');
                            if (content.length < 50000) {
                                projectContext += `\n=== FILE: ${relPath} ===\n${content}\n`;
                            }
                        } catch { /* skip unreadable files */ }
                    }
                }
            };
            walk(sandbox.rootPath);
        }

        let chatContext = '';
        try {
            const messages = await dbService.getMessagesBySessionId(projectId);
            if (Array.isArray(messages) && messages.length > 0) {
                chatContext = messages.slice(-20).map((m: any) =>
                    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
                ).join('\n\n');
            }
        } catch { /* ignore */ }

        const wikiType = type || 'getting-started';
        const typeDescriptions: Record<string, string> = {
            'getting-started': 'Create a comprehensive getting-started guide. Include installation, setup steps, basic usage, and first steps.',
            'api-docs': 'Create detailed API documentation. Document all public classes, methods, parameters, return values, and usage examples.',
            'tutorial': 'Create a step-by-step tutorial. Walk through building something with this project from scratch.',
            'config': 'Create a configuration reference. Document every config option, its default value, valid values, and what it controls.',
            'faq': 'Create an FAQ page. Anticipate common questions users will have and provide clear answers.',
            'changelog': 'Create a changelog documenting all features, fixes, and changes visible in the codebase.'
        };

        const systemPrompt = `You are a technical documentation writer. Generate high-quality wiki documentation for a Minecraft project.

${typeDescriptions[wikiType] || typeDescriptions['getting-started']}

PROJECT FILES:
${projectContext || '(No project files found - generate based on the user description)'}

CHAT HISTORY (context for what was built and why):
${chatContext || '(No chat history available)'}

RULES:
- Write clear, accurate documentation based on the ACTUAL code provided
- Use real file names, class names, method names from the code
- Format as clean Markdown
- Use headings, code blocks, tables where appropriate
- Do NOT invent features that don't exist in the code
- Do NOT use marketing language
- Be specific and concrete`;

        const result = await generateCode(prompt, 'openai/gpt-oss-20b:free', systemPrompt, true, false);

        const slug = (prompt || wikiType).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-|-$/g, '');
        const pageTitle = prompt.slice(0, 100) || `${wikiType} documentation`;

        const page = await dbService.createWikiPage(projectId, pageTitle, slug, result.rawResponse);

        await dbService.deductCredits(req.auth!.userId, 5, 'wiki_generation', `Generated wiki: ${pageTitle}`);

        const updatedUser = await dbService.getUserById(req.auth!.userId);

        res.json({
            page,
            rawResponse: result.rawResponse,
            creditsUsed: 5,
            creditsRemaining: updatedUser?.credits ?? 0
        });
    } catch (error: any) {
        console.error('[Wiki] Generate error:', error.message);
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/pages/:pageId/visibility', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { is_public } = req.body;
    try {
        await dbService.updateWikiPage(pageId, { is_public: is_public ? 1 : 0 });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/public/:projectId/pages', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    try {
        const pages = await dbService.getPublicWikiPages(projectId);
        res.json(pages);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/public/pages/:pageId', asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    try {
        const page = await dbService.getWikiPageById(pageId);
        if (!page || !page.is_public) return res.status(404).json({ error: 'Page not found' });
        res.json(page);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
