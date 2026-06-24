import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import config from '../utils/config';
import { generateCode, enhancePrompt } from '../services/AIService';
import { CodeGenerationService } from '../services/CodeGenerationService';
import { pluginManager } from '../services/PluginManager';
import { AuthService } from '../services/AuthService';
import { dbService } from '../services/DatabaseService';
import { SandboxContext } from '../services/SandboxService';
import { generateProjectThumbnail } from '../services/ThumbnailService';
import { WebSearchService } from '../services/WebSearchService';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { cacheService } from '../services/CacheService';

const router = Router();

/**
 * Enhance prompt into a specification
 */
router.post('/enhance-prompt', asyncHandler(async (req, res) => {
    const { prompt, platform, language } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    try {
        const enhanced = await enhancePrompt(prompt, platform, language);
        res.json({ enhanced });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Generate code with AI (returns structured file data)
 */
router.post('/generate', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    console.log('[AI Routes] /generate called');
    const { prompt, model, language, sessionId: existingSessionId, enableWebSearch } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    if (!req.auth || !req.auth.user) {
        console.error('[AI Routes] /generate - req.auth missing after requireAuth');
        return res.status(401).json({ error: "Authentication failed" });
    }

    const user = req.auth.user;

    if (user.credits < 20) {
        return res.status(402).json({ error: "Insufficient credits. Code generation requires 20 credits. Buy more credits to continue." });
    }

    const plugin = pluginManager.getPlugin(language || 'java');
    const platform = req.body.platform || 'minecraft';
    const context = plugin?.systemPrompt || "";
    const skipDocs = platform === 'discord-bot';

    let sessionId = existingSessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    let files: any[] = [];
    let rawResponse = '';
    let modelUsed = model || 'unknown';
    let creditsRemaining = user.credits;

    try {
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

        const result = await generateCode(prompt, model, context, skipDocs, enableWebSearch === true, history, platform, language);
        files = result.files || [];
        rawResponse = result.rawResponse || '';
        modelUsed = result.model || model;

        console.log(`[AI Routes] /generate AI completed - ${files.length} files, model: ${modelUsed}`);
    } catch (aiError: any) {
        console.error('[AI Routes] AI generation failed:', aiError.message);
        return res.status(500).json({ error: `AI generation failed: ${aiError.message || 'Unknown error'}` });
    }

    // Write files to sandbox (non-critical, don't fail over this)
    try {
        const sandbox = new SandboxContext(sessionId);
        for (const file of files) {
            sandbox.writeFile(file.path, file.content);
        }
    } catch (e: any) {
        console.warn('[AI Routes] Sandbox write failed:', e.message);
    }

    // Deduct credits (non-critical)
    try {
        await dbService.deductCredits(req.auth!.userId, 20, 'generation', `Generated code for ${plugin?.name || "Project"}`);
    } catch (deductErr: any) {
        console.error('[AI Routes] deductCredits failed:', deductErr.message);
    }

    // Get updated user (non-critical)
    try {
        const updatedUser = await dbService.getUserById(req.auth!.userId);
        if (updatedUser) {
            await cacheService.setCachedUser(req.auth!.userId, updatedUser);
            creditsRemaining = updatedUser.credits ?? 0;
        }
    } catch (e: any) {
        console.warn('[AI Routes] Failed to fetch updated user:', e.message);
    }

    // Create project record (non-critical)
    try {
        await dbService.createProject({
            id: sessionId,
            userId: req.auth!.userId,
            name: plugin?.name || "New Project",
            language: language || 'java',
            model: model
        });

        // Generate thumbnail async (non-blocking, fire-and-forget)
        generateProjectThumbnail(language || 'java', plugin?.name || 'New Project')
            .then(async (thumbnail) => {
                if (thumbnail) {
                    await dbService.updateProjectThumbnail(sessionId, thumbnail);
                    console.log(`[Thumbnail] Generated for project ${sessionId}`);
                }
            })
            .catch((err) => console.warn('[Thumbnail] Failed:', err.message));
    } catch (e: any) {
        console.warn('[AI Routes] Failed to create project record:', e.message);
    }

    // Save chat history (non-critical)
    try {
        await dbService.addMessage(sessionId, 'user', prompt);
        await dbService.addMessage(sessionId, 'assistant', rawResponse.slice(0, 4000));
    } catch (e: any) {
        console.warn('[AI Routes] Failed to save chat history:', e.message);
    }

    // Create version snapshot (non-critical)
    try {
        const fileMap: Record<string, string> = {};
        const fileList: string[] = [];
        for (const file of files) {
            fileMap[file.path] = file.content;
            fileList.push(file.path);
        }
        if (fileList.length > 0) {
            await dbService.createVersion(sessionId, 'ai', fileMap, fileList, prompt.slice(0, 120));
        }
    } catch (e: any) {
        console.warn('[AI Routes] Failed to create version:', e.message);
    }

    // ALWAYS send response — truncate rawResponse to prevent huge payloads
    const responsePayload = {
        sessionId,
        files,
        model: modelUsed,
        rawResponse: rawResponse.slice(0, 2000),
        creditsUsed: 20,
        creditsRemaining
    };
    console.log(`[AI Routes] /generate sending response - files: ${files.length}, payload size: ~${JSON.stringify(responsePayload).length} bytes`);
    res.json(responsePayload);
    console.log(`[AI Routes] /generate response sent OK`);
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

// ─── Private Share Link ───
router.post('/projects/:id/share-token', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const project = await dbService.getProjectById(id);
        if (!project || project.user_id !== req.auth!.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (project.share_token) {
            return res.json({ token: project.share_token, url: `/s/${project.share_token}` });
        }
        const token = await dbService.generateShareToken(id, req.auth!.userId);
        res.json({ token, url: `/s/${token}` });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.delete('/projects/:id/share-token', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        await dbService.removeShareToken(id, req.auth!.userId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/shared/:token', asyncHandler(async (req, res) => {
    const { token } = req.params;
    try {
        const project = await dbService.getProjectByShareToken(token);
        if (!project) return res.status(404).json({ error: 'Invalid or expired link' });
        const user = await dbService.getUserById(project.user_id);
        res.json({
            project: {
                id: project.id,
                name: project.name,
                language: project.language,
                last_updated: project.last_updated,
                thumbnail: project.thumbnail,
                author_name: user?.display_name || user?.name || 'Unknown'
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

// ─── Team Members ───
router.get('/projects/:id/team', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        const members = await dbService.getTeamMembers(req.params.id);
        res.json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/projects/:id/team', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ error: 'userId and role required' });
    if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'role must be editor or viewer' });

    try {
        await dbService.addTeamMember(req.params.id, userId, role, req.auth!.userId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.delete('/projects/:id/team/:userId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        await dbService.removeTeamMember(req.params.id, req.params.userId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/projects/:id/team/:userId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!role || !['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'role must be editor or viewer' });

    try {
        await dbService.updateTeamMemberRole(req.params.id, req.params.userId, role);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/projects/:id/access', asyncHandler(async (req, res) => {
    let userId: string | undefined;
    try {
        const token = req.cookies?.token;
        if (token) {
            const payload = await AuthService.verifyToken(token);
            if (payload) userId = payload.userId;
        }
    } catch {}

    const { accessible, role, project } = await dbService.isProjectAccessible(req.params.id, userId);

    // If project doesn't exist yet and user is logged in, allow access (new project)
    if (!project && userId) {
        return res.json({ accessible: true, role: 'owner', isPublic: false });
    }

    res.json({ accessible, role, isPublic: project?.is_public === 1 || project?.is_public === true });
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
            model: project.model,
            thumbnail: project.thumbnail || undefined
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

// ─── Bot Console (Discord bot test runner) ───
interface BotSession {
    process: ChildProcess;
    logs: string[];
    status: 'running' | 'stopped' | 'error';
    startedAt: number;
    timeout: NodeJS.Timeout;
}

const activeBotSessions = new Map<string, BotSession>();

router.post('/bot/start', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { sessionId, language, maxMinutes = 10 } = req.body;

    // Stop any existing session for this project
    if (activeBotSessions.has(sessionId)) {
        const existing = activeBotSessions.get(sessionId)!;
        existing.process.kill();
        clearTimeout(existing.timeout);
        activeBotSessions.delete(sessionId);
    }

    const sandboxRoot = process.env.SANDBOX_ROOT || path.join(os.tmpdir(), 'velix-sandbox');
    const projectDir = path.join(sandboxRoot, sessionId);

    try {
        // Read bot token from .env file in project
        const fs = require('fs');
        let botToken = '';
        const envPath = path.join(projectDir, '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const tokenMatch = envContent.match(/(?:DISCORD_TOKEN|TOKEN)\s*=\s*(.+)/i);
            if (tokenMatch) botToken = tokenMatch[1].trim().replace(/^["']|["']$/g, '');
        }

        // Also check config.json
        if (!botToken) {
            const configPath = path.join(projectDir, 'config.json');
            if (fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    botToken = config.token || config.DISCORD_TOKEN || '';
                } catch {}
            }
        }

        if (!botToken) {
            return res.status(400).json({ error: 'No bot token found. Add DISCORD_TOKEN=your_token to your .env file.' });
        }

        const logs: string[] = [];
        logs.push(`[${new Date().toISOString()}] Starting bot session...`);
        logs.push(`[${new Date().toISOString()}] Language: ${language}`);
        logs.push(`[${new Date().toISOString()}] Token loaded from .env`);
        logs.push(`[${new Date().toISOString()}] Session limit: ${maxMinutes} minutes`);

        // Determine run command based on language
        let runCmd: string;
        let runArgs: string[];
        const env = { ...process.env, DISCORD_TOKEN: botToken, TOKEN: botToken, NODE_ENV: 'production' };

        // Find node executable path on Windows
        const findNodePath = (): string => {
            if (process.platform === 'win32') {
                return process.execPath;
            }
            return 'node';
        };

        if (language === 'python' || language === 'py') {
            runCmd = 'python3';
            runArgs = ['bot.py'];
            if (!fs.existsSync(path.join(projectDir, 'bot.py'))) {
                return res.status(400).json({ error: 'bot.py not found in project' });
            }
        } else if (language === 'javascript' || language === 'js' || language === 'typescript' || language === 'ts') {
            // Install dependencies if package.json exists
            const { execSync } = require('child_process');
            try {
                if (fs.existsSync(path.join(projectDir, 'package.json'))) {
                    logs.push(`[${new Date().toISOString()}] Installing dependencies...`);
                    execSync('npm install --production', { cwd: projectDir, timeout: 60000, stdio: 'pipe' });
                }
            } catch {}

            const botFile = fs.existsSync(path.join(projectDir, 'bot.ts')) ? 'bot.ts' : 'bot.js';
            if (!fs.existsSync(path.join(projectDir, botFile))) {
                return res.status(400).json({ error: `${botFile} not found in project` });
            }

            if (botFile.endsWith('.ts')) {
                runCmd = findNodePath();
                runArgs = ['--require', 'ts-node/register', botFile];
            } else {
                runCmd = findNodePath();
                runArgs = [botFile];
            }
        } else if (language === 'ruby') {
            runCmd = 'ruby';
            runArgs = ['bot.rb'];
            if (!fs.existsSync(path.join(projectDir, 'bot.rb'))) {
                return res.status(400).json({ error: 'bot.rb not found in project' });
            }
        } else {
            runCmd = findNodePath();
            runArgs = ['bot.js'];
        }

        const child = spawn(runCmd, runArgs, {
            cwd: projectDir,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        });

        child.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            lines.forEach(line => logs.push(`[${new Date().toISOString()}] ${line}`));
        });

        child.stderr?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            lines.forEach(line => logs.push(`[${new Date().toISOString()}] [ERR] ${line}`));
        });

        child.on('close', (code) => {
            logs.push(`[${new Date().toISOString()}] Process exited with code ${code}`);
            const session = activeBotSessions.get(sessionId);
            if (session) {
                session.status = code === 0 ? 'stopped' : 'error';
            }
        });

        child.on('error', (err) => {
            logs.push(`[${new Date().toISOString()}] [ERROR] ${err.message}`);
            const session = activeBotSessions.get(sessionId);
            if (session) session.status = 'error';
        });

        // Auto-kill after maxMinutes
        const timeout = setTimeout(() => {
            logs.push(`[${new Date().toISOString()}] Session time limit reached. Stopping...`);
            child.kill();
            const session = activeBotSessions.get(sessionId);
            if (session) session.status = 'stopped';
        }, maxMinutes * 60 * 1000);

        activeBotSessions.set(sessionId, {
            process: child,
            logs,
            status: 'running',
            startedAt: Date.now(),
            timeout
        });

        res.json({ success: true, message: 'Bot started' });
    } catch (error: any) {
        console.error('[Bot Console] Start error:', error.message);
        res.status(500).json({ error: error.message });
    }
}));

router.post('/bot/stop/:sessionId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const session = activeBotSessions.get(sessionId);
    if (!session) return res.json({ success: true, message: 'No active session' });

    session.process.kill();
    clearTimeout(session.timeout);
    session.status = 'stopped';
    session.logs.push(`[${new Date().toISOString()}] Bot stopped by user`);

    // Clean up after a delay
    setTimeout(() => activeBotSessions.delete(sessionId), 60000);

    res.json({ success: true });
}));

router.get('/bot/logs/:sessionId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const session = activeBotSessions.get(sessionId);
    if (!session) return res.json({ logs: [], status: 'stopped' });

    res.json({ logs: session.logs, status: session.status });
}));

export default router;
