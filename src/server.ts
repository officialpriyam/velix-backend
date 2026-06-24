import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

app.disable('x-powered-by');

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
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(cookieParser());

// Request logger with IP and details
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

app.use('/api/ai', aiRoutes);
app.use('/api/compiler', compilerRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
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
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
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
