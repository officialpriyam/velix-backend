import { Router } from 'express';
import { FileService } from '../services/FileService';
import { AuthService } from '../services/AuthService';
import { dbService } from '../services/DatabaseService';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Access control middleware for project files
const requireProjectAccess = asyncHandler(async (req, res, next) => {
    const sessionId = req.params.sessionId || req.body.sessionId;
    if (!sessionId) return next();

    // Extract user from cookie if present
    let userId: string | undefined;
    try {
        const token = req.cookies?.token;
        if (token) {
            const payload = await AuthService.verifyToken(token);
            if (payload) userId = payload.userId;
        }
    } catch {}

    const { accessible, role } = await dbService.isProjectAccessible(sessionId, userId);
    if (!accessible) {
        return res.status(403).json({ error: 'Access denied. This project is private.' });
    }
    // viewers can read but not write
    if (role === 'viewer' && req.method !== 'GET') {
        return res.status(403).json({ error: 'Viewers cannot modify this project.' });
    }
    (req as any).projectRole = role;
    next();
});

router.post('/save', requireProjectAccess, asyncHandler(async (req, res) => {
    const { sessionId, files } = req.body;
    if (!sessionId || !files) {
        return res.status(400).json({ error: "sessionId and files are required" });
    }
    try {
        const result = await FileService.saveFiles(sessionId, files);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/:sessionId', requireProjectAccess, asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    try {
        const files = await FileService.getFiles(sessionId);
        res.json(files);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/create', asyncHandler(async (req, res) => {
    const { sessionId, path, content } = req.body;
    try {
        await FileService.createFile(sessionId, path, content);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/folder', asyncHandler(async (req, res) => {
    const { sessionId, path } = req.body;
    try {
        await FileService.createFolder(sessionId, path);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/delete', asyncHandler(async (req, res) => {
    const { sessionId, path } = req.body;
    try {
        await FileService.deletePath(sessionId, path);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/rename', asyncHandler(async (req, res) => {
    const { sessionId, oldPath, newPath } = req.body;
    try {
        await FileService.renamePath(sessionId, oldPath, newPath);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/upload', upload.array('files'), asyncHandler(async (req, res) => {
    const { sessionId, targetPath = '' } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!sessionId || !files) {
        return res.status(400).json({ error: "sessionId and files are required" });
    }

    try {
        for (const file of files) {
            const destPath = path.join(targetPath, file.originalname);
            const content = fs.readFileSync(file.path);
            await FileService.createFile(sessionId, destPath, content.toString());
            fs.unlinkSync(file.path);
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/unzip', asyncHandler(async (req, res) => {
    const { sessionId, path } = req.body;
    try {
        const result = await FileService.unzipFile(sessionId, path);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/download/file', asyncHandler(async (req, res) => {
    const { sessionId, path: filePath } = req.query;
    if (!sessionId || !filePath) return res.status(400).send("Session ID and path required");

    try {
        const fullPath = FileService.getDownloadPath(sessionId as string, filePath as string);
        res.download(fullPath);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/download/all', asyncHandler(async (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).send("Session ID required");

    try {
        const zipBuffer = FileService.zipFolder(sessionId as string, '');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=project-${sessionId}.zip`);
        res.send(zipBuffer);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/list/all', asyncHandler(async (req, res) => {
    try {
        const token = req.cookies?.token;
        if (token) {
            const payload = await AuthService.verifyToken(token);
            if (payload) {
                const projects = await dbService.getProjectsByUserId(payload.userId);
                return res.json(projects);
            }
        }

        const sessions = await FileService.listSessions();
        res.json(sessions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
