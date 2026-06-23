import fs from 'fs';
import path from 'path';

export interface LanguagePlugin {
    id: string;
    name: string;
    fileExtension: string;
    defaultFileStructure: string[];
    compilerCommands: {
        install?: string;  // Optional dependency installation command
        compile: string;
        run: string;
    };
    systemPrompt: string;
}

class PluginManager {
    private plugins: Map<string, LanguagePlugin> = new Map();

    constructor() {
        this.loadDefaultPlugins();
    }

    private loadDefaultPlugins() {
        const pluginsDir = path.join(__dirname, '../plugins');
        if (!fs.existsSync(pluginsDir)) return;

        const pluginFolders = fs.readdirSync(pluginsDir);
        for (const folder of pluginFolders) {
            const configPath = path.join(pluginsDir, folder, 'plugin.json');
            if (fs.existsSync(configPath)) {
                try {
                    const pluginData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    this.plugins.set(pluginData.id, pluginData);
                    console.log(`Loaded plugin: ${pluginData.name}`);
                } catch (e) {
                    console.error(`Failed to load plugin from ${configPath}`, e);
                }
            }
        }
    }


    getPlugin(id: string): LanguagePlugin | undefined {
        const plugin = this.plugins.get(id);
        if (plugin) return plugin;

        // Check if ID is a language within a plugin
        for (const p of this.plugins.values()) {
            if ((p as any).languages) {
                const lang = (p as any).languages.find((l: any) => l.id === id);
                if (lang) {
                    return {
                        ...p,
                        id: lang.id,
                        name: lang.name,
                        fileExtension: lang.file_extension,
                        compilerCommands: lang.compilerCommands || p.compilerCommands
                    };
                }
            }
        }
        return undefined;
    }

    getAllPlugins(): LanguagePlugin[] {
        return Array.from(this.plugins.values());
    }
}

export const pluginManager = new PluginManager();
