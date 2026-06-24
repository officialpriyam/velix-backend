import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import yaml from 'yaml';
import path from 'path';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = process.env.PORT || 3001;

// Wrap async middleware to catch rejected promises — Express 4 does NOT
// do this natively, so unhandled async errors would return HTML "Internal
// Server Error" instead of JSON.
const asyncHandler = (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) =>
        Promise.resolve(fn(req, res, next)).catch(next);

// ─── SECURITY HEADERS (helmet) ───
app.use(helmet({
    contentSecurityPolicy: false, // Handled by Next.js frontend
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
}));

// Disable x-powered-by (redundant with helmet but belt-and-suspenders)
app.disable('x-powered-by');

// ─── CORS ───
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
            .split(',')
            .map(value => value.trim().replace(/\/+$/, ''))
            .filter(Boolean);
        const normalizedOrigin = origin?.replace(/\/+$/, '');
        if (!origin || allowedOrigins.includes(normalizedOrigin || '')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// ─── RATE LIMITING ───
// Global rate limit: 200 requests per minute per IP
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
    keyGenerator: (req) => {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.headers['x-real-ip'] as string
            || req.socket?.remoteAddress
            || 'unknown';
    }
});

// Auth rate limit: 10 requests per minute per IP (prevents brute force)
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts. Please try again later." },
    keyGenerator: (req) => {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.headers['x-real-ip'] as string
            || req.socket?.remoteAddress
            || 'unknown';
    }
});

// AI generation rate limit: 20 requests per minute per IP
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many generation requests. Please slow down." },
    keyGenerator: (req) => {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.headers['x-real-ip'] as string
            || req.socket?.remoteAddress
            || 'unknown';
    }
});

// Compiler rate limit: 10 requests per minute per IP
const compilerLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many compile requests. Please slow down." },
    keyGenerator: (req) => {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.headers['x-real-ip'] as string
            || req.socket?.remoteAddress
            || 'unknown';
    }
});

app.use(globalLimiter);

// ─── BODY PARSING ───
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(cookieParser());

// ─── REQUEST LOGGER WITH IP ───
app.use((req, res, next) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] as string || req.headers['x-real-ip'] as string || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '-';
    const origin = req.headers['origin'] || req.headers['referer'] || '-';

    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : status >= 300 ? '\x1b[36m' : '\x1b[32m';
        const reset = '\x1b[0m';
        console.log(`[${new Date().toISOString()}] ${statusColor}${status}${reset} ${req.method} ${req.url} | IP: ${ip} | ${duration}ms | Origin: ${origin}`);
    });

    next();
});

// ─── INPUT SANITIZATION MIDDLEWARE ───
app.use((req, res, next) => {
    // Strip null bytes from body (prevents null byte injection)
    if (req.body && typeof req.body === 'object') {
        const sanitize = (obj: any): void => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = obj[key].replace(/\0/g, '');
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitize(obj[key]);
                }
            }
        };
        sanitize(req.body);
    }
    next();
});

// Load Config
const configPath = path.join(__dirname, '../config.yml');
let config: any;
try {
    const file = fs.readFileSync(configPath, 'utf8');
    config = yaml.parse(file);
    console.log('Configuration loaded.');
} catch (e) {
    console.warn('Warning: config.yml not found or invalid.');
}

// Basic Route
app.get('/', (req, res) => {
    res.send('Velix Backend is running (v1.9)  ');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

import aiRoutes from '../routes/ai_routes';
import compilerRoutes from '../routes/compiler_routes';
import fileRoutes from '../routes/file_routes';
import authRoutes from '../routes/auth_routes';
import adminRoutes from '../routes/admin_routes';
import docsRoutes from '../routes/docs_routes';
import versionRoutes from '../routes/version_routes';
import dependencyRoutes from '../routes/dependency_routes';
import wikiRoutes from '../routes/wiki_routes';
import imageRoutes from '../routes/image_routes';
import modelgenRoutes from '../routes/modelgen_routes';
import gitbookRoutes from '../routes/gitbook_routes';

// Apply rate limiters to specific routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/compiler', compilerLimiter, compilerRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', authLimiter, adminRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/dependencies', dependencyRoutes);
app.use('/api/wiki', wikiRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/modelgen', modelgenRoutes);
app.use('/api/gitbook', gitbookRoutes);

// Global error handler — always return JSON, never HTML
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Server] Unhandled error:', err);
    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error');
    res.status(err.status || 500).json({ error: message });
});



const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
