import fs from 'fs';
import path from 'path';
import config from '../utils/config';

export class SandboxContext {
    sessionId: string;
    rootPath: string;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
        const baseRoot = config.sandbox?.root_dir || "./sandbox_env";
        this.rootPath = path.resolve(baseRoot, sessionId);
        this.init();
    }

    private init() {
        if (!fs.existsSync(this.rootPath)) {
            fs.mkdirSync(this.rootPath, { recursive: true });
        }
    }

    writeFile(filePath: string, content: string) {
        const fullPath = path.join(this.rootPath, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content);
    }

    readFile(filePath: string): string {
        const fullPath = path.join(this.rootPath, filePath);
        return fs.readFileSync(fullPath, 'utf8');
    }

    listFiles(): string[] {
        // Simple recursive file listing
        const walk = (dir: string): string[] => {
            let results: string[] = [];
            const list = fs.readdirSync(dir);
            list.forEach((file) => {
                file = path.join(dir, file);
                const stat = fs.statSync(file);
                if (stat && stat.isDirectory()) {
                    results = results.concat(walk(file));
                } else {
                    results.push(path.relative(this.rootPath, file).replace(/\\/g, '/'));
                }
            });
            return results;
        };
        return walk(this.rootPath);
    }
    getRootDir(): string {
        return this.rootPath;
    }
}
