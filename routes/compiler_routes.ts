import { Router } from 'express';
import axios from 'axios';
import config from '../utils/config';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

const SANDBOX_SERVICE_URL = process.env.SANDBOX_SERVICE_URL || config.sandbox_service_url || 'http://localhost:3002';
const SANDBOX_API_KEY = process.env.SANDBOX_API_KEY || config.sandbox_api_key || '';

function getSandboxHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'content-type': contentType || 'application/json'
    };
    if (SANDBOX_API_KEY) {
        headers['Authorization'] = `Bearer ${SANDBOX_API_KEY}`;
    }
    return headers;
}

console.log(`[Compiler Proxy] Sandbox service URL: ${SANDBOX_SERVICE_URL}`);
console.log(`[Compiler Proxy] API Key auth: ${SANDBOX_API_KEY ? 'ENABLED' : 'DISABLED (local mode)'}`);

router.get('/java-versions', asyncHandler(async (req, res) => {
    try {
        const response = await axios.get(`${SANDBOX_SERVICE_URL}/compile/java-versions`, {
            headers: getSandboxHeaders(),
            timeout: 10000
        });
        res.json(response.data);
    } catch (error: any) {
        res.json({
            versions: [
                { id: '21', name: 'Java 21 (LTS)', default: true },
                { id: '17', name: 'Java 17 (LTS)' },
                { id: '16', name: 'Java 16' },
                { id: '11', name: 'Java 11 (LTS)' },
                { id: '8', name: 'Java 8 (Legacy)' }
            ]
        });
    }
}));

router.all('*', asyncHandler(async (req, res) => {
    const path = req.path;
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    const targetUrl = `${SANDBOX_SERVICE_URL}/compile/${cleanPath}`;

    console.log(`[Proxy] Forwarding ${req.method} /api/compiler/${cleanPath} to ${targetUrl}`);

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            data: req.body,
            headers: getSandboxHeaders(req.headers['content-type']),
            responseType: cleanPath.startsWith('artifact') ? 'stream' : 'json'
        });

        const skipHeaders = new Set(['transfer-encoding', 'content-length', 'content-encoding', 'connection']);
        Object.entries(response.headers).forEach(([key, value]) => {
            if (value !== undefined && !skipHeaders.has(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });

        if (cleanPath.startsWith('artifact')) {
            response.data.pipe(res);
        } else {
            res.status(response.status).json(response.data);
        }
    } catch (error: any) {
        if (error.response) {
            if (cleanPath.startsWith('artifact') && error.response.data && typeof error.response.data.pipe === 'function') {
                error.response.data.pipe(res);
            } else {
                res.status(error.response.status).json(error.response.data);
            }
        } else {
            console.error('[Proxy Error]:', error.message);
            res.status(500).json({ error: error.message });
        }
    }
}));

export default router;
