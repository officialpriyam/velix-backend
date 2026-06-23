import axios from 'axios';

const LANGUAGE_PROMPTS: Record<string, string> = {
    'java': 'Minecraft Java plugin icon, dark server rack with glowing purple enchantment table symbols, floating code brackets, obsidian texture, dramatic lighting',
    'kotlin': 'Minecraft Kotlin plugin icon, modern server block with electric blue energy arcs, floating code symbols, dark tech aesthetic, neon glow',
    'config-essentialsx': 'Minecraft EssentialsX configuration icon, golden compass rose with gear mechanisms, warm amber glow, dark wood background',
    'config-worldguard': 'Minecraft WorldGuard shield icon, crystalline blue force field dome, protective magic circles, dark fortress walls',
    'config-luckperms': 'Minecraft LuckPerms permission icon, golden crown with floating rank badges, royal purple aura, dark throne room',
    'config-worldedit': 'Minecraft WorldEdit wand icon, glowing wooden wand with selection particles, terrain manipulation magic, blocky landscape',
    'config-coreprotect': 'Minecraft CoreProtect log icon, magnifying glass over oak wood logs, forest green glow, detective theme',
    'config-multiverse': 'Minecraft Multiverse portal icon, swirling purple nether portal with multiple world dimensions, cosmic background',
    'config-paper': 'Minecraft Paper server icon, floating paper sheets with performance graphs, speed lines, modern minimal design',
    'config-purpur': 'Minecraft Purpur server icon, floating purpur blocks with end crystal energy, purple end stone aesthetic',
    'config-velocity': 'Minecraft Velocity proxy icon, lightning-fast speed trails, blue motion blur, modern networking aesthetic',
    'config-citizens': 'Minecraft Citizens NPC icon, silhouette of villager characters with speech bubbles, town square scene',
    'config-holographicsdisplays': 'Minecraft HolographicDisplays icon, floating holographic text above head, neon cyan glow, ethereal effect',
    'datapack-full': 'Minecraft datapack icon, floating command blocks with golden gear mechanisms, redstone circuit patterns, dark tech workshop',
    'datapack-functions': 'Minecraft function icon, scrolling mcfunction files with green code terminal, dark screen glow, hacker aesthetic',
    'datapack-advancements': 'Minecraft advancement icon, golden trophy with fireworks and star particles, celebration theme, dark background',
    'datapack-loottables': 'Minecraft loot table icon, treasure chest overflowing with enchanted items, golden glow, dungeon setting',
    'datapack-worldgen': 'Minecraft world generation icon, procedural terrain being carved by magical forces, biome colors, dramatic landscape',
    'datapack-tags': 'Minecraft tag filter icon, floating diamond shapes with filter patterns, sorting particles, abstract minimal design',
    'scripting-commandblocks': 'Minecraft command block icon, chain of command blocks activating in sequence, redstone脉冲, blue particles',
    'scripting-macros': 'Minecraft macro icon, floating script scrolls with variable symbols, magical automation, dark arcane library',
    'scripting-scheduled': 'Minecraft scheduled task icon, clock mechanism with rotating gears, time particles, dark workshop background',
    'forge-java': 'Minecraft Forge mod icon, anvil and forge with glowing molten metal, orange fire glow, blacksmith workshop',
    'fabric-java': 'Minecraft Fabric mod icon, woven thread patterns forming block shapes, teal and white minimal, modern loom',
    'hytale': 'Hytale game plugin icon, fantasy medieval sword and shield, warm torchlight, stone dungeon walls',
    'python': 'Python bot icon, coiled snake made of glowing circuit traces, dark motherboard background, tech aesthetic',
    'javascript': 'JavaScript bot icon, golden JS badge floating above digital landscape, modern web aesthetic, dark theme',
    'typescript': 'TypeScript bot icon, blue TS shield with type annotations floating, modern IDE aesthetic, dark code theme',
    'ruby': 'Ruby gem icon, faceted red gemstone with light refractions, dark velvet background, luxury aesthetic',
};

function getThumbnailPrompt(language: string, projectName: string): string {
    const basePrompt = LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS['java'];
    return `${basePrompt}, professional game server icon, 4k detail, cinematic lighting, dark background`;
}

export async function generateProjectThumbnail(language: string, projectName: string): Promise<string | null> {
    try {
        const prompt = getThumbnailPrompt(language, projectName);
        const seed = Math.floor(Math.random() * 999999);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true`;

        const response = await axios.get(url, {
            timeout: 30000,
            responseType: 'arraybuffer'
        });

        if (response.data && response.status === 200) {
            const base64 = Buffer.from(response.data).toString('base64');
            return `data:image/png;base64,${base64}`;
        }

        return null;
    } catch (error: any) {
        console.warn('[Thumbnail] Generation failed:', error.message);
        return null;
    }
}
