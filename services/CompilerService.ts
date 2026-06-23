import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import config from '../utils/config';
import { pluginManager } from './PluginManager';
import { dbService } from './DatabaseService';
import { SandboxContext } from './SandboxService';

const execPromise = util.promisify(exec);

export interface CompilationResult {
    success: boolean;
    log: string;
    stages: {
        dependencyInstall?: StageResult;
        compilation?: StageResult;
        execution?: StageResult;
    };
}

interface StageResult {
    success: boolean;
    stdout: string;
    stderr: string;
    duration: number;
}

/**
 * Enhanced compilation service with dependency installation and better error handling
 */
export const compileAndRun = async (languageId: string, sessionId: string): Promise<CompilationResult> => {
    const plugin = pluginManager.getPlugin(languageId);
    if (!plugin) throw new Error(`Plugin not found: ${languageId}`);

    const sandbox = new SandboxContext(sessionId);
    const result: CompilationResult = {
        success: false,
        log: '',
        stages: {}
    };

    console.log(`[Compiler] Starting compilation for ${languageId} in session ${sessionId}`);

    try {
        const validationErrors = validateProjectStructure(sandbox, languageId);
        if (validationErrors.length > 0) {
            result.log = `Pre-compilation validation failed:\n${validationErrors.join('\n')}`;
            await dbService.addCompileHistory(sessionId, false, result.log);
            return result;
        }

        const commands = plugin.compilerCommands;

        if (commands.install) {
            result.stages.dependencyInstall = await executeCommand(commands.install, sandbox.rootPath, 120000);
            if (!result.stages.dependencyInstall.success) {
                result.log = formatStageOutput('Dependency Installation', result.stages.dependencyInstall);
                await dbService.addCompileHistory(sessionId, false, result.log);
                return result;
            }
        }

        if (commands.compile) {
            result.stages.compilation = await executeCommand(commands.compile, sandbox.rootPath, 60000);
            if (!result.stages.compilation.success) {
                result.log = formatStageOutput('Compilation', result.stages.compilation);
                await dbService.addCompileHistory(sessionId, false, result.log);
                return result;
            }
        }

        let artifactPath: string | undefined;

        // Try to find artifact on success
        if (result.stages.compilation?.success || (!commands.compile && result.stages.dependencyInstall?.success)) {
            artifactPath = findArtifact(sandbox.rootPath);
        }

        if (commands.run) {
            result.stages.execution = await executeCommand(commands.run, sandbox.rootPath, 60000);
            result.success = result.stages.execution.success;
            result.log = formatAllStages(result.stages);
        } else {
            result.success = true;
            result.log = formatAllStages(result.stages);
        }

        await dbService.addCompileHistory(sessionId, result.success, result.log, artifactPath);
        return result;

    } catch (error: any) {
        result.log = `Unexpected error: ${error.message}`;
        await dbService.addCompileHistory(sessionId, false, result.log);
        return result;
    }
};

function findArtifact(rootPath: string): string | undefined {
    const searchDirs = ['target', 'build/libs', 'dist', 'bin', 'out'];
    for (const dir of searchDirs) {
        const fullDir = path.join(rootPath, dir);
        if (fs.existsSync(fullDir)) {
            const files = fs.readdirSync(fullDir, { recursive: true }) as string[];
            // Look for .jar, .zip, .exe, .js (if bundled)
            const artifacts = files.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.jar', '.zip', '.war', '.ear'].includes(ext);
            });
            if (artifacts.length > 0) {
                // Sort by mod time or just take the first
                return path.join(dir, artifacts[0]);
            }
        }
    }
    return undefined;
}

const executeCommand = (command: string, cwd: string, timeout: number): Promise<StageResult> => {
    const startTime = Date.now();
    return new Promise((resolve) => {
        exec(command, { cwd, timeout, maxBuffer: 1024 * 1000 }, (error, stdout, stderr) => {
            resolve({
                success: !error,
                stdout: stdout || '',
                stderr: stderr || (error ? error.message : ''),
                duration: Date.now() - startTime
            });
        });
    });
};

function validateProjectStructure(sandbox: SandboxContext, languageId: string): string[] {
    const errors: string[] = [];
    const files = sandbox.listFiles();
    if (files.length === 0) return ['No files found'];

    if (languageId === 'java' && !files.some(f => f.includes('pom.xml'))) errors.push('Missing pom.xml');

    return errors;
}

function formatStageOutput(stageName: string, stage: StageResult): string {
    return `=== ${stageName} ===\nStatus: ${stage.success ? 'SUCCESS' : 'FAILED'}\n${stage.stdout}\n${stage.stderr}\n`;
}

function formatAllStages(stages: CompilationResult['stages']): string {
    let output = '';
    if (stages.dependencyInstall) output += formatStageOutput('Install', stages.dependencyInstall);
    if (stages.compilation) output += formatStageOutput('Compile', stages.compilation);
    if (stages.execution) output += formatStageOutput('Run', stages.execution);
    return output;
}
