import { Router } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth';
import { dbService } from '../services/DatabaseService';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const ASPECT_RATIOS: Record<string, { width: number; height: number; label: string }> = {
    '1:1':   { width: 1024, height: 1024, label: 'Square' },
    '3:2':   { width: 1216, height: 832, label: 'Landscape' },
    '4:3':   { width: 1152, height: 864, label: 'Landscape' },
    '5:4':   { width: 1120, height: 896, label: 'Landscape' },
    '16:9':  { width: 1344, height: 768, label: 'Landscape' },
    '21:9':  { width: 1536, height: 672, label: 'Cinematic' },
    '2:3':   { width: 832, height: 1216, label: 'Portrait' },
    '3:4':   { width: 864, height: 1152, label: 'Portrait' },
    '4:5':   { width: 896, height: 1088, label: 'Portrait' },
    '9:16':  { width: 768, height: 1344, label: 'Portrait' },
};

async function generateWithGemini(prompt: string): Promise<string> {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_API_KEY}`,
        {
            contents: [{ parts: [{ text: `Generate an image based on this description: ${prompt}` }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        },
        { timeout: 60000 }
    );

    const parts = response.data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        if (part.inlineData?.data) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
    }
    throw new Error('Gemini did not return an image');
}

async function generateWithNvidia(prompt: string, width: number, height: number): Promise<string> {
    if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not configured');

    const response = await axios.post(
        'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl',
        {
            text_prompts: [{ text: prompt, weight: 1 }],
            cfg_scale: 7,
            sampler: 'K_EULER_ANCESTRAL',
            steps: 30,
            seed: Math.floor(Math.random() * 2147483647),
            width: Math.min(width, 1024),
            height: Math.min(height, 1024)
        },
        {
            headers: {
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 60000
        }
    );

    const artifacts = response.data?.artifacts;
    if (artifacts && artifacts[0]?.base64) {
        return `data:image/png;base64,${artifacts[0].base64}`;
    }

    const imageData = response.data?.output?.[0]?.b64_json || response.data?.data?.[0]?.b64_json;
    if (imageData) {
        return `data:image/png;base64,${imageData}`;
    }

    throw new Error('NVIDIA did not return an image');
}

async function generateWithPollinations(prompt: string, width: number, height: number): Promise<string> {
    const seed = Math.floor(Math.random() * 999999);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

    const response = await axios.get(url, {
        timeout: 120000,
        responseType: 'arraybuffer'
    });

    if (response.data && response.status === 200) {
        const base64 = Buffer.from(response.data).toString('base64');
        return `data:image/png;base64,${base64}`;
    }

    throw new Error('Pollinations did not return an image');
}

router.post('/generate', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { prompt, aspectRatio = '1:1', provider = 'auto' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const user = req.auth!.user;
    if (user.credits < 3) {
        return res.status(402).json({ error: 'Insufficient credits. Image generation requires 3 credits.' });
    }

    const ratio = ASPECT_RATIOS[aspectRatio] || ASPECT_RATIOS['1:1'];

    try {
        let imageUrl: string;
        let usedProvider = provider;

        // Try providers in order: selected -> fallback chain
        const attempts: Array<{ name: string; fn: () => Promise<string> }> = [];

        if (provider === 'gemini' && GEMINI_API_KEY) {
            attempts.push({ name: 'gemini', fn: () => generateWithGemini(prompt) });
        }
        if (provider === 'nvidia' && NVIDIA_API_KEY) {
            attempts.push({ name: 'nvidia', fn: () => generateWithNvidia(prompt, ratio.width, ratio.height) });
        }

        // Fallback chain if auto or all selected fail
        if (attempts.length === 0 || provider === 'auto') {
            attempts.length = 0;
            if (GEMINI_API_KEY) attempts.push({ name: 'gemini', fn: () => generateWithGemini(prompt) });
            if (NVIDIA_API_KEY) attempts.push({ name: 'nvidia', fn: () => generateWithNvidia(prompt, ratio.width, ratio.height) });
            attempts.push({ name: 'pollinations', fn: () => generateWithPollinations(prompt, ratio.width, ratio.height) });
        }

        // Always have pollinations as last resort
        if (!attempts.find(a => a.name === 'pollinations')) {
            attempts.push({ name: 'pollinations', fn: () => generateWithPollinations(prompt, ratio.width, ratio.height) });
        }

        let lastError: Error | null = null;
        for (const attempt of attempts) {
            try {
                console.log(`[ImageGen] Trying ${attempt.name}...`);
                imageUrl = await attempt.fn();
                usedProvider = attempt.name;
                console.log(`[ImageGen] Success with ${attempt.name}`);
                break;
            } catch (err: any) {
                console.warn(`[ImageGen] ${attempt.name} failed:`, err.message);
                lastError = err;
                continue;
            }
        }

        if (!imageUrl!) {
            throw lastError || new Error('All image providers failed');
        }

        await dbService.deductCredits(req.auth!.userId, 3, 'image_gen', `Generated image: ${prompt.slice(0, 80)}`);
        const updatedUser = await dbService.getUserById(req.auth!.userId);

        res.json({
            imageUrl,
            provider: usedProvider,
            aspectRatio,
            creditsUsed: 3,
            creditsRemaining: updatedUser.credits
        });
    } catch (error: any) {
        console.error('[ImageGen] Error:', error.message);
        res.status(500).json({ error: error.message || 'Image generation failed' });
    }
}));

router.get('/ratios', (_req, res) => {
    const ratios = Object.entries(ASPECT_RATIOS).map(([key, val]) => ({
        id: key,
        ...val
    }));
    res.json(ratios);
});

export default router;
