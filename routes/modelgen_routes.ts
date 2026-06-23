import { Router } from 'express';
import axios from 'axios';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { requireAuth } from '../middleware/auth';
import { dbService } from '../services/DatabaseService';
import { asyncHandler } from '../middleware/asyncHandler';
import { postProcessSchematic } from '../services/ModelGenPostProcessing';

const nbt = require('prismarine-nbt');

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const BUCKET_NAME = 'schematics';

const LOCAL_SCHEMATICS_DIR = path.join(__dirname, '..', '..', 'schematics');
if (!fs.existsSync(LOCAL_SCHEMATICS_DIR)) fs.mkdirSync(LOCAL_SCHEMATICS_DIR, { recursive: true });

let storageMode: 'supabase' | 'local' = SUPABASE_URL ? 'supabase' : 'local';

async function uploadToStorage(fileName: string, buffer: Buffer): Promise<string> {
    // Always write locally as backup
    fs.writeFileSync(path.join(LOCAL_SCHEMATICS_DIR, fileName), buffer);

    if (storageMode === 'local') {
        return fileName;
    }
    try {
        const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${fileName}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/octet-stream',
                'x-upsert': 'true'
            },
            body: new Uint8Array(buffer)
        });
        if (!res.ok) {
            const err = await res.text();
            if (err.includes('Bucket not found')) {
                console.warn('[ModelGen] Supabase bucket not found, using local storage');
                storageMode = 'local';
            }
        }
    } catch (err: any) {
        console.warn(`[ModelGen] Supabase upload failed: ${err.message}, using local storage`);
        storageMode = 'local';
    }
    return fileName;
}

async function deleteFromStorage(fileName: string): Promise<void> {
    if (storageMode === 'local') {
        const fp = path.join(LOCAL_SCHEMATICS_DIR, fileName);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        return;
    }
    try {
        const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${fileName}`;
        await fetch(url, {
            method: 'DELETE',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        });
    } catch {
        const fp = path.join(LOCAL_SCHEMATICS_DIR, fileName);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
}

function getDownloadUrl(fileName: string): string {
    if (storageMode === 'local') {
        return `/api/modelgen/local/${fileName}`;
    }
    return `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET_NAME}/${fileName}?token=${SUPABASE_KEY}`;
}

const EXAMPLE_PROMPTS = [
    'A cozy wooden cottage with a stone chimney',
    'A futuristic neon tower with glass walls',
    'A medieval castle with four towers and a drawbridge',
    'A small Japanese shrine surrounded by cherry trees'
];

const BLOCK_PALETTE: Record<string, number> = {
    'air': 0, 'stone': 1, 'cobblestone': 2, 'stone_bricks': 3, 'sandstone': 4,
    'spruce_log': 5, 'stripped_spruce_log': 6, 'spruce_planks': 7,
    'spruce_stairs': 8, 'spruce_slab': 9, 'dark_oak_log': 10,
    'stripped_dark_oak_log': 11, 'dark_oak_planks': 12, 'dark_oak_stairs': 13,
    'dark_oak_slab': 14, 'glass': 15, 'oak_planks': 16, 'oak_log': 17,
    'bricks': 18, 'smooth_stone': 19, 'iron_block': 20, 'gold_block': 21,
    'diamond_block': 22, 'emerald_block': 23, 'coal_block': 24, 'hay_block': 25,
    'grass_block': 26, 'dirt': 27, 'gravel': 28, 'andesite': 29,
    'diorite': 30, 'granite': 31, 'mossy_cobblestone': 32, 'mossy_stone_bricks': 33,
    'cracked_stone_bricks': 34, 'chiseled_stone_bricks': 35, 'deepslate': 36,
    'cobbled_deepslate': 37, 'polished_deepslate': 38, 'netherrack': 39,
    'soul_sand': 40, 'obsidian': 41, 'crying_obsidian': 42, 'glowstone': 43,
    'shroomlight': 44, 'warped_planks': 45, 'crimson_planks': 46,
    'warped_stem': 47, 'crimson_stem': 48, 'black_concrete': 49,
    'white_concrete': 50, 'gray_concrete': 51, 'light_gray_concrete': 52,
    'red_concrete': 53, 'blue_concrete': 54, 'green_concrete': 55,
    'yellow_concrete': 56, 'orange_concrete': 57, 'purple_concrete': 58,
    'pink_concrete': 59, 'cyan_concrete': 60, 'lime_concrete': 61,
    'brown_concrete': 62, 'magenta_concrete': 63, 'light_blue_concrete': 64,
    'terracotta': 65, 'white_terracotta': 66, 'orange_terracotta': 67,
    'magenta_terracotta': 68, 'light_blue_terracotta': 69, 'yellow_terracotta': 70,
    'lime_terracotta': 71, 'pink_terracotta': 72, 'gray_terracotta': 73,
    'light_gray_terracotta': 74, 'cyan_terracotta': 75, 'purple_terracotta': 76,
    'blue_terracotta': 77, 'brown_terracotta': 78, 'green_terracotta': 79,
    'red_terracotta': 80, 'black_terracotta': 81, 'water': 82, 'lava': 83,
    'oak_fence': 84, 'spruce_fence': 85, 'dark_oak_fence': 86,
    'oak_stairs': 87, 'oak_slab': 88, 'oak_door': 89, 'oak_trapdoor': 90,
    'crafting_table': 91, 'furnace': 92, 'chest': 93, 'barrel': 94,
    'lantern': 95, 'soul_lantern': 96, 'torch': 97, 'wall_torch': 98,
    'oak_sign': 99, 'flower_pot': 100, 'oak_leaves': 101, 'spruce_leaves': 102,
    'dark_oak_leaves': 103, 'snow_block': 104, 'packed_ice': 105,
    'blue_ice': 106, 'coral_block': 107, 'sea_lantern': 108,
    'prismarine': 109, 'prismarine_bricks': 110, 'dark_prismarine': 111,
    'quartz_block': 112, 'quartz_bricks': 113, 'quartz_pillar': 114,
    'nether_bricks': 115, 'red_nether_bricks': 116, 'end_stone': 117,
    'purpur_block': 118, 'purpur_pillar': 119, 'obsidian_pillar': 120,
    'bookshelf': 121, 'lectern': 122, 'loom': 123, 'cartography_table': 124,
    'smithing_table': 125, 'stonecutter': 126, 'anvil': 127
};

const BLOCK_NAMES_LIST = Object.keys(BLOCK_PALETTE).filter(b => b !== 'air').join(', ');

const MC_BLOCK_NAMES: Record<string, string> = {
    'air': 'minecraft:air', 'stone': 'minecraft:stone', 'cobblestone': 'minecraft:cobblestone',
    'stone_bricks': 'minecraft:stone_bricks', 'sandstone': 'minecraft:sandstone',
    'spruce_log': 'minecraft:spruce_log[axis=y]', 'stripped_spruce_log': 'minecraft:stripped_spruce_log[axis=y]',
    'spruce_planks': 'minecraft:spruce_planks', 'oak_planks': 'minecraft:oak_planks',
    'oak_log': 'minecraft:oak_log[axis=y]', 'bricks': 'minecraft:bricks',
    'smooth_stone': 'minecraft:smooth_stone', 'glass': 'minecraft:glass',
    'dark_oak_log': 'minecraft:dark_oak_log[axis=y]', 'dark_oak_planks': 'minecraft:dark_oak_planks',
    'mossy_cobblestone': 'minecraft:mossy_cobblestone',
    'netherrack': 'minecraft:netherrack', 'obsidian': 'minecraft:obsidian',
    'glowstone': 'minecraft:glowstone', 'oak_fence': 'minecraft:oak_fence',
    'oak_stairs': 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]',
    'oak_slab': 'minecraft:oak_slab[type=bottom,waterlogged=false]',
    'oak_leaves': 'minecraft:oak_leaves[persistent=true]', 'spruce_leaves': 'minecraft:spruce_leaves[persistent=true]',
    'dark_oak_leaves': 'minecraft:dark_oak_leaves[persistent=true]',
    'black_concrete': 'minecraft:black_concrete', 'white_concrete': 'minecraft:white_concrete',
    'gray_concrete': 'minecraft:gray_concrete', 'red_concrete': 'minecraft:red_concrete',
    'blue_concrete': 'minecraft:blue_concrete', 'green_concrete': 'minecraft:green_concrete',
    'yellow_concrete': 'minecraft:yellow_concrete', 'terracotta': 'minecraft:terracotta',
    'quartz_block': 'minecraft:quartz_block', 'nether_bricks': 'minecraft:nether_bricks',
    'end_stone': 'minecraft:end_stone', 'bookshelf': 'minecraft:bookshelf',
    'lantern': 'minecraft:lantern[hanging=false]', 'soul_lantern': 'minecraft:soul_lantern[hanging=false]',
    'torch': 'minecraft:torch', 'chest': 'minecraft:chest[facing=north]',
    'furnace': 'minecraft:furnace[facing=north]', 'crafting_table': 'minecraft:crafting_table',
    'prismarine': 'minecraft:prismarine', 'sea_lantern': 'minecraft:sea_lantern',
    'snow_block': 'minecraft:snow_block', 'dirt': 'minecraft:dirt',
    'grass_block': 'minecraft:grass_block', 'gravel': 'minecraft:gravel',
    'andesite': 'minecraft:andesite', 'diorite': 'minecraft:diorite', 'granite': 'minecraft:granite',
    'deepslate': 'minecraft:deepslate', 'iron_block': 'minecraft:iron_block',
    'gold_block': 'minecraft:gold_block', 'diamond_block': 'minecraft:diamond_block',
    'emerald_block': 'minecraft:emerald_block', 'coal_block': 'minecraft:coal_block',
    'red_nether_bricks': 'minecraft:red_nether_bricks', 'crimson_planks': 'minecraft:crimson_planks',
    'warped_planks': 'minecraft:warped_planks', 'soul_sand': 'minecraft:soul_sand',
    'packed_ice': 'minecraft:packed_ice', 'blue_ice': 'minecraft:blue_ice',
    'warped_stem': 'minecraft:warped_stem[axis=y]', 'crimson_stem': 'minecraft:crimson_stem[axis=y]',
    'crying_obsidian': 'minecraft:crying_obsidian', 'shroomlight': 'minecraft:shroomlight',
    'barrel': 'minecraft:barrel[facing=up]', 'hay_block': 'minecraft:hay_block[axis=y]',
};

type Grid3D = number[][][];

interface BuildInstruction {
    action: 'fill' | 'place' | 'hollow_box' | 'pillar' | 'floor';
    x1: number; y1: number; z1: number;
    x2?: number; y2?: number; z2?: number;
    block: string;
}

function emptyGrid(): Grid3D {
    return Array.from({ length: 16 }, () =>
        Array.from({ length: 16 }, () => new Array(16).fill(0))
    );
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function fillGrid(grid: Grid3D, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockId: number) {
    const sx = clamp(Math.min(x1, x2), 0, 15);
    const sy = clamp(Math.min(y1, y2), 0, 15);
    const sz = clamp(Math.min(z1, z2), 0, 15);
    const ex = clamp(Math.max(x1, x2), 0, 15);
    const ey = clamp(Math.max(y1, y2), 0, 15);
    const ez = clamp(Math.max(z1, z2), 0, 15);
    for (let y = sy; y <= ey; y++) {
        for (let z = sz; z <= ez; z++) {
            for (let x = sx; x <= ex; x++) {
                grid[y][z][x] = blockId;
            }
        }
    }
}

function hollowBox(grid: Grid3D, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockId: number) {
    const sx = clamp(Math.min(x1, x2), 0, 15);
    const sy = clamp(Math.min(y1, y2), 0, 15);
    const sz = clamp(Math.min(z1, z2), 0, 15);
    const ex = clamp(Math.max(x1, x2), 0, 15);
    const ey = clamp(Math.max(y1, y2), 0, 15);
    const ez = clamp(Math.max(z1, z2), 0, 15);
    for (let y = sy; y <= ey; y++) {
        for (let z = sz; z <= ez; z++) {
            for (let x = sx; x <= ex; x++) {
                const isShell = x === sx || x === ex || z === sz || z === ez || y === sy || y === ey;
                if (isShell) grid[y][z][x] = blockId;
            }
        }
    }
}

function executeInstructions(instructions: BuildInstruction[]): Grid3D {
    const grid = emptyGrid();
    for (const inst of instructions) {
        const blockId = BLOCK_PALETTE[inst.block];
        if (blockId === undefined || blockId === 0) continue;

        switch (inst.action) {
            case 'fill':
            case 'floor':
                fillGrid(grid, inst.x1, inst.y1, inst.z1, inst.x2 ?? inst.x1, inst.y2 ?? inst.y1, inst.z2 ?? inst.z1, blockId);
                break;
            case 'hollow_box':
                hollowBox(grid, inst.x1, inst.y1, inst.z1, inst.x2 ?? inst.x1, inst.y2 ?? inst.y1, inst.z2 ?? inst.z1, blockId);
                break;
            case 'place':
                grid[clamp(inst.y1, 0, 15)][clamp(inst.z1, 0, 15)][clamp(inst.x1, 0, 15)] = blockId;
                break;
            case 'pillar':
                const ex = inst.x2 ?? inst.x1;
                const ez = inst.z2 ?? inst.z1;
                fillGrid(grid, inst.x1, inst.y1, inst.z1, ex, 15, ez, blockId);
                break;
        }
    }
    return grid;
}

function validateGrid(grid: Grid3D): { valid: boolean; filledBlocks: number; totalBlocks: number; fillPercent: number } {
    let filledBlocks = 0;
    const totalBlocks = 16 * 16 * 16;
    for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                if (grid[y][z][x] !== 0) filledBlocks++;
            }
        }
    }
    const fillPercent = (filledBlocks / totalBlocks) * 100;
    return { valid: filledBlocks >= 50, filledBlocks, totalBlocks, fillPercent };
}

function enhanceGrid(grid: Grid3D): Grid3D {
    const result = grid.map(layer => layer.map(row => [...row]));
    let highestBlock = 0;
    let highestY = 0;

    for (let y = 15; y >= 0; y--) {
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                if (result[y][z][x] !== 0) {
                    if (y > highestY) { highestY = y; highestBlock = result[y][z][x]; }
                }
            }
        }
    }

    const hasFloor = (() => {
        let floorCount = 0;
        for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) {
            if (result[0][z][x] !== 0) floorCount++;
        }
        return floorCount > 50;
    })();

    const hasWalls = (() => {
        let wallCount = 0;
        for (let y = 1; y <= highestY; y++) {
            if (result[y][1] && result[y][1][1] !== 0) wallCount++;
            if (result[y][14] && result[y][14][1] !== 0) wallCount++;
        }
        return wallCount > 2;
    })();

    if (!hasFloor && highestY > 0) {
        for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) {
            if (result[0][z][x] === 0) result[0][z][x] = 26;
        }
    }

    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        if (result[0][z][x] === 0) {
            const dist = Math.sqrt((x - 7.5) ** 2 + (z - 7.5) ** 2);
            if (dist > 8) {
                result[0][z][x] = Math.random() > 0.7 ? 27 : 26;
            } else if (dist > 6) {
                result[0][z][x] = Math.random() > 0.8 ? 2 : 0;
            }
        }
    }

    if (hasWalls && highestY > 0 && highestY < 14) {
        const roofY = highestY + 1;
        const roofSlabY = highestY + 2;
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
            const blockBelow = result[highestY][z]?.[x] || 0;
            if (blockBelow !== 0 && result[roofY]?.[z]?.[x] === 0) {
                result[roofY][z][x] = blockBelow === 3 ? 3 : 7;
            }
        }
        for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) {
            if (result[roofY]?.[z]?.[x] !== 0 && result[roofSlabY]?.[z]?.[x] === 0) {
                const edge = x === 1 || x === 14 || z === 1 || z === 14;
                if (!edge) result[roofSlabY][z][x] = 9;
            }
        }
    }

    if (highestY > 0) {
        const leafCandidates: Array<[number, number]> = [];
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
            if (result[0][z][x] !== 0 && result[1]?.[z]?.[x] === 0) {
                const nearGround = (x <= 1 || x >= 14 || z <= 1 || z >= 14);
                if (nearGround) leafCandidates.push([x, z]);
            }
        }
        for (const [x, z] of leafCandidates.slice(0, 6)) {
            if (result[1][z][x] === 0) result[1][z][x] = 101;
            if (x + 1 < 16 && result[1][z][x + 1] === 0) result[1][z][x + 1] = 101;
        }
    }

    const wallPositions: Array<[number, number, number]> = [];
    for (let y = 1; y <= highestY; y++) {
        for (let x = 2; x <= 13; x++) {
            if (result[y][1][x] !== 0 && result[y][2][x] === 0) wallPositions.push([x, y, 1]);
            if (result[y][14][x] !== 0 && result[y][13][x] === 0) wallPositions.push([x, y, 14]);
        }
        for (let z = 2; z <= 13; z++) {
            if (result[y][z][1] !== 0 && result[y][z][2] === 0) wallPositions.push([1, y, z]);
            if (result[y][z][14] !== 0 && result[y][z][13] === 0) wallPositions.push([14, y, z]);
        }
    }
    if (wallPositions.length > 0) {
        const lanternPos = wallPositions[Math.floor(wallPositions.length / 2)];
        if (result[lanternPos[1] + 1]?.[lanternPos[2]]?.[lanternPos[0]] === 0) {
            result[lanternPos[1] + 1][lanternPos[2]][lanternPos[0]] = 95;
        }
    }

    return result;
}

function parseInstructionsFromAI(response: string): BuildInstruction[] {
    const instructions: BuildInstruction[] = [];

    const tryParse = (jsonStr: string) => {
        try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (item && typeof item.action === 'string' && typeof item.block === 'string') {
                        instructions.push({
                            action: item.action,
                            x1: Number(item.x1) || 0,
                            y1: Number(item.y1) || 0,
                            z1: Number(item.z1) || 0,
                            x2: Number(item.x2),
                            y2: Number(item.y2),
                            z2: Number(item.z2),
                            block: item.block
                        });
                    }
                }
            }
        } catch { /* ignore */ }
    };

    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        tryParse(codeBlockMatch[1].trim());
    }

    if (instructions.length === 0) {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) tryParse(jsonMatch[0]);
    }

    return instructions;
}

async function generateWithAI(prompt: string): Promise<Grid3D> {
    const apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    const MODELS_TO_TRY = [
        'openai/gpt-oss-120b:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
        'openai/gpt-oss-20b:free',
        'qwen/qwen3-coder:free',
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'google/gemma-4-31b-it:free'
    ];

    const systemPrompt = `You are an expert Minecraft voxel architect. You design detailed 3D structures using build instructions.

COORDINATE SYSTEM:
- Grid is 16x16x16 voxels
- x: 0-15 (left to right)
- y: 0-15 (bottom to top, y=0 is ground)
- z: 0-15 (front to back)

AVAILABLE BLOCKS (use exact names):
${BLOCK_NAMES_LIST}

INSTRUCTION FORMAT — Return a JSON array:
{"action":"fill","x1":N,"y1":N,"z1":N,"x2":N,"y2":N,"z2":N,"block":"NAME"}
{"action":"hollow_box","x1":N,"y1":N,"z1":N,"x2":N,"y2":N,"z2":N,"block":"NAME"}
{"action":"place","x1":N,"y1":N,"z1":N,"block":"NAME"}

ACTIONS:
- "fill": Fill rectangular solid region (inclusive coords)
- "hollow_box": Hollow box — only shell walls, floor, ceiling (inclusive coords)
- "place": Single block at exact position

DESIGN PRINCIPLES (follow ALL of these):
1. STRUCTURE SIZE: The building should occupy most of the 16x16 footprint. Walls at x=1-14, z=1-14. Height 6-12 blocks.
2. FOUNDATION: y=0 must be a solid floor slab covering the entire building footprint.
3. WALLS: Use hollow_box for the main shell. Walls should be 1 block thick.
4. PILLARS: Place log pillars at all 4 corners of the building (full height).
5. ROOF: Add a roof 1-2 blocks above the walls using stairs/slabs or solid blocks in a stepped pattern.
6. WINDOWS: Cut 2-block-wide glass window holes on each wall at y=3-4 height.
7. DOOR: Leave a 2-wide, 2-tall opening at the front center.
8. INTERIOR: Add at least 1 interior feature (crafting table, furnace, chest, etc.)
9. DETAILS: Add fences as railings, leaves around entrance, lanterns on walls.
10. VARIETY: Use 4-6 different block types. Do NOT make everything one material.

STEP-BY-STEP ORDER — Build in this order:
1. Ground/foundation (y=0): Solid floor
2. Main walls (hollow_box): The building shell
3. Corner pillars: Log columns at corners
4. Roof structure: Stepped or flat roof above walls
5. Windows: Glass panes in walls
6. Door opening: Gap in front wall
7. Interior: Furniture blocks
8. Exterior details: Fences, leaves, lanterns

EXAMPLE — "Cozy wooden cottage":
[
  {"action":"fill","x1":1,"y1":0,"z1":1,"x2":14,"y2":0,"z2":14,"block":"oak_planks"},
  {"action":"hollow_box","x1":1,"y1":1,"z1":1,"x2":14,"y2":7,"z2":14,"block":"spruce_planks"},
  {"action":"place","x1":1,"y1":1,"z1":1,"block":"spruce_log"},
  {"action":"place","x1":14,"y1":1,"z1":1,"block":"spruce_log"},
  {"action":"place","x1":1,"y1":1,"z1":14,"block":"spruce_log"},
  {"action":"place","x1":14,"y1":1,"z1":14,"block":"spruce_log"},
  {"action":"fill","x1":1,"y1":2,"z1":1,"x2":1,"y2":7,"z2":1,"block":"spruce_log"},
  {"action":"fill","x1":14,"y1":2,"z1":1,"x2":14,"y2":7,"z2":1,"block":"spruce_log"},
  {"action":"fill","x1":1,"y1":2,"z1":14,"x2":1,"y2":7,"z2":14,"block":"spruce_log"},
  {"action":"fill","x1":14,"y1":2,"z1":14,"x2":14,"y2":7,"z2":14,"block":"spruce_log"},
  {"action":"fill","x1":1,"y1":8,"z1":1,"x2":14,"y2":8,"z2":14,"block":"dark_oak_slab"},
  {"action":"fill","x1":3,"y1":8,"z1":3,"x2":12,"y2":9,"z2":12,"block":"dark_oak_stairs"},
  {"action":"fill","x1":5,"y1":3,"z1":1,"x2":7,"y2":5,"z2":1,"block":"glass"},
  {"action":"fill","x1":5,"y1":3,"z1":14,"x2":7,"y2":5,"z2":14,"block":"glass"},
  {"action":"fill","x1":1,"y1":3,"z1":5,"x2":1,"y2":5,"z2":7,"block":"glass"},
  {"action":"fill","x1":14,"y1":3,"z1":5,"x2":14,"y2":5,"z2":7,"block":"glass"},
  {"action":"fill","x1":7,"y1":1,"z1":1,"x2":8,"y2":2,"z2":1,"block":"air"},
  {"action":"place","x1":7,"y1":1,"z1":1,"block":"crafting_table"},
  {"action":"place","x1":8,"y1":1,"z1":1,"block":"furnace"},
  {"action":"fill","x1":1,"y1":1,"z1":7,"x2":1,"y2":1,"z2":8,"block":"oak_fence"},
  {"action":"fill","x1":0,"y1":0,"z1":0,"x2":15,"y2":0,"z2":0,"block":"oak_fence"},
  {"action":"place","x1":7,"y1":6,"z1":1,"block":"lantern"},
  {"action":"fill","x1":0,"y1":0,"z1":14,"x2":0,"y2":3,"z2":14,"block":"oak_leaves"},
  {"action":"fill","x1":15,"y1":0,"z1":14,"x2":15,"y2":3,"z2":14,"block":"oak_leaves"}
]

Generate 25-50 instructions for the requested structure. Be creative and detailed.`;

    let lastError: Error | null = null;

    for (let i = 0; i < MODELS_TO_TRY.length; i++) {
        const model = MODELS_TO_TRY[i];
        try {
            console.log(`[ModelGen] Trying model: ${model}`);
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Build this structure: ${prompt}` }
                ],
                temperature: 0.4,
                max_tokens: 4096
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            });

            const content = response.data?.choices?.[0]?.message?.content || '';
            console.log(`[ModelGen] Got response from ${model}, content length: ${content.length}`);

            const instructions = parseInstructionsFromAI(content);
            if (instructions.length === 0) {
                throw new Error(`AI returned no valid instructions (got ${content.length} chars)`);
            }

            console.log(`[ModelGen] Parsed ${instructions.length} instructions from ${model}`);

            const grid = executeInstructions(instructions);
            const validation = validateGrid(grid);
            console.log(`[ModelGen] Grid: ${validation.filledBlocks}/${validation.totalBlocks} blocks (${validation.fillPercent.toFixed(1)}% filled)`);

            if (!validation.valid) {
                throw new Error(`Grid too sparse: only ${validation.filledBlocks} blocks (${validation.fillPercent.toFixed(1)}%)`);
            }

            const enhancedGrid = enhanceGrid(grid);
            const enhancedValidation = validateGrid(enhancedGrid);
            console.log(`[ModelGen] Enhanced grid: ${enhancedValidation.filledBlocks} blocks (${enhancedValidation.fillPercent.toFixed(1)}%)`);

            return enhancedGrid;
        } catch (err: any) {
            console.warn(`[ModelGen] Model ${model} failed: ${err.message}`);
            lastError = err;
            if (i < MODELS_TO_TRY.length - 1) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }

    throw lastError || new Error('All AI models failed');
}

function generateSmartProcedural(prompt: string): Grid3D {
    const p = prompt.toLowerCase();
    let grid: Grid3D;
    if (p.includes('castle') || p.includes('fortress') || p.includes('fort') || p.includes('keep')) {
        grid = buildCastle(p);
    } else if (p.includes('tower') || p.includes('lighthouse') || p.includes('spire')) {
        grid = buildTower(p);
    } else if (p.includes('bridge')) {
        grid = buildBridge(p);
    } else if (p.includes('pyramid') || p.includes('temple') || p.includes('egypt')) {
        grid = buildPyramid(p);
    } else if (p.includes('tree') || p.includes('forest') || p.includes('nature')) {
        grid = buildTree(p);
    } else if (p.includes('wall') || p.includes('fence') || p.includes('gate')) {
        grid = buildWall(p);
    } else {
        grid = buildCottage(p);
    }
    return enhanceGrid(grid);
}

function buildCottage(p: string): Grid3D {
    const grid = emptyGrid();
    const isDark = p.includes('dark') || p.includes('oak');
    const isBrick = p.includes('brick');
    const W = isBrick ? 18 : isDark ? 12 : 7;
    const F = isBrick ? 1 : 16;
    const P = isDark ? 10 : 5;
    const RS = isDark ? 13 : 8;
    const L = isDark ? 103 : 101;

    for (let x = 2; x <= 13; x++) for (let z = 2; z <= 13; z++) grid[0][z][x] = F;
    for (let x = 0; x <= 15; x++) for (let z = 0; z <= 15; z++) {
        if (Math.max(Math.abs(x - 7.5), Math.abs(z - 7.5)) > 7) grid[0][z][x] = 26;
    }
    for (let y = 1; y <= 6; y++) {
        for (let x = 2; x <= 13; x++) { grid[y][2][x] = W; grid[y][13][x] = W; }
        for (let z = 3; z <= 12; z++) { grid[y][z][2] = W; grid[y][z][13] = W; }
    }
    for (let y = 1; y <= 7; y++) {
        grid[y][2][2] = P; grid[y][13][2] = P; grid[y][2][13] = P; grid[y][13][13] = P;
    }
    for (let y = 3; y <= 4; y++) {
        grid[y][2][6] = 15; grid[y][2][7] = 15; grid[y][2][8] = 15; grid[y][2][9] = 15;
        grid[y][13][6] = 15; grid[y][13][7] = 15; grid[y][13][8] = 15; grid[y][13][9] = 15;
        grid[y][6][2] = 15; grid[y][7][2] = 15;
        grid[y][6][13] = 15; grid[y][7][13] = 15;
        grid[y][10][2] = 15; grid[y][11][2] = 15;
        grid[y][10][13] = 15; grid[y][11][13] = 15;
    }
    grid[1][2][7] = 0; grid[1][2][8] = 0; grid[2][2][7] = 0; grid[2][2][8] = 0;
    for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) grid[7][z][x] = isDark ? 14 : 9;
    for (let i = 0; i <= 4; i++) {
        for (let x = 3 + i; x <= 12 - i; x++) {
            if (7 + i < 16) { grid[7 + i][2 + i][x] = RS; grid[7 + i][13 - i][x] = RS; }
        }
        for (let z = 3 + i; z <= 12 - i; z++) {
            if (7 + i < 16) { grid[7 + i][z][2 + i] = RS; grid[7 + i][z][12 - i] = RS; }
        }
    }
    grid[1][8][2] = 95; grid[1][8][13] = 95;
    grid[1][1][2] = L; grid[2][1][2] = L; grid[1][1][3] = L;
    grid[1][14][13] = L; grid[2][14][13] = L; grid[1][14][12] = L;
    grid[1][2][5] = 91; grid[1][2][10] = 92; grid[6][8][7] = 97;
    grid[1][13][8] = 93;
    return grid;
}

function buildCastle(p: string): Grid3D {
    const grid = emptyGrid();
    for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) grid[0][z][x] = 2;
    for (let y = 1; y <= 8; y++) {
        for (let x = 1; x <= 14; x++) { grid[y][1][x] = 3; grid[y][14][x] = 3; }
        for (let z = 2; z <= 13; z++) { grid[y][z][1] = 3; grid[y][z][14] = 3; }
    }
    const towers = [[1,1],[14,1],[1,14],[14,14]];
    for (const [tx, tz] of towers) {
        for (let y = 1; y <= 11; y++) {
            for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
                const nx = tx + dx, nz = tz + dz;
                if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16) grid[y][nz][nx] = 33;
            }
        }
        for (let x = Math.max(0, tx - 1); x <= Math.min(15, tx + 1); x++) grid[12][tz][x] = 13;
        for (let z = Math.max(0, tz - 1); z <= Math.min(15, tz + 1); z++) grid[12][z][tx] = 13;
    }
    for (let x = 2; x <= 13; x++) { grid[9][1][x] = 84; grid[9][14][x] = 84; }
    for (let y = 3; y <= 5; y++) {
        grid[y][1][5] = 15; grid[y][1][6] = 15; grid[y][1][9] = 15; grid[y][1][10] = 15;
        grid[y][14][5] = 15; grid[y][14][6] = 15; grid[y][14][9] = 15; grid[y][14][10] = 15;
    }
    grid[1][8][1] = 0; grid[2][8][1] = 0; grid[1][7][1] = 0; grid[2][7][1] = 0;
    grid[1][3][8] = 91; grid[1][3][9] = 92;
    return grid;
}

function buildTower(p: string): Grid3D {
    const grid = emptyGrid();
    const W = p.includes('nether') ? 115 : 3;
    const P = p.includes('nether') ? 116 : 1;
    for (let x = 4; x <= 11; x++) for (let z = 4; z <= 11; z++) grid[0][z][x] = 2;
    for (let y = 1; y <= 14; y++) {
        for (let x = 4; x <= 11; x++) { grid[y][4][x] = W; grid[y][11][x] = W; }
        for (let z = 5; z <= 10; z++) { grid[y][z][4] = W; grid[y][z][11] = W; }
        grid[y][4][4] = P; grid[y][11][4] = P; grid[y][4][11] = P; grid[y][11][11] = P;
    }
    for (let x = 3; x <= 12; x++) for (let z = 3; z <= 12; z++) grid[15][z][x] = p.includes('nether') ? 115 : 13;
    for (let y = 3; y <= 5; y++) {
        grid[y][4][7] = 15; grid[y][4][8] = 15;
        grid[y][11][7] = 15; grid[y][11][8] = 15;
        grid[y][7][4] = 15; grid[y][8][4] = 15;
        grid[y][7][11] = 15; grid[y][8][11] = 15;
    }
    grid[1][4][7] = 0; grid[1][4][8] = 0; grid[2][4][7] = 0; grid[2][4][8] = 0;
    grid[1][5][5] = 91; grid[1][5][6] = 92; grid[13][8][8] = 97;
    return grid;
}

function buildBridge(p: string): Grid3D {
    const grid = emptyGrid();
    for (let x = 0; x <= 15; x++) for (let z = 6; z <= 9; z++) grid[5][z][x] = 16;
    for (let x = 0; x <= 15; x++) { grid[6][6][x] = 84; grid[6][9][x] = 84; }
    for (let x = 0; x <= 15; x += 4) for (let y = 0; y <= 4; y++) for (let z = 6; z <= 9; z++) grid[y][z][x] = 1;
    for (let x = 0; x <= 15; x++) for (let z = 0; z <= 5; z++) grid[0][z][x] = 27;
    for (let x = 0; x <= 15; x++) for (let z = 10; z <= 15; z++) grid[0][z][x] = 27;
    for (let x = 0; x <= 15; x++) { grid[0][6][x] = 26; grid[0][7][x] = 26; grid[0][8][x] = 26; grid[0][9][x] = 26; }
    return grid;
}

function buildPyramid(p: string): Grid3D {
    const grid = emptyGrid();
    const B = p.includes('nether') ? 115 : p.includes('sand') ? 4 : 1;
    for (let level = 0; level < 8; level++) {
        const x1 = 1 + level, x2 = 14 - level, z1 = 1 + level, z2 = 14 - level;
        if (x1 > x2 || z1 > z2) break;
        for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) grid[level][z][x] = B;
    }
    grid[1][1][7] = 0; grid[1][1][8] = 0; grid[2][1][7] = 0; grid[2][1][8] = 0;
    return grid;
}

function buildTree(p: string): Grid3D {
    const grid = emptyGrid();
    const log = p.includes('dark') ? 10 : 17;
    const leaf = p.includes('dark') ? 103 : 101;
    for (let y = 0; y <= 9; y++) { grid[y][7][7] = log; grid[y][8][7] = log; }
    for (let dy = 6; dy <= 13; dy++) {
        const r = dy <= 10 ? 4 : Math.max(0, 4 - (dy - 10));
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dz * dz <= r * r + 2) {
                const lx = 7 + dx, lz = 7 + dz;
                if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && dy < 16 && grid[dy][lz][lx] === 0) {
                    grid[dy][lz][lx] = leaf;
                }
            }
        }
    }
    for (let x = 3; x <= 12; x++) for (let z = 3; z <= 12; z++) {
        if (grid[0][z][x] === 0 && Math.sqrt((x - 7.5) ** 2 + (z - 7.5) ** 2) < 6) grid[0][z][x] = 26;
    }
    return grid;
}

function buildWall(p: string): Grid3D {
    const grid = emptyGrid();
    for (let x = 0; x <= 15; x++) for (let z = 7; z <= 8; z++) for (let y = 0; y <= 8; y++) grid[y][z][x] = 3;
    for (let x = 0; x <= 15; x += 5) for (let y = 0; y <= 10; y++) { grid[y][7][x] = 1; grid[y][8][x] = 1; }
    for (let y = 9; y <= 10; y++) for (let x = 0; x <= 15; x++) {
        if (x % 5 !== 0) { grid[y][7][x] = 84; grid[y][8][x] = 84; }
    }
    grid[0][7][7] = 0; grid[0][8][7] = 0; grid[0][7][8] = 0; grid[0][8][8] = 0;
    grid[1][7][7] = 0; grid[1][8][7] = 0; grid[1][7][8] = 0; grid[1][8][8] = 0;
    for (let x = 0; x <= 15; x++) for (let z = 0; z <= 15; z++) {
        if (grid[0][z][x] === 0) grid[0][z][x] = z < 7 ? 26 : 27;
    }
    return grid;
}

function writeVarInt(value: number): number[] {
    const result: number[] = [];
    let v = value;
    while (v > 0x7f) {
        result.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    result.push(v & 0x7f);
    return result;
}

function buildSchematicWithPrismarineNbt(
    grid: number[][][],
    palette: Record<string, number>,
    width: number,
    height: number,
    length: number
): Buffer {
    const blockData: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                const blockId = grid[y]?.[z]?.[x] ?? 0;
                blockData.push(...writeVarInt(blockId));
            }
        }
    }

    const paletteObj: Record<string, any> = {};
    for (const [blockName, id] of Object.entries(palette)) {
        paletteObj[blockName] = { type: 'int', value: id };
    }

    const data = {
        type: 'compound' as const,
        name: '',
        value: {
            Version: { type: 'int' as const, value: 2 },
            DataVersion: { type: 'int' as const, value: 3955 },
            Width: { type: 'short' as const, value: width },
            Height: { type: 'short' as const, value: height },
            Length: { type: 'short' as const, value: length },
            Offset: { type: 'intArray' as const, value: [0, 0, 0] },
            PaletteMax: { type: 'int' as const, value: Object.keys(palette).length },
            Palette: {
                type: 'compound' as const,
                value: paletteObj
            },
            BlockData: { type: 'byteArray' as const, value: Buffer.from(blockData) }
        }
    };

    const uncompressed = nbt.writeUncompressed(data);
    return zlib.gzipSync(uncompressed);
}

function buildSchemFromPostProcessed(grid: number[][][], palette: Record<string, number>): Buffer {
    const SIZE = 16;

    const usedBlocks = new Set<number>();
    for (const layer of grid) for (const row of layer) for (const id of row) usedBlocks.add(id);

    const localPalette: Record<number, number> = {};
    let localId = 0;
    const sortedIds = Array.from(usedBlocks).sort((a, b) => a - b);
    for (const id of sortedIds) {
        localPalette[id] = localId++;
    }

    const idToName: Record<number, string> = {};
    for (const [name, id] of Object.entries(palette)) {
        if (!(id in idToName)) idToName[id] = name;
    }

    const schematicPalette: Record<string, number> = {};
    for (const globalId of sortedIds) {
        const mcName = idToName[globalId] || 'minecraft:air';
        schematicPalette[mcName] = localPalette[globalId];
    }

    const remappedGrid: number[][][] = [];
    for (const layer of grid) {
        const newLayer: number[][] = [];
        for (const row of layer) {
            const newRow = row.map(id => localPalette[id] || 0);
            newLayer.push(newRow);
        }
        remappedGrid.push(newLayer);
    }

    return buildSchematicWithPrismarineNbt(remappedGrid, schematicPalette, SIZE, SIZE, SIZE);
}

router.post('/generate', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    console.log(`[ModelGen] >>> POST /api/modelgen/generate hit`);
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const user = req.auth!.user;
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    if (user.credits < 50) {
        return res.status(402).json({ error: 'Insufficient credits. Model generation requires 50 credits.' });
    }

    console.log(`[ModelGen] User ${user.id} has ${user.credits} credits. Prompt: "${prompt.slice(0, 80)}"`);

    let grid: Grid3D;
    let usedMethod = 'ai';

    try {
        console.log(`[ModelGen] Calling generateWithAI...`);
        grid = await generateWithAI(prompt);
        const validation = validateGrid(grid);
        console.log(`[ModelGen] AI generation succeeded: ${validation.filledBlocks} blocks, ${validation.fillPercent.toFixed(1)}% filled`);
    } catch (aiError: any) {
        console.warn(`[ModelGen] AI failed: ${aiError.message}, falling back to procedural generation`);
        grid = generateSmartProcedural(prompt);
        usedMethod = 'procedural';
        const validation = validateGrid(grid);
        console.log(`[ModelGen] Procedural fallback: ${validation.filledBlocks} blocks, ${validation.fillPercent.toFixed(1)}% filled`);
    }

    try {
        const postProcessPalette: Record<string, number> = {};
        for (const [name, id] of Object.entries(BLOCK_PALETTE)) {
            if (name === 'air') continue;
            const mcName = MC_BLOCK_NAMES[name] || `minecraft:${name}`;
            postProcessPalette[mcName] = id;
        }

        const { grid: postGrid, palette: postPalette } = postProcessSchematic(grid, postProcessPalette);
        const schemBuffer = buildSchemFromPostProcessed(postGrid, postPalette);

        const fileName = `velix-${Date.now()}-${Math.random().toString(36).substring(7)}.schem`;
        await uploadToStorage(fileName, schemBuffer);
        console.log(`[ModelGen] Schem uploaded to storage: ${fileName} (${schemBuffer.length} bytes)`);

        await dbService.deductCredits(req.auth!.userId, 50, 'model_gen', `Generated model: ${prompt.slice(0, 80)}`);
        const updatedUser = await dbService.getUserById(req.auth!.userId);

        let historyId: number | null = null;
        try {
            const historyRow = await dbService.saveModelgenHistory(
                req.auth!.userId, prompt, usedMethod, fileName, 50
            );
            historyId = historyRow?.[0]?.id ?? null;
            console.log(`[ModelGen] Saved to history, id=${historyId}`);
        } catch (histErr: any) {
            console.warn(`[ModelGen] Failed to save history: ${histErr.message}`);
        }

        res.json({
            id: historyId,
            schematicFile: fileName,
            prompt,
            method: usedMethod,
            creditsUsed: 50,
            creditsRemaining: updatedUser?.credits ?? 0
        });
        console.log(`[ModelGen] Response sent successfully`);
    } catch (buildError: any) {
        console.error(`[ModelGen] Build/post-process error:`, buildError.message);
        console.error(`[ModelGen] Stack:`, buildError.stack);
        try {
            res.status(500).json({ error: `Schematic build failed: ${buildError.message}` });
        } catch (sendErr: any) {
            console.error(`[ModelGen] Failed to send error response:`, sendErr.message);
        }
    }
}));

router.get('/local/:filename', asyncHandler(async (req, res) => {
    const safeName = path.basename(decodeURIComponent(req.params.filename));
    const filePath = path.join(LOCAL_SCHEMATICS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Schematic not found' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
}));

router.get('/download/:filename', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const safeName = decodeURIComponent(filename);

    const localPath = path.join(LOCAL_SCHEMATICS_DIR, safeName);
    if (fs.existsSync(localPath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(localPath).pipe(res);
        return;
    }

    if (storageMode === 'supabase') {
        try {
            const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${safeName}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`
                }
            });
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const buf = Buffer.from(arrayBuffer);
                res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
                res.setHeader('Content-Type', 'application/octet-stream');
                res.send(buf);
                return;
            }
        } catch {}
    }

    return res.status(404).json({ error: 'Schematic not found' });
}));

router.get('/examples', (_req, res) => {
    res.json({ examples: EXAMPLE_PROMPTS });
});

router.get('/status', (_req, res) => {
    res.json({ online: true, mode: 'ai-powered', features: ['post-processing', 'procedural-fallback'] });
});

router.get('/history', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        const history = await dbService.getModelgenHistory(req.auth!.userId);
        res.json(history);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.get('/history/:id', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        const item = await dbService.getModelgenById(parseInt(req.params.id));
        if (!item || item.user_id !== req.auth!.userId) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.json(item);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

router.delete('/history/:id', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
    try {
        const item = await dbService.getModelgenById(parseInt(req.params.id));
        if (item && item.schematic_data) {
            await deleteFromStorage(item.schematic_data);
        }
        await dbService.deleteModelgenHistory(parseInt(req.params.id), req.auth!.userId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}));

export default router;
