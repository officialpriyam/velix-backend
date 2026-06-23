import { Router } from 'express';
import { dbService } from '../services/DatabaseService';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { SandboxContext } from '../services/SandboxService';

const router = Router();
const upload = multer({ dest: 'uploads/' });

const DEPS_DIR = '_dependencies';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;

function getDepsDir(sessionId: string): string {
    const sandbox = new SandboxContext(sessionId);
    const depsDir = path.join(sandbox.rootPath, DEPS_DIR);
    if (!fs.existsSync(depsDir)) {
        fs.mkdirSync(depsDir, { recursive: true });
    }
    return depsDir;
}

router.get('/:sessionId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    try {
        const deps = await dbService.getDependencies(sessionId);
        const totalSize = deps.reduce((sum, d) => sum + (d.file_size || 0), 0);
        res.json({ dependencies: deps, totalSize, maxSize: MAX_FILE_SIZE, maxFiles: MAX_FILES });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/:sessionId/upload', asyncHandler(requireAuth), upload.single('file'), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (file.originalname.toLowerCase().endsWith('.jar') === false) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Only JAR files are allowed' });
    }

    if (file.size > MAX_FILE_SIZE) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` });
    }

    try {
        const existingDeps = await dbService.getDependencies(sessionId);
        if (existingDeps.length >= MAX_FILES) {
            fs.unlinkSync(file.path);
            return res.status(400).json({ error: `Maximum ${MAX_FILES} dependencies allowed` });
        }

        const depsDir = getDepsDir(sessionId);
        const destPath = path.join(depsDir, file.originalname);
        fs.copyFileSync(file.path, destPath);
        fs.unlinkSync(file.path);

        const dep = await dbService.addDependency(sessionId, file.originalname, file.size, destPath);
        res.json({ success: true, dependency: dep });
    } catch (error: any) {
        if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.status(500).json({ error: error.message });
    }
}));

router.delete('/:sessionId/:depId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { depId } = req.params;
    try {
        const dep = await dbService.getDependencyById(parseInt(depId));
        if (!dep) return res.status(404).json({ error: 'Dependency not found' });

        if (dep.storage_path && fs.existsSync(dep.storage_path)) {
            fs.unlinkSync(dep.storage_path);
        }

        await dbService.deleteDependency(parseInt(depId));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/:sessionId/:depId/download', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { depId } = req.params;
    try {
        const dep = await dbService.getDependencyById(parseInt(depId));
        if (!dep) return res.status(404).json({ error: 'Dependency not found' });
        if (!dep.storage_path || !fs.existsSync(dep.storage_path)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }
        res.download(dep.storage_path, dep.file_name);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.patch('/:sessionId/:depId/shade', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { depId } = req.params;
    const { isShaded } = req.body;
    try {
        const dep = await dbService.getDependencyById(parseInt(depId));
        if (!dep) return res.status(404).json({ error: 'Dependency not found' });
        await dbService.toggleDependencyShade(parseInt(depId), isShaded);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
