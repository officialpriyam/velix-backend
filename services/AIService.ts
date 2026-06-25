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
    platform?: string,
    language?: string
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

    const tryGenerate = async (modelName: string, maxTokens: number = 8192): Promise<CodeGenerationResult> => {
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
        const isConfig = language?.startsWith('config-');
        const isDatapack = language?.startsWith('datapack-');
        const isScripting = language?.startsWith('scripting-');
        const buildFile = isKotlin ? 'build.gradle.kts' : 'pom.xml';

        let enhancedSystemPrompt = '';

        if (isConfig) {
            // CONFIG GENERATION MODE
            const pluginName = language?.replace('config-', '') || 'custom';
            enhancedSystemPrompt = `You are an expert Minecraft server configuration specialist. Your ONLY job is to generate COMPLETE, PRODUCTION-READY configuration files for the ${pluginName} plugin and related server files.

## OVERRIDE: THIS IS CONFIGURATION — NOT A PLUGIN
You are generating CONFIGURATION FILES for an existing Minecraft server plugin.
DO NOT generate: pom.xml, build.gradle.kts, plugin.yml, .java files, .kt files, or ANY plugin source code.
DO NOT generate: src/main/java/, org.bukkit., JavaPlugin, or ANY Java/Kotlin code.
ONLY generate: .yml, .yaml, .json, .toml, .properties, .xml configuration files.

## OUTPUT FORMAT (MANDATORY)
For EACH file, output exactly:
FILE: path/to/file.ext
\`\`\`yaml
[complete file content]
\`\`\`

Use the appropriate code fence language: yaml for .yml, json for .json, toml for .toml, properties for .properties, xml for .xml.

## CONFIG FILE RULES
1. All YAML files must be VALID YAML — correct indentation (2 spaces), proper quoting, no tabs
2. All JSON files must be VALID JSON — no trailing commas, proper escaping
3. Include EVERY setting with sensible defaults — leave nothing as placeholder
4. Add inline comments explaining non-obvious settings where appropriate
5. Group related settings under logical section headers using YAML comments
6. For EssentialsX: Include config.yml with all modules, economy, signs, kits, warps, spawn settings
7. For WorldGuard: Include config.yml with regions, flags, blacklists, session analysis
8. For LuckPerms: Include luckperms.yml with storage, groups, tracks, meta settings
9. For Paper/Purpur: Include paper.yml, spigot.yml, bukkit.yml with performance tuning
10. For Velocity: Include velocity.toml with forwarding, server list, compression, authentication

## COMMON CONFIG PATTERNS
- Use 'true'/'false' for YAML booleans (not True/False)
- Use proper YAML list syntax with '- ' prefix
- Use 'level_name: world' style for simple key-value
- Quote strings containing special characters (:, #, {, }, etc.)
- Use | for multi-line strings, > for folded strings

## RESPONSE FORMAT
- Output ONLY file blocks with FILE: header and code fences
- NO explanations, NO prose, NO markdown commentary
- EVERY file must be COMPLETE — every setting, every section
- NO placeholders, NO "add more here", NO "customize as needed"

## REFERENCE
${cappedDocs}
${cappedSkills}`;
        } else if (isDatapack) {
            // DATAPACK GENERATION MODE
            const datapackType = language?.replace('datapack-', '') || 'full';
            enhancedSystemPrompt = `You are an expert Minecraft datapack developer. Your ONLY job is to generate COMPLETE, WORKING datapacks for Minecraft 1.21.x.

## OVERRIDE: THIS IS A DATAPACK — NOT A PLUGIN
You are generating a MINECRAFT DATAPACK, NOT a Java/Kotlin plugin.
DO NOT generate: pom.xml, build.gradle.kts, plugin.yml, .java files, .kt files, or ANY plugin code.
DO NOT generate: src/main/java/, org.bukkit., JavaPlugin, or ANY Java/Kotlin code.
ONLY generate: pack.mcmeta, .mcfunction files, .json files (advancements, loot tables, recipes, predicates, tags).

## OUTPUT FORMAT (MANDATORY)
For EACH file, output exactly:
FILE: path/to/file.ext
\`\`\`json
[complete file content]
\`\`\`
or for .mcfunction files:
FILE: path/to/file.mcfunction
\`\`\`
[complete mcfunction content]
\`\`\`

## DATAPACK STRUCTURE (1.21.x)
my-datapack/
├── pack.mcmeta
└── data/
    └── <namespace>/
        ├── function/
        │   ├── load.mcfunction      (runs on /reload)
        │   └── tick.mcfunction      (runs every tick)
        ├── advancement/
        │   └── custom.json
        ├── loot_table/
        │   └── custom.json
        ├── recipe/
        │   └── custom.json
        ├── predicate/
        │   └── custom.json
        ├── item_modifier/
        │   └── custom.json
        └── tags/
            ├── block/
            │   └── custom.json
            ├── entity_type/
            │   └── custom.json
            └── function/
                ├── load.json
                └── tick.json

## PACK.MC META FORMAT
\`\`\`json
{
  "pack": {
    "pack_format": 61,
    "description": "Description of the datapack"
  }
}
\`\`\`
Use pack_format: 61 for MC 1.21.4, 57 for 1.21.2-1.21.3, 48 for 1.21-1.21.1

## MCFUNCTION RULES
- One command per line
- NO / prefix (just the command)
- # comments are allowed
- Use @a, @e, @p, @r, @s, @n selectors
- execute as/at/in/if/unless/store/run subcommands
- scoreboard objectives add/add/set/reset/operation
- schedule function namespace:func 10t
- data modify storage namespace:key ...
- tellraw @a {"text":"msg","color":"green"}
- title @a title {"text":"Title"}
- give @p diamond 1
- macro: \$parameter in definition, function namespace:func {param:"value"}

## RESPONSE FORMAT
- Output ONLY file blocks with FILE: header and code fences
- NO explanations, NO prose, NO markdown commentary
- EVERY file must be COMPLETE — complete commands, complete JSON
- NO placeholders, NO TODOs
- Use correct pack_format for target MC version

## REFERENCE
${cappedDocs}
${cappedSkills}`;
        } else if (isScripting) {
            // SCRIPTING / COMMANDS MODE
            enhancedSystemPrompt = `You are an expert Minecraft command engineer. Your ONLY job is to generate COMPLETE, WORKING command scripts for Minecraft 1.21.x.

## OVERRIDE: THIS IS COMMAND SCRIPTING — NOT A PLUGIN
You are generating MINECRAFT COMMAND SCRIPTS, NOT a Java/Kotlin plugin.
DO NOT generate: pom.xml, build.gradle.kts, plugin.yml, .java files, .kt files, or ANY plugin code.
DO NOT generate: src/main/java/, org.bukkit., JavaPlugin, or ANY Java/Kotlin code.
ONLY generate: .mcfunction files, .sh files (for RCON), .json files (for tags/function).

## OUTPUT FORMAT (MANDATORY)
For EACH file, output exactly:
FILE: path/to/file.mcfunction
\`\`\`
[complete mcfunction content]
\`\`\`

Or for shell/RCON scripts:
FILE: path/to/file.sh
\`\`\`bash
[complete script content]
\`\`\`

## MINECRAFT 1.21.x COMMANDS REFERENCE
### Execute Subcommands (all must be valid 1.21.x syntax)
- execute as @a at @s run ...
- execute as @e[type=minecraft:zombie] run ...
- execute if entity @s[scores={obj=10..}] run ...
- execute store result score @s obj run ...
- execute positioned ~ ~1 ~ run ...
- execute rotated as @s run ...

### Selectors
- @a, @e, @p, @r, @s, @n
- Arguments: type=, name=, distance=, scores=, tag=, team=, gamemode=, level=, sort=, limit=

### Scoreboards
- scoreboard objectives add obj dummy "Display Name"
- scoreboard players add @s obj 1
- scoreboard players set @s obj 0
- scoreboard players operation @a obj += @s obj
- scoreboard players reset @s obj

### Schedule & Forceload
- schedule function namespace:func 10t
- schedule function namespace:func 5s replace
- forceload add 0 0 100 100

### Title/Tellraw JSON
- title @a title {"text":"Title","color":"gold"}
- tellraw @a {"text":"Message","color":"green","bold":true}

### Macro Functions (1.20.2+)
- \$parameter in function definition
- function namespace:func {param:"value"}

## RESPONSE FORMAT
- Output ONLY file blocks with FILE: header and code fences
- NO explanations, NO prose, NO markdown commentary
- EVERY command must be valid 1.21.x syntax
- Complete scripts — no placeholders

## REFERENCE
${cappedDocs}
${cappedSkills}`;
        } else if (platform === 'discord') {
            // DISCORD BOT GENERATION MODE
            const isPython = language === 'python' || language === 'py';
            const isRuby = language === 'ruby';
            const isJs = language === 'javascript' || language === 'js';
            const isTs = language === 'typescript' || language === 'ts';
            const langLabel = isPython ? 'Python' : isRuby ? 'Ruby' : isTs ? 'TypeScript' : 'JavaScript';
            const framework = isPython ? 'discord.py' : isRuby ? 'discordrb' : 'discord.js';
            const ext = isPython ? '.py' : isRuby ? '.rb' : isTs ? '.ts' : '.js';
            const codeLang = isPython ? 'python' : isRuby ? 'ruby' : isTs ? 'typescript' : 'javascript';

            enhancedSystemPrompt = `You are an elite Discord bot developer. Your ONLY job is to generate COMPLETE, PRODUCTION-READY Discord bot code in ${langLabel} using ${framework} that runs on the FIRST attempt.

## CRITICAL: THIS IS A DISCORD BOT — NOT A MINECRAFT PLUGIN
DO NOT generate: pom.xml, build.gradle.kts, plugin.yml, .java files, .kt files, or ANY Minecraft-related code.
DO NOT generate: org.bukkit, JavaPlugin, or ANY Java/Kotlin code.
ONLY generate: ${langLabel} files for a Discord bot using ${framework}.

## ${langLabel.toUpperCase()} DISCORD BOT RULES (${framework})
${isPython ? `1. Use discord.py 2.x (pip install discord.py)
2. Main file: bot.py
3. Use commands.Bot() with proper intents
4. Include on_ready event
5. Use @bot.command() for slash or prefix commands
6. Use proper async/await patterns
7. Include requirements.txt` : isRuby ? `1. Use discordrb gem (gem install discordrb)
2. Main file: bot.rb
3. Use Discordrb::Bot.new with proper token
4. Include bot.ready event
5. Use bot.command for prefix commands
6. Include Gemfile with discordrb` : `1. Use discord.js v14 (npm install discord.js)
2. Main file: bot.${ext.replace('.', '')}
3. Use Client with proper intents (GatewayIntentBits)
4. Use Events.ClientReady for startup
5. Use SlashCommandBuilder for slash commands
6. Use proper async/await with try/catch
7. Include package.json with discord.js dependency`}

## OUTPUT FORMAT (MANDATORY — YOU MUST GENERATE ALL THESE FILES)
You MUST generate a MINIMUM of 3 files. Every bot needs these files to work.

For EACH file, output exactly:
FILE: ${isPython ? 'bot.py' : isRuby ? 'bot.rb' : 'bot.' + ext.replace('.', '')}
\`\`\`${codeLang}
[complete file content — NO placeholders, NO "your_token_here", include ALL code]
\`\`\`

FILE: .env
\`\`\`
DISCORD_TOKEN=your_bot_token_here
${isJs || isTs ? 'CLIENT_ID=your_application_client_id\n' : ''}PORT=3000
\`\`\`

${isPython ? `FILE: requirements.txt
\`\`\`
discord.py>=2.0.0
python-dotenv>=1.0.0
\`\`\`

FILE: README.md
\`\`\`markdown
# Discord Bot

## Setup
1. Create a bot at https://discord.com/developers/applications
2. Copy the bot token
3. Edit .env and replace your_bot_token_here with your token
4. Run: pip install -r requirements.txt
5. Run: python bot.py
\`\`\`` : isRuby ? `FILE: Gemfile
\`\`\`ruby
source 'https://rubygems.org'
gem 'discordrb', '~> 3.5'
\`\`\`

FILE: README.md
\`\`\`markdown
# Discord Bot

## Setup
1. Create a bot at https://discord.com/developers/applications
2. Copy the bot token
3. Edit .env and replace your_bot_token_here with your token
4. Run: bundle install
5. Run: ruby bot.rb
\`\`\`` : `FILE: package.json
\`\`\`json
{
  "name": "discord-bot",
  "version": "1.0.0",
  "main": "bot.${ext.replace('.', '')}",
  "scripts": {
    "start": "node bot.${ext.replace('.', '')}"
  },
  "dependencies": {
    "discord.js": "^14.11.0",
    "dotenv": "^16.0.0"
  }
}
\`\`\`

FILE: README.md
\`\`\`markdown
# Discord Bot

## Setup
1. Create a bot at https://discord.com/developers/applications
2. Copy the bot token and client ID
3. Edit .env and replace your_bot_token_here with your token
4. Run: npm install
5. Run: npm start
\`\`\``}

## CODE RULES
- Complete, runnable code — NO placeholders, NO TODOs, NO "add your token here"
- The bot token is ALWAYS loaded from .env via process.env.DISCORD_TOKEN — NEVER hardcode tokens
- ${isPython ? 'Use `from dotenv import load_dotenv; load_dotenv()` at the TOP of bot.py before importing discord' : isRuby ? 'Use `require "dotenv/load"` at the TOP of bot.rb before requiring discordrb' : 'Use `require("dotenv").config()` at the TOP of bot.js before requiring discord.js'}
- Include error handling (try/catch or begin/rescue)
- Include command examples and help text
- Use environment variables for bot token (process.env.DISCORD_TOKEN)
- Include proper event handlers (ready, message, interactionCreate)
- Bot MUST be fully functional and connect to Discord on first run

## RESPONSE FORMAT
- Output ONLY file blocks with FILE: header and code fences
- NO explanations, NO prose, NO markdown commentary
- EVERY file must be COMPLETE — all imports, all methods, all logic

## REFERENCE
${cappedDocs}
${cappedSkills}`;
        } else {
            // DEFAULT: CODE GENERATION MODE (plugins, mods, extensions)
            enhancedSystemPrompt = `You are an elite software engineer specializing in Minecraft server plugins and Hytale plugins. Your ONLY job is to generate COMPLETE, PRODUCTION-READY code that compiles and runs on the FIRST attempt.

## CRITICAL: COMPILE-FIRST RULES
Your code MUST compile with zero errors. Follow these rules exactly:

### For JAVA Minecraft plugins (Paper API 1.21):
1. Use pom.xml with Maven
2. groupId = package name (e.g., com.example)
3. Java 21 compiler settings
4. paper-api 1.21.11-R0.1-SNAPSHOT as compileOnly
5. Main class extends JavaPlugin
6. plugin.yml with api-version: "1.21"

### For KOTLIN Minecraft plugins:
1. Use build.gradle.kts with Gradle
2. kotlin("jvm") plugin, kotlin version "2.0.21"
3. paper-api as compileOnly
4. Main class extends JavaPlugin
5. paper-plugin.yml or plugin.yml

### For Hytale plugins:
1. Use build.gradle.kts with Gradle (preferred) or pom.xml with Maven
2. Follow Hytale modding API conventions
3. Include plugin descriptor file

## OUTPUT FORMAT (MANDATORY)
For EACH file, output exactly:
FILE: path/to/file.ext
\`\`\`java
[complete file content]
\`\`\`

## IMPORTS RULE — NON-NEGOTIABLE
Every single class, method, or type you use MUST have an import statement. Missing imports = compilation failure.
Common imports for Paper plugins:
- org.bukkit.plugin.java.JavaPlugin
- org.bukkit.command.Command
- org.bukkit.command.CommandSender
- org.bukkit.command.TabCompleter
- org.bukkit.event.Listener
- org.bukkit.event.EventHandler
- org.bukkit.event.player.PlayerEvent variants
- org.bukkit.entity.Player
- org.bukkit.Bukkit
- org.bukkit.ChatColor / net.md_5.bungee.api.ChatColor
- org.bukkit.configuration.file.FileConfiguration
- org.bukkit.scheduler.BukkitRunnable / Bukkit.getScheduler()
- org.bukkit.inventory.Inventory / InventoryView / ItemStack / Material
- org.bukkit.inventory.meta.ItemMeta
- org.bukkit.inventory.InventoryHolder

## PACKAGE NAMING
Derive from plugin name: TPAPlugin -> com.tpa, AutoFish -> com.autofish, LifeSteal -> com.lifesteal

## RESPONSE FORMAT
- Output ONLY file blocks with FILE: header and code fences
- NO explanations, NO prose, NO markdown commentary
- EVERY file must be COMPLETE — all imports, all methods, all logic
- NO placeholders, NO TODOs, NO empty method bodies
- Code must be syntactically valid Java/Kotlin with zero compilation errors

## DOCUMENTATION REFERENCE
${cappedDocs}

## SKILLS REFERENCE
${cappedSkills}`;
        }


        const messages: any[] = [
            { role: "system", content: enhancedSystemPrompt }
        ];

        // Inject conversation history so AI remembers previous context
        // Cap history to avoid exceeding context window: max 20 messages, max 6000 chars total
        const MAX_HISTORY_CHARS = 6000;
        if (history && history.length > 0) {
            const trimmedHistory = history.slice(-20);
            let historyChars = 0;
            for (const msg of trimmedHistory) {
                const msgLen = msg.content.length;
                if (historyChars + msgLen > MAX_HISTORY_CHARS) break;
                historyChars += msgLen;
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...' : msg.content
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
                    temperature: 0.4,
                    max_tokens: maxTokens
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
                    messages.push(message);

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

                    console.log(`[AIService] Resending prompt with search results to AI...`);
                    response = await axios.post(endpoint, {
                        model: modelName,
                        messages: messages,
                        temperature: 0.4,
                        max_tokens: maxTokens
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

                const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
                console.log(`[AIService] Sending to ${modelName}: ${messages.length} messages, ~${totalChars} chars (~${Math.ceil(totalChars/4)} tokens)`);

                response = await axios.post(endpoint, {
                    model: modelName,
                    messages: messages,
                    temperature: 0.4,
                    max_tokens: maxTokens
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
                temperature: 0.4,
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

    // Try primary model first, then retry with lower tokens, then fallback to free models
    try {
        return await tryGenerate(selectedModel);
    } catch (primaryError: any) {
        const errMsg = primaryError?.response?.data?.error?.message || primaryError.message || '';
        const isContextError = errMsg.includes('context_length') || errMsg.includes('maximum context') || errMsg.includes('too long');
        const isRateLimit = primaryError?.response?.status === 429 || errMsg.includes('rate limit');
        const isTokenLimit = errMsg.includes('max_tokens') || errMsg.includes('fewer max_tokens') || errMsg.includes('afford');
        console.warn(`[AIService] Primary model ${selectedModel} failed:`, errMsg);
        if (isContextError) console.warn(`[AIService] Context length exceeded`);
        if (isRateLimit) console.warn(`[AIService] Rate limited — waiting before fallback`);
        if (isTokenLimit) console.warn(`[AIService] Token limit exceeded — retrying with fewer tokens`);

        // Token limit: retry same model with lower max_tokens
        if (isTokenLimit) {
            const reducedTokens = [4096, 2048, 1024];
            for (const tokens of reducedTokens) {
                try {
                    console.log(`[AIService] Retrying ${selectedModel} with max_tokens=${tokens}`);
                    const result = await tryGenerate(selectedModel, tokens);
                    console.log(`[AIService] ${selectedModel} succeeded with max_tokens=${tokens}`);
                    return result;
                } catch (retryErr: any) {
                    const retryMsg = retryErr?.response?.data?.error?.message || retryErr.message || '';
                    console.warn(`[AIService] Retry with max_tokens=${tokens} failed:`, retryMsg);
                }
            }
        }

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
                // If fallback also fails on tokens, try with lower tokens
                if (fbMsg.includes('max_tokens') || fbMsg.includes('fewer max_tokens') || fbMsg.includes('afford')) {
                    try {
                        console.log(`[AIService] Retrying fallback ${fallbackModel} with max_tokens=2048`);
                        const result = await tryGenerate(fallbackModel, 2048);
                        console.log(`[AIService] Fallback ${fallbackModel} succeeded with max_tokens=2048`);
                        return result;
                    } catch {
                        console.warn(`[AIService] Fallback ${fallbackModel} also failed with reduced tokens`);
                    }
                }
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
export const enhancePrompt = async (prompt: string, platform?: string, language?: string): Promise<string> => {
    const apiKey = config.openrouter_api_key;
    if (!apiKey || apiKey === "YOUR_OPENROUTER_KEY_HERE") {
        throw new Error("OpenRouter API Key not configured");
    }

    // Detect fix/error requests — skip enhancement, return as-is
    const fixPatterns = /fix|error|bug|crash|compile|failed|broken|issue|debug|ModuleNotFoundError|ImportError|SyntaxError|TypeError|ReferenceError|ENOENT|Cannot find/i;
    if (fixPatterns.test(prompt) && prompt.length < 3000) {
        console.log(`[AIService] Fix request detected — skipping enhancement`);
        return prompt;
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

    // Detect generation mode from platform/language
    const isConfig = platform?.startsWith('config-') || platform?.includes('configuration') || language?.startsWith('config-');
    const isDatapack = platform?.startsWith('datapack-') || language?.startsWith('datapack-');
    const isScripting = platform?.startsWith('scripting-') || language?.startsWith('scripting-');

    let modeLabel = 'plugin/mod';
    if (isConfig) modeLabel = 'server configuration';
    else if (isDatapack) modeLabel = 'datapack';
    else if (isScripting) modeLabel = 'command scripting';
    else if (platform === 'discord') modeLabel = 'Discord bot';

    const langLabel = language === 'python' || language === 'py' ? 'Python' : language === 'ruby' ? 'Ruby' : language === 'kotlin' || language === 'kt' ? 'Kotlin' : language === 'typescript' || language === 'ts' ? 'TypeScript' : language === 'javascript' || language === 'js' ? 'JavaScript' : 'Java';

    const model = "openai/gpt-oss-20b:free";
    const systemPrompt = `You are an expert ${platformLabel} architect. Your job is to take a brief user request and transform it into a DETAILED, COMPLETE technical specification that an AI code generator can use to produce PRODUCTION-READY ${modeLabel} files on the FIRST attempt.

## OUTPUT FORMAT
Return ONLY the enhanced specification. NO commentary, NO explanations.

## SPEC STRUCTIFICATION (include ALL of these):
1. **Project Name**: A clear, descriptive name
2. **${platform === 'discord' ? 'Bot Name' : 'Package Name'}** ${platform === 'discord' ? '(Discord bot application name)' : '(for plugins only): Derived from project name (NOT com.example)'}
3. **Features List**: Every feature the ${modeLabel} must have, with brief descriptions
4. **File Structure**: List EVERY file that needs to be created with its full path:
   ${isConfig ? '- config.yml (main plugin config with ALL settings)\n   - messages.yml (localization strings)\n   - (any additional config files needed)' : isDatapack ? '- pack.mcmeta\n   - data/<namespace>/function/main.mcfunction\n   - data/<namespace>/function/tick.mcfunction\n   - data/<namespace>/tags/function/load.json\n   - data/<namespace>/tags/function/tick.json\n   - (any additional functions, advancements, loot tables, recipes, predicates)' : isScripting ? '- data/<namespace>/function/script.mcfunction\n   - (any additional .mcfunction or .sh files)' : platform === 'discord' ? (langLabel === 'Python' ? '- bot.py (main bot with ALL commands, events, error handling)\n   - .env (DISCORD_TOKEN=your_token_here)\n   - requirements.txt (discord.py, python-dotenv)\n   - README.md (setup instructions)' : langLabel === 'Ruby' ? '- bot.rb (main bot with ALL commands, events, error handling)\n   - .env (DISCORD_TOKEN=your_token_here)\n   - Gemfile (discordrb gem)\n   - README.md (setup instructions)' : '- bot.js or bot.ts (main bot with ALL commands, events, error handling)\n   - .env (DISCORD_TOKEN=your_token_here)\n   - package.json (discord.js, dotenv dependencies)\n   - README.md (setup instructions)') : (langLabel === 'Kotlin' ? '- src/main/kotlin/com/xxx/MainPlugin.kt\n   - src/main/resources/paper-plugin.yml\n   - build.gradle.kts (Kotlin MUST use Gradle, NOT pom.xml)' : '- src/main/java/com/xxx/MainPlugin.java\n   - src/main/resources/plugin.yml\n   - pom.xml (Java uses Maven)')}
5. **Build System** ${platform === 'discord' ? '(dependency file)' : '(plugins only)'}: Specify exactly:
   ${platform === 'discord' ? (langLabel === 'Python' ? '- requirements.txt with discord.py' : langLabel === 'Ruby' ? '- Gemfile with discordrb' : '- package.json with discord.js') : (langLabel === 'Kotlin' ? '- build.gradle.kts with kotlin("jvm") plugin, kotlin version "2.0.21", paper-api as compileOnly' : '- pom.xml with paper-api 1.21.11-R0.1-SNAPSHOT, Java 21')}
6. **Configuration Options** ${platform === 'discord' ? '(bot settings)' : '(for config mode)'}: List ALL config options with types, defaults, and descriptions
7. **Commands** (if applicable): List all commands with usage, descriptions, and permissions

## RULES
- Be SPECIFIC about file names, setting names, command syntax, config keys
- Include actual config keys / command syntax from the documentation if available
- Ensure the file structure is COMPLETE — every file needed
- ${platform === 'discord' ? 'DISCORD BOT RULES: You MUST include .env file with DISCORD_TOKEN=your_token_here. You MUST include README.md with setup instructions. The bot code MUST use dotenv to load the token from .env.' : ''}
- Keep it concise but comprehensive — this spec will be fed to a code generator

${platformContext ? `\n\nAVAILABLE DOCUMENTATION AND SKILLS:\n${platformContext.slice(0, 3000)}\n\nUse the above docs and skills as reference when enhancing the prompt. Incorporate relevant API patterns, config keys, and best practices.` : ''}`;

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
                temperature: 0.4,
                max_tokens: 3000
            }, {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://kodari.app",
                    "X-Title": "Velix AI"
                },
                timeout: 45000
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

    // Sanitize: remove markdown prose blocks that aren't code
    // Remove lines that are just explanations between file blocks
    const cleanResponse = response
        .replace(/```[\w]*\n\s*(?:This\s+(?:file|class|code|implementation)|Here\s+(?:is|are)|The\s+(?:above|following)|Note:|Important:|Summary:)[\s\S]*?```/gi, '')
        .trim();

    // Pattern 1: FILE: path/to/file.ext followed by code block
    const filePattern = /FILE:\s*([^\n]+)\n```[\w]*\n([\s\S]*?)```/gi;
    let match;

    while ((match = filePattern.exec(cleanResponse)) !== null) {
        const path = match[1].trim().replace(/^["']|["']$/g, '');
        const content = match[2].trim();
        if (content.length > 5 && !files.some(f => f.path === path)) {
            files.push({ path, content });
        }
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

    // Filter out invalid files (no extension, "error", "none", etc.)
    const validExtensions = /\.(java|kt|xml|json|gradle|kts|yml|yaml|txt|properties|py|js|ts|rb|toml|cfg|html|css|sh|mcfunction|env|lock)$/i;
    const validFiles = files.filter(f => {
        const name = f.path.split('/').pop() || '';
        if (['error', 'none', 'undefined', 'null', 'true', 'false'].includes(name.toLowerCase())) return false;
        if (!validExtensions.test(f.path)) return false;
        if (f.content.length < 5) return false;
        return true;
    });

    return validFiles.length > 0 ? validFiles : files;
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
