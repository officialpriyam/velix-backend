import axios from 'axios';
import config from '../utils/config';
import { WebSearchService } from './WebSearchService';
import { DocService } from './DocService';
import { SkillsService } from './SkillsService';


export interface GeneratedFile {
    path: string;
    content: string;
}

export interface CodeGenerationResult {
    files: GeneratedFile[];
    rawResponse: string;
    model: string;
}

/**
 * Model-specific context limits (in characters, approximation for tokens)
 * We aim for ~100k characters of context for intelligence to be safe and efficient.
 */
const MODEL_CHAR_LIMITS: { [key: string]: number } = {
    'qwen/qwen3-coder:free': 1000000,
    'openai/gpt-oss-120b:free': 131072,
    'google/gemma-4-31b-it:free': 262144,
    'nousresearch/hermes-3-llama-3.1-405b:free': 131072,
    'nvidia/nemotron-3-super-120b-a12b:free': 1000000,
    'anthropic/claude-3-5-sonnet': 150000,
    'openai/gpt-4o': 120000,
    'mistralai/mistral-large': 80000,
    'default': 60000
};

/**
 * Enhanced code generation with structured output
 */
export const generateCode = async (
    prompt: string,
    model?: string,
    context?: string,
    skipDocs: boolean = false,
    enableWebSearch: boolean = false,
    history?: Array<{ role: string; content: string }>,
    platform?: string
): Promise<CodeGenerationResult> => {
    const selectedModel = model || config.ai_models?.[0] || "openai/gpt-3.5-turbo";

    // Free fallback models ranked by coding ability
    const FREE_FALLBACK_MODELS = [
        'openai/gpt-oss-20b:free',
        'openai/gpt-oss-120b:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen3-next-80b-a3b-instruct:free',
        'google/gemma-4-26b-a4b-it:free',
        'google/gemma-4-31b-it:free',
        'nousresearch/hermes-3-llama-3.1-405b:free'
    ];

    const tryGenerate = async (modelName: string): Promise<CodeGenerationResult> => {
        const isNvidia = modelName.startsWith('nvidia/') || (config.nvidia_models && config.nvidia_models.includes(modelName));
        const endpoint = isNvidia
            ? "https://integrate.api.nvidia.com/v1/chat/completions"
            : "https://openrouter.ai/api/v1/chat/completions";
        const apiKey = isNvidia ? config.nvidia_api_key : config.openrouter_api_key;

        if (!apiKey || apiKey === "YOUR_OPENROUTER_KEY_HERE" || apiKey === "YOUR_NVIDIA_KEY_HERE") {
            throw new Error(`API Key not configured for ${modelName}`);
        }

        // Load relevant Velix documentation context based on prompt and model
        const kodariDocs = skipDocs ? "" : await loadDocumentationContext(prompt, modelName);

        // Load platform-specific skills (Hytale, Minecraft, etc.) — filtered by prompt relevance
        const skillsContext = platform ? SkillsService.getFilteredSkillsContext(platform, prompt) : '';

        // Cap context sizes to avoid exceeding model context windows
        const MAX_DOCS_CHARS = 6000;
        const MAX_SKILLS_CHARS = 4000;
        const cappedDocs = kodariDocs.length > MAX_DOCS_CHARS ? kodariDocs.slice(0, MAX_DOCS_CHARS) + '\n[... truncated ...]' : kodariDocs;
        const cappedSkills = skillsContext.length > MAX_SKILLS_CHARS ? skillsContext.slice(0, MAX_SKILLS_CHARS) + '\n[... truncated ...]' : skillsContext;
        console.log(`[AIService] Context sizes - Docs: ${cappedDocs.length}/${kodariDocs.length} chars, Skills: ${cappedSkills.length}/${skillsContext.length} chars`);

        // Enhanced system prompt for better code generation
        const isKotlin = prompt.toLowerCase().includes('kotlin') || prompt.toLowerCase().includes('.kt');
        const buildFile = isKotlin ? 'build.gradle.kts' : 'pom.xml';

        const enhancedSystemPrompt = `${context || "You are an expert full-stack architect and Minecraft systems engineer."}

DOCS (VelixDocs):
The following documentation highlights relevant patterns and signatures for the requested platform.
Use this for syntax and best practices IF it applies to the technologies requested.
IMPORTANT: For Minecraft plugins, refer to \`minecraft/core.md\` for the latest stable API versions and required repositories.

${cappedDocs}

${cappedSkills}

CRITICAL INSTRUCTIONS:
    1. Minimalist Principle: Do NOT add external dependencies, plugins, or third-party APIs (like CMI, Vault, LuckPerms, etc.) unless specifically requested by the user or absolutely essential for the specific functionality asked. Prefer standard libraries and the core platform API.
    2. Surgical Fixes: If a [PRIORITY CONTEXT] or existing file content is provided, do NOT remake the entire file structure or project. Provide surgical edits or the complete updated content of the existing files to fix the specific issues mentioned. Maintain the user's existing logic as much as possible.
    3. Generate COMPLETE, COMPILABLE code with ALL necessary files if creating a new project.
    4. Reality Check: Never generate "fake" or placeholder documentation, commands, or APIs that do not exist in the referenced documentation. If you are unsure about a specific API version or method, use the most stable one from VelixDocs.
    5. No Placeholders: Do not use placeholders like // Add logic here unless it is a minor part of a larger template.
    6. BUILD SYSTEM (CRITICAL — follow exactly based on language):
       - JAVA plugin: use ${buildFile}. NEVER generate pom.xml for Kotlin projects.
       - KOTLIN plugin: use build.gradle.kts ONLY. NEVER generate pom.xml.
       - KOTLIN projects MUST use: org.jetbrains.kotlin.jvm plugin, paper-api as compileOnly, kotlin("jvm") version "1.21.0", kotlin("paperweight") for remapping.
       - JAVA projects use pom.xml with paper-api dependency.
       - Do NOT mix build systems. If Kotlin, ONLY build.gradle.kts. If Java, ONLY pom.xml.
    7. Use proper package structures and imports.
    8. Format your response with clear file markers:
       FILE: path/to/file.ext
       \`\`\`language
       [code]
       \`\`\`
    9. JAVA VERSION: ALWAYS use Java 21 for all Minecraft plugins and Java-based projects.
    10. BANNED DEPENDENCY: NEVER use \`org.bukkit:bukkit-api\`. ALWAYS use \`paper-api\`, \`spigot-api\`, or \`folia-api\`.
    11. ZERO-ERROR POLICY: Perform a "virtual compilation" check. Ensure all imports are present and types match.
    12. HIGHLIGHTED CONTEXT: If a [PRIORITY CONTEXT] section is provided, it is the ABSOLUTE TRUTH. Logic must integrate with it.
    13. PACKAGE NAMING: Derive the Java package name from the plugin/project name, NOT generic \`com.example\`. For example, a plugin called "OneChunkPlugin" should use package \`com.onechunk\`, a plugin called "TPAPlugin" should use \`com.tpa\`, etc. The groupId in pom.xml must match the package root. Use lowercase, short, meaningful names.
    14. CODE QUALITY: Follow SOLID principles. Use proper error handling (try-catch), logging (SLF4J), and event-driven architecture. Never leave empty method bodies. Implement complete logic.
    15. FILE STRUCTURE: For Minecraft plugins, always include: MainClass.java/kt, plugin.yml (or paper-plugin.yml), config.yml if needed, build file, and any resource files.
`;

        const messages: any[] = [
            { role: "system", content: enhancedSystemPrompt }
        ];

        // Inject conversation history so AI remembers previous context
        // Cap history to avoid exceeding context window: max 10 messages, max 3000 chars total
        const MAX_HISTORY_CHARS = 3000;
        if (history && history.length > 0) {
            const trimmedHistory = history.slice(-10);
            let historyChars = 0;
            for (const msg of trimmedHistory) {
                const msgLen = msg.content.length;
                if (historyChars + msgLen > MAX_HISTORY_CHARS) break;
                historyChars += msgLen;
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content.length > 1500 ? msg.content.slice(0, 1500) + '...' : msg.content
                });
            }
            console.log(`[AIService] Injected ${messages.length - 1} history messages (${historyChars} chars)`);
        }

        // Cap the user prompt itself if it's extremely long
        const MAX_PROMPT_CHARS = 4000;
        const finalPrompt = prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) + '\n[... prompt truncated due to length ...]' : prompt;
        messages.push({ role: "user", content: finalPrompt });

        const searchTool = {
            type: "function",
            function: {
                name: "search_web",
                description: "Search the web for up-to-date documentation, API references, library versions, code examples, or troubleshooting details.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query, e.g., 'minecraft paper api player relative velocity' or 'npm discord.js fetch members'"
                        }
                    },
                    required: ["query"]
                }
            }
        };

        let response;

        if (enableWebSearch) {
            try {
                console.log(`[AIService] Web search enabled. Sending initial prompt with tool options...`);
                response = await axios.post(endpoint, {
                    model: modelName,
                    messages: messages,
                    tools: [searchTool],
                    tool_choice: "auto",
                        temperature: 0.7,
                        max_tokens: 8192
                    }, {
                        headers: {
                            "Authorization": `Bearer ${apiKey}`,
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://kodari-clone.local",
                            "X-Title": "Velix"
                        },
                        timeout: 120000
                    });

                    const choice = response.data.choices[0];
                    const message = choice?.message;

                if (message && message.tool_calls && message.tool_calls.length > 0) {
                    console.log(`[AIService] AI requested web search tool calls:`, JSON.stringify(message.tool_calls));
                    
                    // Add the assistant's message with tool calls to message history
                    messages.push(message);

                    // Execute each tool call
                    for (const toolCall of message.tool_calls) {
                        if (toolCall.function.name === 'search_web') {
                            let query = '';
                            try {
                                const args = JSON.parse(toolCall.function.arguments);
                                query = args.query;
                            } catch (err) {
                                query = toolCall.function.arguments;
                            }

                            if (query) {
                                const searchResults = await WebSearchService.searchWeb(query);
                                const searchContext = searchResults.length > 0 
                                    ? `Search Results for "${query}":\n` + searchResults.map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n---`).join('\n')
                                    : `No search results found for "${query}".`;
                                
                                messages.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    name: "search_web",
                                    content: searchContext
                                });
                            }
                        }
                    }

                    // Final call with tool execution context
                    console.log(`[AIService] Resending prompt with search results to AI...`);
                    response = await axios.post(endpoint, {
                        model: modelName,
                        messages: messages,
                        temperature: 0.7,
                        max_tokens: 8192
                    }, {
                        headers: {
                            "Authorization": `Bearer ${apiKey}`,
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://kodari-clone.local",
                            "X-Title": "Velix"
                        },
                        timeout: 120000
                    });
                }
            } catch (toolError: any) {
                console.warn(`[AIService] Tool-use failed or not supported by model:`, toolError.message);
                
                // Fallback to pre-search heuristic
                const keywords = prompt.toLowerCase()
                    .replace(/[^\w\s]/g, '')
                    .split(/\s+/)
                    .filter(k => k.length > 3 && !['create', 'plugin', 'make', 'implement', 'write', 'using', 'build', 'minecraft', 'discord', 'server'].includes(k));
                
                if (keywords.length > 0) {
                    const searchQuery = keywords.slice(0, 4).join(' ');
                    console.log(`[AIService] Fallback pre-search executing for query: "${searchQuery}"`);
                    const searchResults = await WebSearchService.searchWeb(searchQuery);
                    
                    if (searchResults.length > 0) {
                        const searchContext = `\n=== ADDITIONAL SEARCH CONTEXT ===\n${searchResults.map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n---`).join('\n')}\n`;
                        messages[0].content = messages[0].content + searchContext;
                    }
                }

                // Standard call
                // Log total request size for debugging
                const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
                console.log(`[AIService] Sending to ${modelName}: ${messages.length} messages, ~${totalChars} chars (~${Math.ceil(totalChars/4)} tokens)`);

                response = await axios.post(endpoint, {
                    model: modelName,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 8192
                }, {
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://kodari-clone.local",
                        "X-Title": "Velix"
                    },
                    timeout: 120000
                });
            }
        } else {
            // Standard call without tools
            response = await axios.post(endpoint, {
                model: modelName,
                messages: messages,
                temperature: 0.7,
                max_tokens: 8192
            }, {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://kodari-clone.local",
                    "X-Title": "Velix"
                },
                timeout: 120000
            });
        }

        const rawResponse = response.data.choices[0]?.message?.content || "";
        console.log("----------------------------------------------------------------");
        console.log("RAW AI RESPONSE START");
        console.log(rawResponse);
        console.log("RAW AI RESPONSE END");
        console.log("----------------------------------------------------------------");

        const files = parseAICodeResponse(rawResponse);
        console.log(`Parsed ${files.length} files from response`);

        return {
            files,
            rawResponse,
            model: response.data.model
        };
    };

    // Try primary model first, then fallback to free models
    try {
        return await tryGenerate(selectedModel);
    } catch (primaryError: any) {
        const errMsg = primaryError?.response?.data?.error?.message || primaryError.message || '';
        const isContextError = errMsg.includes('context_length') || errMsg.includes('maximum context') || errMsg.includes('too long');
        const isRateLimit = primaryError?.response?.status === 429 || errMsg.includes('rate limit');
        console.warn(`[AIService] Primary model ${selectedModel} failed:`, errMsg);
        if (isContextError) console.warn(`[AIService] Context length exceeded`);
        if (isRateLimit) console.warn(`[AIService] Rate limited — waiting before fallback`);

        // Rate limit: wait longer before fallback
        if (isRateLimit) {
            console.log(`[AIService] Rate limited, waiting 10s before fallback...`);
            await new Promise(r => setTimeout(r, 10000));
        }
        
        // Try fallback free models (always try, even if primary was free)
        for (const fallbackModel of FREE_FALLBACK_MODELS) {
            if (fallbackModel === selectedModel) continue; // Skip same model
            try {
                console.log(`[AIService] Waiting 3s before trying fallback model: ${fallbackModel}`);
                await new Promise(r => setTimeout(r, 3000));
                console.log(`[AIService] Trying fallback model: ${fallbackModel}`);
                const result = await tryGenerate(fallbackModel);
                console.log(`[AIService] Fallback model ${fallbackModel} succeeded`);
                return result;
            } catch (fallbackError: any) {
                const fbMsg = fallbackError?.response?.data?.error?.message || fallbackError.message || '';
                console.warn(`[AIService] Fallback model ${fallbackModel} failed:`, fbMsg);
                continue;
            }
        }

        // All models failed
        throw new Error(`All AI models failed. Last error: ${primaryError.message}`);
    }
};

/**
 * Enhance a brief prompt into a detailed specification, using platform docs and skills
 */
export const enhancePrompt = async (prompt: string, platform?: string): Promise<string> => {
    const apiKey = config.openrouter_api_key;
    if (!apiKey || apiKey === "YOUR_OPENROUTER_KEY_HERE") {
        throw new Error("OpenRouter API Key not configured");
    }

    // Gather platform context for better enhancement
    let platformContext = '';
    try {
        const codellaDocs = await DocService.getRelevantDocs(prompt);
        if (codellaDocs) platformContext += codellaDocs;
    } catch { /* ignore */ }

    try {
        const skillsCtx = platform ? SkillsService.getFilteredSkillsContext(platform, prompt) : '';
        if (skillsCtx) platformContext += '\n' + skillsCtx;
    } catch { /* ignore */ }

    const platformLabel = platform === 'minecraft' ? 'Minecraft plugin/mod' : platform === 'hytale' ? 'Hytale plugin' : platform === 'discord' ? 'Discord bot' : 'software project';

    const model = "openai/gpt-oss-20b:free";
    const systemPrompt = `You are a specialized Prompt Engineer for ${platformLabel} development.

Your task is to take a brief user request and enhance it into a highly detailed, professional specification that an AI code generator can use to produce excellent, compilable code.

RULES:
- Expand on features, architecture, file structure, and constraints
- Be specific about packages, class names, methods, and file paths
- Derive a meaningful package name from the project name (NOT generic com.example)
- Include all necessary config files (pom.xml, build.gradle.kts, plugin.yml, etc.)
- Faithfully preserve the user's original intent
- Keep it concise but information-dense
- Only return the enhanced prompt text, nothing else
- IMPORTANT: For Minecraft plugins, specify the build system:
  - Java plugins: pom.xml with paper-api
  - Kotlin plugins: build.gradle.kts with org.jetbrains.kotlin.jvm

${platformContext ? `AVAILABLE DOCUMENTATION AND SKILLS:\n${platformContext.slice(0, 3000)}\n\nUse the above docs and skills as reference when enhancing the prompt. Incorporate relevant API patterns, class names, and best practices.` : ''}

OUTPUT FORMAT for the enhanced prompt should clearly list:
1. Project name and package
2. Features list
3. File structure (list every file that needs to be created)
4. Build system configuration
5. Main class structure
6. Any config.yml or plugin.yml requirements`;

    const ENHANCE_MODELS = ['openai/gpt-oss-20b:free', 'meta-llama/llama-3.3-70b-instruct:free', 'openai/gpt-oss-120b:free'];
    
    for (let attempt = 0; attempt < ENHANCE_MODELS.length; attempt++) {
        const tryModel = ENHANCE_MODELS[attempt];
        try {
            if (attempt > 0) {
                console.log(`[AIService] Enhance retry with fallback model: ${tryModel}`);
                await new Promise(r => setTimeout(r, 3000));
            } else {
                console.log(`[AIService] Enhancing prompt for platform: ${platform || 'generic'}...`);
            }
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: tryModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2000
            }, {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://kodari.app",
                    "X-Title": "Velix AI"
                },
                timeout: 30000
            });

            const enhanced = response.data.choices[0]?.message?.content?.trim();
            if (enhanced) {
                console.log(`[AIService] Prompt enhanced successfully with ${tryModel}`);
                return enhanced;
            }
            return prompt;
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message || '';
            const isRateLimit = error.response?.status === 429 || errMsg.includes('rate limit');
            console.warn(`[AIService] Enhance attempt ${attempt + 1} failed (${tryModel}):`, errMsg);
            if (!isRateLimit) break; // Non-rate-limit error, don't retry
        }
    }
    // All enhance models failed — return original prompt
    console.warn('[AIService] All enhance models failed, using original prompt');
    return prompt;
};

/**
 * Parse AI response to extract file paths and content
 */
export const parseAICodeResponse = (response: string): GeneratedFile[] => {
    const files: GeneratedFile[] = [];

    // Pattern 1: FILE: path/to/file.ext followed by code block
    const filePattern = /FILE:\s*([^\n]+)\n```[\w]*\n([\s\S]*?)```/gi;
    let match;

    while ((match = filePattern.exec(response)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        files.push({ path, content });
    }

    // Pattern 2: **path/to/file.ext** followed by code block (alternative format)
    const altPattern = /\*\*([^\*]+)\*\*\n```[\w]*\n([\s\S]*?)```/gi;
    while ((match = altPattern.exec(response)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        if (!files.some(f => f.path === path)) {
            files.push({ path, content });
        }
    }

    // Pattern 3: Simple code blocks with filename comments
    const commentPattern = /\/\/\s*(?:File|Filename):\s*([^\n]+)\n```[\w]*\n([\s\S]*?)```/gi;
    while ((match = commentPattern.exec(response)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        if (!files.some(f => f.path === path)) {
            files.push({ path, content });
        }
    }

    // Pattern 4: Headers like "### path/to/file.ext" or "## path/to/file.ext"
    const headerPattern = /(?:^|\n)#{1,3}\s+([\w\-\.\/]+\.(?:java|kt|xml|json|gradle|kts|yml|yaml|txt|properties|py|js|ts|rb|toml|cfg))\s*\n+```[\w]*\n([\s\S]*?)```/gi;
    while ((match = headerPattern.exec(response)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        if (!files.some(f => f.path === path)) {
            files.push({ path, content });
        }
    }

    // Pattern 5: "path/to/file.ext" on its own line followed by code block
    const quotePattern = /(?:^|\n)['"]?([\w\-\.\/]+\.(?:java|kt|xml|json|gradle|kts|yml|yaml|txt|properties|py|js|ts|rb|toml|cfg))['"]?\s*\n+```[\w]*\n([\s\S]*?)```/gi;
    while ((match = quotePattern.exec(response)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        if (!files.some(f => f.path === path)) {
            files.push({ path, content });
        }
    }

    // Pattern 6: Loose "Header... codeblock" pattern (Last Resort for paths)
    if (files.length === 0) {
        const loosePattern = /(?:^|\n)([\w\-\.\/]+\.(?:java|kt|js|ts|py|html|css))\s*\n+```[\w]*\n([\s\S]*?)```/gi;
        while ((match = loosePattern.exec(response)) !== null) {
            const path = match[1].trim();
            const content = match[2].trim();
            if (!files.some(f => f.path === path)) {
                files.push({ path, content });
            }
        }
    }

    // Pattern 7: Extract ALL code blocks and try to assign meaningful names
    if (files.length === 0) {
        const allBlocks = [...response.matchAll(/```(\w+)\n([\s\S]*?)```/gi)];
        for (const block of allBlocks) {
            const lang = block[1].toLowerCase();
            const content = block[2].trim();
            if (content.length < 10) continue; // Skip tiny blocks

            let ext = 'txt';
            if (lang.includes('java')) ext = 'java';
            else if (lang.includes('kotlin') || lang.includes('kt')) ext = 'kt';
            else if (lang.includes('python') || lang.includes('py')) ext = 'py';
            else if (lang.includes('javascript') || lang.includes('js')) ext = 'js';
            else if (lang.includes('typescript') || lang.includes('ts')) ext = 'ts';
            else if (lang.includes('xml')) ext = 'xml';
            else if (lang.includes('yaml') || lang.includes('yml')) ext = 'yml';
            else if (lang.includes('json')) ext = 'json';
            else if (lang.includes('gradle')) ext = 'gradle';
            else if (lang.includes('properties')) ext = 'properties';

            // Try to infer filename from content
            let filename = '';
            // Look for class name in Java/Kotlin
            const classMatch = content.match(/(?:public\s+)?(?:class|object|interface)\s+(\w+)/);
            if (classMatch) {
                filename = classMatch[1];
            }
            // Look for package declaration
            const pkgMatch = content.match(/package\s+([\w.]+)/);
            const pkg = pkgMatch ? pkgMatch[1].replace(/\./g, '/') : '';

            if (ext === 'xml' && content.includes('<project')) filename = 'pom.xml';
            else if (ext === 'xml' && content.includes('<plugin')) filename = 'plugin.yml';
            else if (ext === 'xml' && content.includes('<configuration')) filename = 'config.yml';
            else if (ext === 'gradle' || ext === 'kts') filename = 'build.gradle.kts';
            else if (ext === 'yml' && content.includes('name:')) filename = 'plugin.yml';
            else if (ext === 'properties') filename = 'plugin.properties';
            else if (!filename && ext === 'java') filename = 'Main';
            else if (!filename && ext === 'kt') filename = 'Main';
            else if (!filename) filename = `file_${files.length}`;

            const path = pkg ? `${pkg}/${filename}.${ext}` : `${filename}.${ext}`;
            if (!files.some(f => f.path === path)) {
                files.push({ path, content });
            }
        }
    }

    return files;
};

/**
 * Validate generated code structure
 */
export const validateGeneratedCode = (files: GeneratedFile[], language: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (files.length === 0) {
        errors.push("No files were generated");
        return { valid: false, errors };
    }

    // Check for build files
    if (language === 'java') {
        const hasPom = files.some(f => f.path.includes('pom.xml'));
        if (!hasPom) {
            errors.push("Missing pom.xml for Java project");
        }
    } else if (language === 'kotlin') {
        const hasBuildFile = files.some(f => f.path.includes('build.gradle'));
        if (!hasBuildFile) {
            errors.push("Missing build.gradle.kts for Kotlin project");
        }
    }

    // Check for source files
    const hasSourceFile = files.some(f =>
        f.path.endsWith('.java') ||
        f.path.endsWith('.kt') ||
        f.path.endsWith('.js') ||
        f.path.endsWith('.py')
    );

    if (!hasSourceFile) {
        errors.push("No source code files found");
    }

    return { valid: errors.length === 0, errors };
};


/**
 * Load documentation context: Codella plugin docs from DB + local skill files
 */
async function loadDocumentationContext(prompt: string, model: string): Promise<string> {
    let context = "";

    // Load Codella approved plugin documentation
    try {
        const codellaDocs = await DocService.getRelevantDocs(prompt);
        if (codellaDocs) {
            context += codellaDocs;
        }
    } catch (error) {
        console.error('Failed to load Codella docs context:', error);
    }

    return context;
}
