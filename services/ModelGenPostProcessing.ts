/**
 * Post-processing for generated voxel grids.
 * Ported from minecraft-ai-model/scripts/postprocessing/adjust_block_states.py
 * Automatically fixes stair/slab facing and half based on neighbors.
 */

type Grid3D = number[][][]; // [height][length][width]

interface PostProcessResult {
    grid: Grid3D;
    palette: Record<string, number>; // "block_name[props]" -> block_id
}

/**
 * Post-process a schematic: fix half, type, and facing for stairs/slabs.
 * @param grid 16x16x16 voxel grid with global block IDs
 * @param palette mapping of "block_name[property_string]" -> block_id
 */
export function postProcessSchematic(
    grid: Grid3D,
    palette: Record<string, number>
): PostProcessResult {
    let result = adjustBlockStateHalf(grid, palette);
    result = adjustBlockStateType(result.grid, result.palette);
    result = adjustBlockStateFacing(result.grid, result.palette);
    return result;
}

function adjustBlockStateHalf(
    data: Grid3D,
    palette: Record<string, number>
): PostProcessResult {
    const newPalette = { ...palette };
    const SIZE = data.length;
    let maxId = Math.max(0, ...Object.values(newPalette));

    const newData: Grid3D = data.map(layer => layer.map(row => [...row]));

    for (const [blockName, blockId] of Object.entries(newPalette)) {
        if (!blockName.includes('half=bottom')) continue;

        const topVariant = blockName.replace('half=bottom', 'half=top');
        maxId++;
        newPalette[topVariant] = maxId;

        for (let y = 1; y < SIZE - 1; y++) {
            for (let z = 0; z < SIZE; z++) {
                for (let x = 0; x < SIZE; x++) {
                    if (newData[y][z][x] !== blockId) continue;
                    if (newData[y - 1][z][x] === 0 && newData[y + 1][z][x] > 0) {
                        newData[y][z][x] = maxId;
                    }
                }
            }
        }
    }

    return { grid: newData, palette: newPalette };
}

function adjustBlockStateType(
    data: Grid3D,
    palette: Record<string, number>
): PostProcessResult {
    const newPalette = { ...palette };
    const SIZE = data.length;
    let maxId = Math.max(0, ...Object.values(newPalette));

    const newData: Grid3D = data.map(layer => layer.map(row => [...row]));

    for (const [blockName, blockId] of Object.entries(newPalette)) {
        if (!blockName.includes('type=bottom')) continue;

        const topVariant = blockName.replace('type=bottom', 'type=top');
        maxId++;
        newPalette[topVariant] = maxId;

        for (let y = 1; y < SIZE - 1; y++) {
            for (let z = 0; z < SIZE; z++) {
                for (let x = 0; x < SIZE; x++) {
                    if (newData[y][z][x] !== blockId) continue;
                    if (newData[y - 1][z][x] === 0 && newData[y + 1][z][x] > 0) {
                        newData[y][z][x] = maxId;
                    }
                }
            }
        }
    }

    return { grid: newData, palette: newPalette };
}

function adjustBlockStateFacing(
    data: Grid3D,
    palette: Record<string, number>
): PostProcessResult {
    const newPalette = { ...palette };
    const SIZE = data.length;
    let maxId = Math.max(0, ...Object.values(newPalette));

    const newData: Grid3D = data.map(layer => layer.map(row => [...row]));

    for (const [blockName, blockId] of Object.entries(newPalette)) {
        if (!blockName.includes('facing=east')) continue;

        const facingMap: Record<string, number> = { east: blockId };
        for (const facing of ['north', 'south', 'west']) {
            const variant = blockName.replace('facing=east', `facing=${facing}`);
            maxId++;
            newPalette[variant] = maxId;
            facingMap[facing] = maxId;
        }

        for (let y = 0; y < SIZE; y++) {
            for (let z = 0; z < SIZE; z++) {
                for (let x = 0; x < SIZE; x++) {
                    if (newData[y][z][x] !== blockId) continue;

                    const east = x < SIZE - 1 && newData[y][z][x + 1] > 0;
                    const west = x > 0 && newData[y][z][x - 1] > 0;
                    const south = z < SIZE - 1 && newData[y][z + 1][x] > 0;
                    const north = z > 0 && newData[y][z - 1][x] > 0;

                    const neighborCount = [east, west, south, north].filter(Boolean).length;

                    if (neighborCount === 1) {
                        if (east) newData[y][z][x] = facingMap['east'];
                        else if (west) newData[y][z][x] = facingMap['west'];
                        else if (south) newData[y][z][x] = facingMap['south'];
                        else if (north) newData[y][z][x] = facingMap['north'];
                    } else if (neighborCount === 3) {
                        if (!east) newData[y][z][x] = facingMap['east'];
                        else if (!west) newData[y][z][x] = facingMap['west'];
                        else if (!south) newData[y][z][x] = facingMap['south'];
                        else if (!north) newData[y][z][x] = facingMap['north'];
                    } else if (neighborCount === 2) {
                        if (east && west) newData[y][z][x] = facingMap['south'];
                        else if (north && south) newData[y][z][x] = facingMap['east'];
                        else if (east && north) newData[y][z][x] = facingMap['east'];
                        else if (east && south) newData[y][z][x] = facingMap['east'];
                        else if (west && north) newData[y][z][x] = facingMap['south'];
                        else if (west && south) newData[y][z][x] = facingMap['south'];
                    }
                }
            }
        }
    }

    return { grid: newData, palette: newPalette };
}
