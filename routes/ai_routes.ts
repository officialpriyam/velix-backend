import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import config from '../utils/config';
import { generateCode, enhancePrompt } from '../services/AIService';
import { CodeGenerationService } from '../services/CodeGenerationService';
import { pluginManager } from '../services/PluginManager';
import { AuthService } from '../services/AuthService';
import { dbService } from '../services/DatabaseService';
import { SandboxContext } from '../services/SandboxService';
import { WebSearchService } from '../services/WebSearchService';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { cacheService } from '../services/CacheService';

const router = Router();

/**
 * Enhance prompt into a specification
 */
router.post('/enhance-prompt', asyncHandler(async (req, res) => {
    const { prompt, platform } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    try {
        const enhanced = await enhancePrompt(prompt, platform);
        res.json({ enhanced });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Generate code with AI (returns structured file data)
 */
router.post('/generate', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { prompt, model, language, sessionId: existingSessionId, enableWebSearch } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    const user = req.auth!.user;

    if (user.credits < 20) {
        return res.status(402).json({ error: "Insufficient credits. Code generation requires 20 credits. Buy more credits to continue." });
    }

    const plugin = pluginManager.getPlugin(language || 'java');
    const platform = req.body.platform || 'minecraft';
    const context = plugin?.systemPrompt || "";
    const skipDocs = platform === 'discord-bot';

    try {
        // Load conversation history for context
        let history: Array<{ role: string; content: string }> = [];
        if (existingSessionId) {
            try {
                const prevMessages = await dbService.getMessagesBySessionId(existingSessionId);
                if (Array.isArray(prevMessages)) {
                    history = prevMessages.map((m: any) => ({
                        role: m.role,
                        content: m.content
                    }));
                }
            } catch (err) {
                console.warn('[AI Routes] Failed to load chat history:', err);
            }
        }

        const result = await generateCode(prompt, model, context, skipDocs, enableWebSearch === true, history, platform);

        // REUSE or GENERATE session ID
        const sessionId = existingSessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // SAVE FILES TO SANDBOX IMMEDIATELY
        const sandbox = new SandboxContext(sessionId);
        for (const file of result.files) {
            sandbox.writeFile(file.path, file.content);
        }

        // Deduct credits and save history
        await dbService.deductCredits(req.auth!.userId, 20, 'generation', `Generated code for ${plugin?.name || "Project"}`);
        const updatedUser = await dbService.getUserById(req.auth!.userId);
        if (updatedUser) await cacheService.setCachedUser(req.auth!.userId, updatedUser);

        await dbService.createProject({
            id: sessionId,
            userId: req.auth!.userId,
            name: plugin?.name || "New Project",
            language: language || 'java',
            model: model
        });

        // Persistence: Save chat history
        await dbService.addMessage(sessionId, 'user', prompt);
        await dbService.addMessage(sessionId, 'assistant', result.rawResponse);

        // Create version snapshot for this generation
        const fileMap: Record<string, string> = {};
        const fileList: string[] = [];
        for (const file of result.files) {
            fileMap[file.path] = file.content;
            fileList.push(file.path);
        }
        if (fileList.length > 0) {
            await dbService.createVersion(sessionId, 'ai', fileMap, fileList, prompt.slice(0, 120));
        }

        res.json({
            sessionId,
            files: result.files,
            model: result.model,
            rawResponse: result.rawResponse,
            creditsUsed: 20,
            creditsRemaining: updatedUser.credits
        });
    } catch (error: any) {
        console.error('[AI Routes] Generate error:', error.message);
        console.error('[AI Routes] Generate error stack:', error.stack);
        if (error.response) {
            console.error('[AI Routes] Response status:', error.response.status);
            console.error('[AI Routes] Response data:', JSON.stringify(error.response.data).substring(0, 500));
        }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}));

/**
 * Manual web search endpoint
 */
router.post('/search', asyncHandler(async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    try {
        const results = await WebSearchService.searchWeb(query);
        res.json({ results });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Generate complete project and optionally compile it
 */
router.post('/generate-and-compile', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { prompt, language, model, autoCompile, enableWebSearch } = req.body;

    if (!prompt || !language) {
        return res.status(400).json({ error: "Prompt and language are required" });
    }

    const user = req.auth!.user;

    if (user.credits < 20) {
        return res.status(402).json({ error: "Insufficient credits. Code generation requires 20 credits. Buy more credits to continue." });
    }

    try {
        const result = await CodeGenerationService.generateProject({
            prompt,
            language,
            model,
            autoCompile: autoCompile !== false, // Default to true
            enableWebSearch: enableWebSearch === true
        });

        const plugin = pluginManager.getPlugin(language);
        await dbService.deductCredits(req.auth!.userId, 20, 'generation', `Generated & compiled ${plugin?.name || "Project"}`);
        const updatedUser = await dbService.getUserById(req.auth!.userId);
        if (updatedUser) await cacheService.setCachedUser(req.auth!.userId, updatedUser);

        await dbService.createProject({
            id: result.sessionId,
            userId: req.auth!.userId,
            name: plugin?.name || "New Project",
            language: language,
            model: model
        });

        await dbService.addMessage(result.sessionId, 'user', prompt);
        await dbService.addMessage(result.sessionId, 'assistant', `Generated ${result.files.length} files.`);

        res.json({
            ...result,
            creditsUsed: 5,
            creditsRemaining: updatedUser.credits
        });
    } catch (error: any) {
        console.error('[AI Routes] Generate-and-compile error:', error.message);
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Get chat history for a session
 */
router.get('/messages/:sessionId', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    try {
        const messages = await dbService.getMessagesBySessionId(sessionId);
        res.json(messages);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Get available language plugins
 */
router.get('/languages', (req, res) => {
    const plugins = pluginManager.getAllPlugins();
    res.json(plugins.map(p => ({
        id: p.id,
        name: p.name,
        fileExtension: p.fileExtension
    })));
});


/**
 * Get available AI models - live from NVIDIA API (OpenRouter optional)
 * Only shows: all NVIDIA models + curated free OpenRouter models for coding
 */
router.get('/models', asyncHandler(async (req, res) => {
    try {
        const orKey = process.env.OPENROUTER_API_KEY || config.openrouter_api_key || '';
        const nvKey = process.env.NVIDIA_API_KEY || config.nvidia_api_key || '';

        const fetches: Promise<any[]>[] = [];

        if (nvKey) {
            fetches.push(fetchNvidiaModels(nvKey));
        }
        if (orKey && orKey.startsWith('sk-or-')) {
            fetches.push(fetchOpenRouterModels(orKey));
        }

        const results = await Promise.allSettled(fetches);
        const all = results
            .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
            .flatMap(r => r.value);

        // Curated free models that are best for coding
        const ALLOWED_FREE_MODELS = [
            'openai/gpt-oss-20b:free',
            'openai/gpt-oss-120b:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'qwen/qwen3-coder:free',
            'qwen/qwen3-next-80b-a3b-instruct:free',
            'google/gemma-4-26b-a4b-it:free',
            'google/gemma-4-31b-it:free',
            'nousresearch/hermes-3-llama-3.1-405b:free'
        ];

        // Admin override: comma-separated list of additional model IDs to allow
        const extraModels = (process.env.EXTRA_ALLOWED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);

        // Filter: keep all NVIDIA models, only curated free OpenRouter models
        const filtered = all.filter(m => {
            if (m.provider === 'nvidia') return true;
            if (m.id.endsWith(':free')) return ALLOWED_FREE_MODELS.includes(m.id) || extraModels.includes(m.id);
            return false;
        });

        console.log(`[AI Routes] Models: ${all.length} total → ${filtered.length} shown (NVIDIA + curated free)`);

        if (filtered.length === 0) {
            const fallback = (config.nvidia_models || []).map((m: string) => ({
                id: m,
                name: m.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || m,
                description: 'NVIDIA NIM model',
                context_length: 131072,
                provider: 'nvidia' as const
            }));
            return res.json(fallback);
        }

        res.json(filtered);
    } catch (err) {
        console.error('[AI Routes] /models error:', err);
        const fallback = (config.nvidia_models || []).map((m: string) => ({
            id: m,
            name: m.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || m,
            description: 'NVIDIA NIM model',
            context_length: 131072,
            provider: 'nvidia' as const
        }));
        res.json(fallback);
    }
}));

async function fetchOpenRouterModels(apiKey: string): Promise<any[]> {
    if (!apiKey || !apiKey.startsWith('sk-or-')) return [];
    try {
        const response = await axios.get('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000
        });
        const data = response.data?.data;
        if (!Array.isArray(data)) return [];
        return data.map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            description: m.description || '',
            context_length: m.context_length || 0,
            provider: 'openrouter' as const,
            pricing: m.pricing || null
        }));
    } catch (err: any) {
        console.warn('[AI Routes] OpenRouter models fetch failed:', err.message || err);
        return [];
    }
}

async function fetchNvidiaModels(apiKey: string) {
    if (!apiKey) return [];
    try {
        const response = await axios.get('https://integrate.api.nvidia.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000
        });
        const data = response.data.data || response.data || [];
        return data.map((m: any) => ({
            id: m.id,
            name: m.id.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || m.id,
            description: m.description || 'NVIDIA NIM model',
            context_length: m.context_length || m.max_model_len || 131072,
            provider: 'nvidia' as const
        }));
    } catch (err) {
        console.error('[AI Routes] Failed to fetch NVIDIA models, using fallback:', err);
        return (config.nvidia_models || []).map((m: string) => ({
            id: m,
            name: `${m.split('/').pop()?.replace(/-/g, ' ').toUpperCase() || m}`,
            description: 'NVIDIA NIM model',
            context_length: 131072,
            provider: 'nvidia' as const
        }));
    }
}

// Project Management
router.delete('/projects/:id', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
        await dbService.deleteProject(id, req.auth!.userId);
        // CLEANUP SANDBOX
        const sandbox = new SandboxContext(id);
        if (fs.existsSync(sandbox.rootPath)) {
            fs.rmSync(sandbox.rootPath, { recursive: true, force: true });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/projects/:id', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: "Name is required" });

    try {
        await dbService.renameProject(id, req.auth!.userId, name);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/projects/:id/model', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { model } = req.body;

    if (!model) return res.status(400).json({ error: "Model is required" });

    try {
        await dbService.updateProjectModel(id, req.auth!.userId, model);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/projects/:id/visibility', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isPublic } = req.body;

    try {
        await dbService.toggleProjectVisibility(id, req.auth!.userId, isPublic);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Community Projects
 */
router.get('/community', asyncHandler(async (req, res) => {
    try {
        const projects = await dbService.getPublicProjects();
        res.json(projects);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Fork a project
 */
router.post('/fork/:id', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id: sourceId } = req.params;

    try {
        const project = await dbService.getProjectById(sourceId);
        if (!project) return res.status(404).json({ error: "Project not found" });
        if (!project.is_public && project.user_id !== req.auth!.userId) {
            return res.status(403).json({ error: "This project is private" });
        }

        const newId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // 1. Create DB entry
        await dbService.createProject({
            id: newId,
            userId: req.auth!.userId,
            name: `${project.name} (Forked)`,
            language: project.language,
            model: project.model
        });

        // 2. Clone sandbox files
        const sourceSandbox = new SandboxContext(sourceId);
        const targetSandbox = new SandboxContext(newId);

        if (fs.existsSync(sourceSandbox.rootPath)) {
            fs.mkdirSync(targetSandbox.rootPath, { recursive: true });
            fs.cpSync(sourceSandbox.rootPath, targetSandbox.rootPath, { recursive: true });
        }

        res.json({ success: true, newSessionId: newId });
    } catch (error: any) {
        console.error('[AI Routes] Fork error:', error.message);
        res.status(500).json({ error: error.message });
    }
}));

// ─── Session Settings ───

router.get('/projects/:id/settings', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const settings = await dbService.getProjectSettings(id);
        res.json({ settings });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/projects/:id/settings', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object is required' });
    }
    try {
        await dbService.updateProjectSettings(id, req.auth!.userId, settings);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
