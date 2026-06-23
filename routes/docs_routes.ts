import { Router } from 'express';
import { dbService } from '../services/DatabaseService';
import { DocService } from '../services/DocService';
import { AuthService } from '../services/AuthService';
import { requireAdminApiKey } from '../middleware/adminApiKeyAuth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.post('/submit', asyncHandler(async (req, res) => {
    const { name, docsUrl } = req.body;
    const token = req.cookies?.token;
    
    if (!name || !docsUrl) {
        return res.status(400).json({ error: "Plugin name and documentation URL are required" });
    }

    let submittedBy = 'Anonymous';
    if (token) {
        const payload = await AuthService.verifyToken(token);
        if (payload) {
            const user = await dbService.getUserById(payload.userId);
            if (user) {
                submittedBy = user.email || user.name || payload.userId;
            } else {
                submittedBy = payload.userId;
            }
        }
    }

    try {
        await dbService.addDocSubmission(name, docsUrl, submittedBy);
        res.json({ success: true, message: "We'll review and add it within 2 minutes!" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/plugins', asyncHandler(async (req, res) => {
    try {
        const docs = await dbService.getApprovedPluginDocs();
        const cleanDocs = docs.map(d => ({
            id: d.id,
            name: d.name,
            plugin_id: d.plugin_id,
            description: d.description,
            docs_url: d.docs_url,
            created_at: d.created_at,
            approved_at: d.approved_at
        }));
        res.json(cleanDocs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/submissions', requireAdminApiKey, asyncHandler(async (req, res) => {
    try {
        const submissions = await dbService.getPendingSubmissions();
        res.json(submissions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/approve/:id', requireAdminApiKey, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { pluginId, name, docsUrl, description, mavenIntegration, documentation } = req.body;

    try {
        let submission;
        if (id === 'manual' || id === '0') {
            submission = {
                name: name || 'Manual Plugin',
                docs_url: docsUrl || '',
                submitted_by: 'Admin'
            };
        } else {
            submission = await dbService.getSubmissionById(parseInt(id));
            if (!submission) {
                return res.status(404).json({ error: "Submission not found" });
            }
        }

        const pId = pluginId || submission.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        let content = `# ${submission.name}\n\n`;
        if (description || submission.description) {
            content += `**Description:** ${description || submission.description}\n\n`;
        }
        content += `**Plugin ID:** \`${pId}\`\n\n`;
        content += `**Docs URL:** ${submission.docs_url}\n\n`;
        if (mavenIntegration) {
            content += `## Integration\n\`\`\`xml\n${mavenIntegration}\n\`\`\`\n\n`;
        }
        if (documentation) {
            content += `## Documentation\n${documentation}\n`;
        }

        await dbService.upsertPluginDoc({
            plugin_id: pId,
            name: submission.name,
            description: description || '',
            docs_url: submission.docs_url,
            content: content,
            status: 'approved',
            submitted_by: submission.submitted_by
        });

        if (id !== 'manual' && id !== '0') {
            await dbService.updateSubmissionStatus(parseInt(id), 'approved');
        }

        res.json({ success: true, message: "Plugin doc saved successfully!" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/reject/:id', requireAdminApiKey, asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        await dbService.updateSubmissionStatus(parseInt(id), 'rejected');
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.post('/sync', requireAdminApiKey, asyncHandler(async (req, res) => {
    try {
        const syncResult = await DocService.syncFromGitHub();
        res.json(syncResult);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
