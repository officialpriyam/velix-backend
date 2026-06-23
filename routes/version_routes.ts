import { Router } from 'express';
import { dbService } from '../services/DatabaseService';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { SandboxContext } from '../services/SandboxService';
import { FileService } from '../services/FileService';

const router = Router();

router.get('/stats/:sessionId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    try {
        const stats = await dbService.getVersionsStats(sessionId);
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/:sessionId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { type } = req.query;
    try {
        const versions = await dbService.getVersions(sessionId);
        const filtered = type && type !== 'all'
            ? versions.filter(v => v.commit_type === type)
            : versions;
        res.json(filtered);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/detail/:versionId', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { versionId } = req.params;
    try {
        const version = await dbService.getVersionById(parseInt(versionId));
        if (!version) return res.status(404).json({ error: 'Version not found' });
        let files = {};
        try {
            files = typeof version.files_snapshot === 'string'
                ? JSON.parse(version.files_snapshot)
                : version.files_snapshot;
        } catch { files = {}; }
        res.json({ ...version, files_snapshot: files });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/:sessionId/:versionId/restore', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { sessionId, versionId } = req.params;
    try {
        const version = await dbService.getVersionById(parseInt(versionId));
        if (!version) return res.status(404).json({ error: 'Version not found' });

        let files: Record<string, string> = {};
        try {
            files = typeof version.files_snapshot === 'string'
                ? JSON.parse(version.files_snapshot)
                : version.files_snapshot;
        } catch { files = {}; }

        await FileService.saveFiles(sessionId, files);

        const fileList = Object.keys(files);
        await dbService.createVersion(
            sessionId,
            'user',
            files,
            fileList,
            `Restored from version #${versionId}`
        );

        res.json({ success: true, files });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
