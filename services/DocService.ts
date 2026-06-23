import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import vm from 'vm';
import { dbService } from './DatabaseService';

const execPromise = util.promisify(exec);
const REPO_URL = 'https://github.com/CodellaAI/codella-documentations.git';
const REPO_DIR = path.join(process.cwd(), 'codella-documentations-repo');

export interface PluginDoc {
    name: string;
    description: string;
    pluginId: string;
    systemDownloadURL?: string;
    mavenIntegration?: string;
    documentation?: string;
    [key: string]: any;
}

export class DocService {
    /**
     * Clones or pulls the Codella Documentations Git repository
     * and loads/syncs its plugin JS files into the SQLite database.
     */
    static async syncFromGitHub(): Promise<{ success: boolean; message: string; count?: number }> {
        console.log(`[DocService] Syncing from GitHub repository: ${REPO_URL}`);
        try {
            if (!fs.existsSync(REPO_DIR)) {
                // Try cloning with git first (fast/ideal)
                try {
                    await execPromise(`git clone ${REPO_URL} "${REPO_DIR}"`);
                } catch (gitErr) {
                    console.warn('[DocService] git clone failed, will try GitHub API fallback:', gitErr && (gitErr as any).message);
                    await this.fetchRepoViaGitHubApi();
                }
            } else {
                // Try pulling; if git not present or pull fails, fallback to API
                try {
                    await execPromise(`git -C "${REPO_DIR}" pull`);
                } catch (gitErr) {
                    console.warn('[DocService] git pull failed, will try GitHub API fallback:', gitErr && (gitErr as any).message);
                    await this.fetchRepoViaGitHubApi();
                }
            }

            // Sync database with plugin files
            const count = await this.loadPluginsIntoDB();
            return { success: true, message: `Successfully synced and loaded ${count} plugin documentation(s).`, count };
        } catch (error: any) {
            console.error('[DocService] Sync failed:', error.message);
            return { success: false, message: `GitHub sync failed: ${error.message}` };
        }
    }

    /**
     * Fallback: download plugin files using the GitHub contents API when git is unavailable.
     */
    private static async fetchRepoViaGitHubApi(): Promise<void> {
        const apiUrl = 'https://api.github.com/repos/CodellaAI/codella-documentations/contents/plugins';
        try {
            // ensure repo dir exists
            if (!fs.existsSync(REPO_DIR)) {
                fs.mkdirSync(REPO_DIR, { recursive: true });
            }
            const pluginsDir = path.join(REPO_DIR, 'plugins');
            if (!fs.existsSync(pluginsDir)) {
                fs.mkdirSync(pluginsDir, { recursive: true });
            }

            const res = await fetch(apiUrl, { headers: { 'User-Agent': 'Velix-DocService' } } as any);
            if (!res.ok) throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
            const items = await res.json();
            if (!Array.isArray(items)) throw new Error('Unexpected GitHub API response');

            // Download each .js file
            for (const item of items) {
                if (item && item.name && item.download_url && item.name.endsWith('.js')) {
                    try {
                        const fileRes = await fetch(item.download_url);
                        if (!fileRes.ok) {
                            console.warn('[DocService] Failed to download', item.download_url, fileRes.status);
                            continue;
                        }
                        const text = await fileRes.text();
                        const targetPath = path.join(pluginsDir, item.name);
                        fs.writeFileSync(targetPath, text, 'utf8');
                    } catch (err) {
                        console.warn('[DocService] Error fetching plugin file', item.name, (err as any).message);
                    }
                }
            }
        } catch (err: any) {
            console.error('[DocService] GitHub API fallback failed:', err && err.message);
            throw err;
        }
    }

    /**
     * Loads plugin JS files from the repository and upserts them into the SQLite database.
     */
    private static async loadPluginsIntoDB(): Promise<number> {
        const pluginsDir = path.join(REPO_DIR, 'plugins');
        if (!fs.existsSync(pluginsDir)) {
            console.warn('[DocService] Plugins directory not found in repository:', pluginsDir);
            return 0;
        }

        const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
        let count = 0;

        for (const file of files) {
            const filePath = path.join(pluginsDir, file);
            try {
                const pluginData = this.parsePluginFile(filePath);
                if (pluginData && pluginData.name && pluginData.pluginId) {
                    const docContent = this.formatDocContent(pluginData);
                    await dbService.upsertPluginDoc({
                        plugin_id: pluginData.pluginId.toLowerCase(),
                        name: pluginData.name,
                        description: pluginData.description || '',
                        docs_url: pluginData.systemDownloadURL || '',
                        content: docContent,
                        status: 'approved',
                        submitted_by: 'GitHub Sync'
                    });
                    count++;
                }
            } catch (err: any) {
                console.error(`[DocService] Failed to parse plugin file ${file}:`, err.message);
            }
        }

        return count;
    }

    /**
     * Safe VM evaluation of CommonJS plugin file
     */
    private static parsePluginFile(filePath: string): PluginDoc {
        const code = fs.readFileSync(filePath, 'utf8');
        const sandbox = {
            module: {
                exports: {} as any
            }
        };

        const context = vm.createContext(sandbox);
        const script = new vm.Script(code);
        script.runInContext(context, { timeout: 1000 });

        return sandbox.module.exports;
    }

    /**
     * Format parsed plugin fields into markdown documentation string
     */
    private static formatDocContent(plugin: PluginDoc): string {
        let doc = `# ${plugin.name}\n\n`;
        if (plugin.description) {
            doc += `**Description:** ${plugin.description}\n\n`;
        }
        if (plugin.pluginId) {
            doc += `**Plugin ID:** \`${plugin.pluginId}\`\n\n`;
        }
        if (plugin.systemDownloadURL) {
            doc += `**Download URL:** [Link](${plugin.systemDownloadURL})\n\n`;
        }
        if (plugin.mavenIntegration) {
            doc += `## Maven / Gradle Integration\n\`\`\`xml\n${plugin.mavenIntegration.trim()}\n\`\`\`\n\n`;
        }
        if (plugin.documentation) {
            doc += `## API Reference & Usage\n${plugin.documentation.trim()}\n`;
        }
        return doc;
    }

    /**
     * Retrieve relevant plugin documents based on prompt keyword search
     */
    static async getRelevantDocs(prompt: string): Promise<string> {
        const docs = await dbService.getApprovedPluginDocs();
        if (!docs || docs.length === 0) return "";

        const keywords = prompt.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(k => k.length > 3 && !['create', 'plugin', 'make', 'implement', 'write', 'using', 'build', 'minecraft', 'discord', 'server'].includes(k));

        if (keywords.length === 0) return "";

        let relevantDocsText = "";
        for (const doc of docs) {
            // Stop early if context is already large
            if (relevantDocsText.length > 12000) break;

            const pluginId = (doc.plugin_id || '').toLowerCase();
            const name = (doc.name || '').toLowerCase();
            const content = (doc.content || '').toLowerCase();

            // Simple score calculation
            let score = 0;
            if (keywords.includes(pluginId)) score += 100;
            if (keywords.includes(name)) score += 100;

            keywords.forEach(kw => {
                if (content.includes(kw)) {
                    score += 5;
                }
            });

            if (score > 20) {
                console.log(`[DocService] Found relevant plugin doc: ${doc.name} (Score: ${score})`);
                const docContent = (doc.content || '').slice(0, 4000);
                relevantDocsText += `\n=== CODELLA DOCS: ${doc.name} ===\n${docContent}\n`;
            }
        }

        return relevantDocsText;
    }
}
