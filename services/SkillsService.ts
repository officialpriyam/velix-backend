import fs from 'fs';
import path from 'path';

export interface SkillContent {
    name: string;
    description: string;
    content: string;
}

const SKILLS_DIR = path.join(__dirname, '../skills');

function loadSkillsFromDisk(platform: string): SkillContent[] {
    const platformDir = path.join(SKILLS_DIR, platform);
    if (!fs.existsSync(platformDir)) {
        console.warn(`[SkillsService] Skills directory not found: ${platformDir}`);
        return [];
    }

    const skills: SkillContent[] = [];
    const dirs = fs.readdirSync(platformDir, { withFileTypes: true }).filter(d => d.isDirectory());

    for (const dir of dirs) {
        const skillFile = path.join(platformDir, dir.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;

        try {
            const raw = fs.readFileSync(skillFile, 'utf8');
            let name = dir.name;
            let description = '';
            let content = raw;

            const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
            if (frontmatterMatch) {
                const fm = frontmatterMatch[1];
                content = frontmatterMatch[2].trim();
                const nameMatch = fm.match(/^name:\s*(.+)$/m);
                const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
                if (nameMatch) name = nameMatch[1].trim();
                if (descMatch) description = descMatch[1].trim();
            }

            skills.push({ name, description, content });
        } catch (err: any) {
            console.warn(`[SkillsService] Failed to load skill ${dir.name}: ${err.message}`);
        }
    }

    return skills;
}

const minecraftSkills = loadSkillsFromDisk('minecraft');
const hytaleSkills = loadSkillsFromDisk('hytale');

console.log(`[SkillsService] Loaded ${minecraftSkills.length} Minecraft skills, ${hytaleSkills.length} Hytale skills`);

export class SkillsService {
    static getSkillsForPlatform(platform: string): SkillContent[] {
        switch (platform) {
            case 'hytale': return hytaleSkills;
            case 'minecraft': return minecraftSkills;
            default: return [];
        }
    }

    static getSkillsContext(platform: string): string {
        const skills = this.getSkillsForPlatform(platform);
        if (skills.length === 0) return '';

        // Return all skills — they'll be sliced by the caller based on token budget
        const skillSections = skills.map(skill => `
### ${skill.name}
${skill.description}

${skill.content}
`).join('\n---\n');

        return `
=== PLATFORM-SPECIFIC SKILLS ===
The following skills contain authoritative patterns and examples for ${platform} development.
Use these as reference when generating code. Follow the patterns exactly.

${skillSections}
=== END PLATFORM-SPECIFIC SKILLS ===
`;
    }

    static getFilteredSkillsContext(platform: string, prompt: string): string {
        const skills = this.getSkillsForPlatform(platform);
        if (skills.length === 0) return '';

        const promptLower = prompt.toLowerCase();
        const promptWords = promptLower.split(/\s+/).filter(w => w.length > 3);

        // Score each skill by keyword relevance
        const scored = skills.map(skill => {
            let score = 0;
            const nameLower = skill.name.toLowerCase();
            const descLower = skill.description.toLowerCase();
            const contentLower = skill.content.toLowerCase();

            for (const word of promptWords) {
                if (nameLower.includes(word)) score += 20;
                if (descLower.includes(word)) score += 10;
                if (contentLower.includes(word)) score += 5;
            }

            // Always include core/common skills
            if (['event-listener', 'commands', 'configuration', 'config', 'plugin-yml', 'scheduler', 'dependencies'].some(k => nameLower.includes(k))) {
                score += 15;
            }

            return { skill, score };
        });

        // Sort by score, take top 6 most relevant
        const relevant = scored
            .filter(s => s.score > 5)
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(s => s.skill);

        if (relevant.length === 0) return '';

        const skillSections = relevant.map(skill => `
### ${skill.name}
${skill.description}

${skill.content}
`).join('\n---\n');

        return `
=== PLATFORM-SPECIFIC SKILLS (Top ${relevant.length} most relevant) ===
The following skills contain authoritative patterns and examples for ${platform} development.
Use these as reference when generating code. Follow the patterns exactly.

${skillSections}
=== END PLATFORM-SPECIFIC SKILLS ===
`;
    }

    static getSkill(name: string): SkillContent | undefined {
        return [...hytaleSkills, ...minecraftSkills].find(s => s.name === name);
    }

    static reload(): void {
        (minecraftSkills as any).length = 0;
        (hytaleSkills as any).length = 0;
        minecraftSkills.push(...loadSkillsFromDisk('minecraft'));
        hytaleSkills.push(...loadSkillsFromDisk('hytale'));
        console.log(`[SkillsService] Reloaded: ${minecraftSkills.length} Minecraft, ${hytaleSkills.length} Hytale`);
    }
}
