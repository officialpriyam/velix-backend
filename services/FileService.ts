import fs from 'fs';
import path from 'path';
import { SandboxContext } from './SandboxService';
import config from '../utils/config';

export class FileService {
    static async saveFiles(sessionId: string, files: { [path: string]: string }) {
        const sandbox = new SandboxContext(sessionId);
        for (const [filePath, content] of Object.entries(files)) {
            sandbox.writeFile(filePath, content);
        }
        return { success: true, files: Object.keys(files) };
    }

    static async getFiles(sessionId: string) {
        const sandbox = new SandboxContext(sessionId);
        const filePaths = sandbox.listFiles();

        // Patterns to hide
        const hidePatterns = [
            'target/',
            '.git/',
            'node_modules/',
            '.DS_Store',
            '.idea/',
            '.vscode/',
            'build/'
        ];

        const files: { [path: string]: string } = {};
        for (const filePath of filePaths) {
            const shouldHide = hidePatterns.some(pattern =>
                filePath.startsWith(pattern) || filePath.includes('/' + pattern)
            );

            if (!shouldHide) {
                files[filePath] = sandbox.readFile(filePath);
            }
        }
        return files;
    }

    static async createFile(sessionId: string, filePath: string, content: string = '') {
        const sandbox = new SandboxContext(sessionId);
        sandbox.writeFile(filePath, content);
        return { success: true };
    }

    static async createFolder(sessionId: string, folderPath: string) {
        const sandbox = new SandboxContext(sessionId);
        // SandboxContext might need a specific method for folders, or we treat paths transparently
        // Assuming writeFile handles directory creation or we need to access underlying fs
        const fullPath = path.join(sandbox.getRootDir(), folderPath);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        return { success: true };
    }

    static async deletePath(sessionId: string, targetPath: string) {
        const sandbox = new SandboxContext(sessionId);
        const fullPath = path.join(sandbox.getRootDir(), targetPath);
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            return { success: true };
        }
        throw new Error(`Path not found: ${targetPath}`);
    }

    static async renamePath(sessionId: string, oldPath: string, newPath: string) {
        const sandbox = new SandboxContext(sessionId);
        const fullOldPath = path.join(sandbox.getRootDir(), oldPath);
        const fullNewPath = path.join(sandbox.getRootDir(), newPath);

        if (fs.existsSync(fullOldPath)) {
            // Ensure parent dir exists for new path
            const newDir = path.dirname(fullNewPath);
            if (!fs.existsSync(newDir)) {
                fs.mkdirSync(newDir, { recursive: true });
            }
            fs.renameSync(fullOldPath, fullNewPath);
            return { success: true };
        }
        throw new Error(`Path not found: ${oldPath}`);
    }

    static async listSessions() {
        const baseRoot = config.sandbox?.root_dir || "./sandbox_env";
        const rootPath = path.resolve(process.cwd(), baseRoot);

        if (!fs.existsSync(rootPath)) {
            return [];
        }

        try {
            const dirs = fs.readdirSync(rootPath).filter(file => {
                return fs.statSync(path.join(rootPath, file)).isDirectory();
            });

            // Return some meta info if possible
            return dirs.map(id => ({
                id,
                name: id, // For now name is same as ID
                lastUpdated: fs.statSync(path.join(rootPath, id)).mtime
            }));
        } catch (err) {
            console.error('Failed to list sessions:', err);
            return [];
        }
    }

    static zipFolder(sessionId: string, folderPath: string) {
        const sandbox = new SandboxContext(sessionId);
        const fullPath = path.join(sandbox.getRootDir(), folderPath);
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        zip.addLocalFolder(fullPath);
        return zip.toBuffer();
    }

    static unzipFile(sessionId: string, zipPath: string) {
        const sandbox = new SandboxContext(sessionId);
        const fullZipPath = path.join(sandbox.getRootDir(), zipPath);
        const extractPath = path.dirname(fullZipPath);
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(fullZipPath);
        zip.extractAllTo(extractPath, true);
        return { success: true };
    }

    static getDownloadPath(sessionId: string, filePath: string) {
        const sandbox = new SandboxContext(sessionId);
        return path.join(sandbox.getRootDir(), filePath);
    }
}
