/**
 * Procedural shape generators for Minecraft structures.
 * Ported from minecraft-ai-model/scripts/generation/
 * Used as fallback when AI generation fails.
 */

type Grid3D = number[][][];
const SIZE = 16;

function emptyGrid(): Grid3D {
    return Array.from({ length: SIZE }, () =>
        Array.from({ length: SIZE }, () => new Array(SIZE).fill(0))
    );
}

export function generateCuboid(
    blockId: number,
    position: { x: number; y: number; z: number } = { x: 4, y: 4, z: 4 },
    width: number = 8,
    length: number = 8,
    height: number = 8,
    hollow: boolean = false
): Grid3D {
    const grid = emptyGrid();
    const sx = position.x, sy = position.y, sz = position.z;
    const ex = Math.min(sx + width, SIZE);
    const ey = Math.min(sy + height, SIZE);
    const ez = Math.min(sz + length, SIZE);

    for (let y = sy; y < ey; y++) {
        for (let z = sz; z < ez; z++) {
            for (let x = sx; x < ex; x++) {
                if (hollow) {
                    const isShell = x === sx || x === ex - 1 || z === sz || z === ez - 1 || y === sy || y === ey - 1;
                    if (isShell) grid[y][z][x] = blockId;
                } else {
                    grid[y][z][x] = blockId;
                }
            }
        }
    }
    return grid;
}

export function generateSphere(
    blockId: number,
    center: { x: number; y: number; z: number } = { x: 8, y: 8, z: 8 },
    radius: number = 4,
    hollow: boolean = false
): Grid3D {
    const grid = emptyGrid();
    for (let y = 0; y < SIZE; y++) {
        for (let z = 0; z < SIZE; z++) {
            for (let x = 0; x < SIZE; x++) {
                const dx = x - center.x;
                const dy = y - center.y;
                const dz = z - center.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (hollow) {
                    if (distSq >= (radius - 1) ** 2 && distSq <= radius ** 2) {
                        grid[y][z][x] = blockId;
                    }
                } else {
                    if (distSq <= radius ** 2) {
                        grid[y][z][x] = blockId;
                    }
                }
            }
        }
    }
    return grid;
}

export function generatePyramid(
    blockId: number,
    position: { x: number; y: number; z: number } = { x: 4, y: 0, z: 4 },
    baseWidth: number = 8,
    hollow: boolean = false
): Grid3D {
    const grid = emptyGrid();
    const height = Math.floor(baseWidth / 2) + (baseWidth % 2 !== 0 ? 1 : 0);
    const sx = position.x, sy = position.y, sz = position.z;

    for (let level = 0; level < height; level++) {
        const y = sy + level;
        if (y >= SIZE) break;
        const layerWidth = baseWidth - 2 * level;
        if (layerWidth <= 0) break;

        const x1 = sx + level;
        const z1 = sz + level;
        const x2 = x1 + layerWidth;
        const z2 = z1 + layerWidth;

        for (let z = z1; z < z2 && z < SIZE; z++) {
            for (let x = x1; x < x2 && x < SIZE; x++) {
                if (!hollow) {
                    grid[y][z][x] = blockId;
                } else {
                    const dLeft = x - x1;
                    const dRight = (x2 - 1) - x;
                    const dFront = z - z1;
                    const dBack = (z2 - 1) - z;
                    const wallThickness = 2;
                    if (Math.min(dLeft, dRight, dFront, dBack) < wallThickness || layerWidth <= wallThickness * 2 - 1) {
                        grid[y][z][x] = blockId;
                    }
                }
            }
        }
    }
    return grid;
}

export function generateCylinder(
    blockId: number,
    center: { x: number; y: number; z: number } = { x: 8, y: 8, z: 8 },
    radius: number = 4,
    height: number = 8,
    orientation: 'x' | 'y' | 'z' = 'y',
    hollow: boolean = false
): Grid3D {
    const grid = emptyGrid();

    for (let y = 0; y < SIZE; y++) {
        for (let z = 0; z < SIZE; z++) {
            for (let x = 0; x < SIZE; x++) {
                let distSq: number;
                let inHeight: boolean;

                if (orientation === 'y') {
                    distSq = (x - center.x) ** 2 + (z - center.z) ** 2;
                    inHeight = y >= center.y - Math.floor(height / 2) && y <= center.y + Math.floor(height / 2);
                } else if (orientation === 'x') {
                    distSq = (y - center.y) ** 2 + (z - center.z) ** 2;
                    inHeight = x >= center.x - Math.floor(height / 2) && x <= center.x + Math.floor(height / 2);
                } else {
                    distSq = (x - center.x) ** 2 + (y - center.y) ** 2;
                    inHeight = z >= center.z - Math.floor(height / 2) && z <= center.z + Math.floor(height / 2);
                }

                if (!inHeight) continue;

                if (hollow) {
                    if (distSq >= (radius - 1) ** 2 && distSq <= radius ** 2) {
                        grid[y][z][x] = blockId;
                    }
                } else {
                    if (distSq <= radius ** 2) {
                        grid[y][z][x] = blockId;
                    }
                }
            }
        }
    }
    return grid;
}

/**
 * Generate a random structure using procedural shapes.
 * Returns a grid with block IDs from the provided palette.
 */
export function generateProceduralStructure(
    blockId: number,
    shape?: 'cuboid' | 'sphere' | 'pyramid' | 'cylinder'
): Grid3D {
    const shapes: Array<'cuboid' | 'sphere' | 'pyramid' | 'cylinder'> = ['cuboid', 'sphere', 'pyramid', 'cylinder'];
    const selected = shape || shapes[Math.floor(Math.random() * shapes.length)];

    switch (selected) {
        case 'cuboid': {
            const w = 4 + Math.floor(Math.random() * 8);
            const l = 4 + Math.floor(Math.random() * 8);
            const h = 3 + Math.floor(Math.random() * 10);
            const x = Math.floor(Math.random() * (SIZE - w));
            const hollow = Math.random() > 0.5;
            return generateCuboid(blockId, { x, y: 0, z: x }, w, l, h, hollow);
        }
        case 'sphere': {
            const r = 2 + Math.floor(Math.random() * 5);
            const cx = r + Math.floor(Math.random() * (SIZE - 2 * r));
            const cy = r + Math.floor(Math.random() * (SIZE - 2 * r));
            const cz = r + Math.floor(Math.random() * (SIZE - 2 * r));
            const hollow = Math.random() > 0.5;
            return generateSphere(blockId, { x: cx, y: cy, z: cz }, r, hollow);
        }
        case 'pyramid': {
            const bw = 5 + Math.floor(Math.random() * 8);
            const x = Math.floor(Math.random() * (SIZE - bw));
            const z = Math.floor(Math.random() * (SIZE - bw));
            const hollow = Math.random() > 0.6;
            return generatePyramid(blockId, { x, y: 0, z }, bw, hollow);
        }
        case 'cylinder': {
            const r = 2 + Math.floor(Math.random() * 4);
            const h = 5 + Math.floor(Math.random() * 8);
            const cx = r + Math.floor(Math.random() * (SIZE - 2 * r));
            const cy = Math.floor(Math.random() * SIZE);
            const cz = r + Math.floor(Math.random() * (SIZE - 2 * r));
            const hollow = Math.random() > 0.5;
            return generateCylinder(blockId, { x: cx, y: cy, z: cz }, r, h, 'y', hollow);
        }
    }
}
