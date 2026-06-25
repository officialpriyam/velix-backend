import { generateCode, validateGeneratedCode, GeneratedFile } from './AIService';
import { FileService } from './FileService';
import { compileAndRun } from './CompilerService';
import { pluginManager } from './PluginManager';
import { SandboxContext } from './SandboxService';

export interface CodeGenerationRequest {
    prompt: string;
    language: string;
    model?: string;
    autoCompile?: boolean;
    enableWebSearch?: boolean;
}

export interface CodeGenerationResponse {
    sessionId: string;
    files: GeneratedFile[];
    compilationResult?: {
        success: boolean;
        log: string;
    };
    errors?: string[];
}

/**
 * Orchestrates the full code generation pipeline:
 * AI Generation → File Saving → Compilation → Execution
 */
export class CodeGenerationService {

    /**
     * Generate complete project with AI
     */
    static async generateProject(request: CodeGenerationRequest): Promise<CodeGenerationResponse> {
        const { prompt, language, model, autoCompile = false, enableWebSearch = false } = request;

        // Get language plugin
        const plugin = pluginManager.getPlugin(language);
        if (!plugin) {
            throw new Error(`Unsupported language: ${language}`);
        }

        // Generate session ID
        const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        console.log(`[CodeGen] Starting generation for session ${sessionId}, language: ${language}`);

        try {
            // Step 1: Generate code with AI
            const aiResult = await generateCode(prompt, model, plugin.systemPrompt, false, enableWebSearch);
            console.log(`[CodeGen] AI generated ${aiResult.files.length} files`);

            // Step 2: Validate generated code
            const validation = validateGeneratedCode(aiResult.files, language);
            if (!validation.valid) {
                console.warn(`[CodeGen] Validation warnings:`, validation.errors);
            }

            // Step 3: Ensure build files exist
            const filesWithBuildConfig = await this.ensureBuildFiles(aiResult.files, language, plugin);

            // Step 4: Save files to sandbox
            const sandbox = new SandboxContext(sessionId);
            for (const file of filesWithBuildConfig) {
                console.log(`[CodeGen] Writing file: ${file.path}`);
                sandbox.writeFile(file.path, file.content);
            }

            const response: CodeGenerationResponse = {
                sessionId,
                files: filesWithBuildConfig,
                errors: validation.valid ? undefined : validation.errors
            };

            // Step 5: Auto-compile if requested
            if (autoCompile) {
                console.log(`[CodeGen] Auto-compiling project...`);
                try {
                    const compilationResult = await compileAndRun(language, sessionId);
                    response.compilationResult = compilationResult;
                    console.log(`[CodeGen] Compilation ${compilationResult.success ? 'succeeded' : 'failed'}`);
                } catch (error: any) {
                    response.compilationResult = {
                        success: false,
                        log: error.message
                    };
                }
            }

            return response;

        } catch (error: any) {
            console.error(`[CodeGen] Error:`, error.message);
            throw error;
        }
    }

    /**
     * Ensure build configuration files exist
     */
    private static async ensureBuildFiles(
        files: GeneratedFile[],
        language: string,
        plugin: any
    ): Promise<GeneratedFile[]> {
        const result = [...files];

        if (language === 'java') {
            // Check if this is a Hytale plugin
            if (plugin?.id === 'hytale') {
                const hasManifest = files.some(f => f.path.includes('hytale.json'));
                if (!hasManifest) {
                    console.log(`[CodeGen] Adding default hytale.json`);
                    result.push({
                        path: 'hytale.json',
                        content: this.getDefaultHytaleManifest()
                    });
                }
                const hasBuild = files.some(f => f.path.includes('build.gradle.kts'));
                if (!hasBuild) {
                    console.log(`[CodeGen] Adding default Hytale build.gradle.kts`);
                    result.push({
                        path: 'build.gradle.kts',
                        content: this.getDefaultHytaleBuild()
                    });
                }
            } else {
                // Standard Java
                const hasPom = files.some(f => f.path.includes('pom.xml'));
                if (!hasPom) {
                    console.log(`[CodeGen] Adding default pom.xml`);
                    result.push({
                        path: 'pom.xml',
                        content: this.getDefaultPomXml()
                    });
                }
            }
        } else if (language === 'kotlin') {
            const hasBuildFile = files.some(f => f.path.includes('build.gradle'));
            if (!hasBuildFile) {
                console.log(`[CodeGen] Adding default build.gradle.kts`);
                result.push({
                    path: 'build.gradle.kts',
                    content: this.getDefaultGradleBuild()
                });
            }
        } else if (language === 'python') {
            const hasRequirements = files.some(f => f.path.includes('requirements.txt'));
            if (!hasRequirements) {
                console.log(`[CodeGen] Adding default requirements.txt`);
                result.push({
                    path: 'requirements.txt',
                    content: this.getDefaultRequirementsTxt()
                });
            }
        } else if (language === 'javascript') {
            const hasPackageJson = files.some(f => f.path.includes('package.json'));
            if (!hasPackageJson) {
                console.log(`[CodeGen] Adding default package.json`);
                result.push({
                    path: 'package.json',
                    content: this.getDefaultPackageJson('javascript')
                });
            }
        } else if (language === 'typescript') {
            const hasPackageJson = files.some(f => f.path.includes('package.json'));
            if (!hasPackageJson) {
                console.log(`[CodeGen] Adding default package.json`);
                result.push({
                    path: 'package.json',
                    content: this.getDefaultPackageJson('typescript')
                });
            }
            const hasTsConfig = files.some(f => f.path.includes('tsconfig.json'));
            if (!hasTsConfig) {
                console.log(`[CodeGen] Adding default tsconfig.json`);
                result.push({
                    path: 'tsconfig.json',
                    content: this.getDefaultTsConfig()
                });
            }
        } else if (language === 'ruby') {
            const hasGemfile = files.some(f => f.path.includes('Gemfile'));
            if (!hasGemfile) {
                console.log(`[CodeGen] Adding default Gemfile`);
                result.push({
                    path: 'Gemfile',
                    content: this.getDefaultGemfile()
                });
            }
        }

        return result;
    }

    /**
     * Default pom.xml template
     */
    private static getDefaultPomXml(): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.velix</groupId>
    <artifactId>generated-project</artifactId>
    <version>1.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <build>
        <plugins>
            <plugin>
                <groupId>org.codehaus.mojo</groupId>
                <artifactId>exec-maven-plugin</artifactId>
                <version>3.1.0</version>
                <configuration>
                    <mainClass>Main</mainClass>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;
    }

    /**
     * Default build.gradle.kts template
     */
    private static getDefaultGradleBuild(): string {
        return `plugins {
    kotlin("jvm") version "1.9.0"
    application
}

group = "com.velix"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

dependencies {
    implementation(kotlin("stdlib"))
}

application {
    mainClass.set("MainKt")
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions.jvmTarget = "17"
}`;
    }

    private static getDefaultRequirementsTxt(): string {
        return `discord.py>=2.0.0
python-dotenv
aiohttp
`;
    }

    private static getDefaultPackageJson(language: 'javascript' | 'typescript'): string {
        const isTs = language === 'typescript';
        return JSON.stringify({
            name: "generated-discord-bot",
            version: "1.0.0",
            main: isTs ? "index.ts" : "index.js",
            scripts: {
                start: isTs ? "ts-node index.ts" : "node index.js"
            },
            dependencies: {
                "discord.js": "^14.11.0",
                "dotenv": "^16.0.3"
            },
            devDependencies: isTs ? {
                "ts-node": "^10.9.1",
                "typescript": "^5.0.4",
                "@types/node": "^18.15.11"
            } : {}
        }, null, 2);
    }

    private static getDefaultTsConfig(): string {
        return JSON.stringify({
            compilerOptions: {
                target: "ES2022",
                module: "commonjs",
                rootDir: "./",
                outDir: "./dist",
                esModuleInterop: true,
                forceConsistentCasingInFileNames: true,
                strict: true,
                skipLibCheck: true
            }
        }, null, 2);
    }

    private static getDefaultGemfile(): string {
        return `source 'https://rubygems.org'

gem 'discordrb'
gem 'dotenv'
`;
    }

    private static getDefaultHytaleManifest(): string {
        return JSON.stringify({
            "Group": "com.velix",
            "Name": "GeneratedPlugin",
            "Authors": [{ "Name": "VelixUser" }],
            "Version": "1.0.0",
            "Main": "com.velix.Main",
            "ServerVersion": "*"
        }, null, 2);
    }

    private static getDefaultHytaleBuild(): string {
        return `plugins {
    id("java")
}

group = "com.velix"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

dependencies {
    // Hytale Server Dependency
    // Ensure HytaleServer.jar is in the 'libs' folder of your project root
    implementation(files("libs/HytaleServer.jar"))
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    sourceCompatibility = "21"
    targetCompatibility = "21"
}
`;
    }
}
