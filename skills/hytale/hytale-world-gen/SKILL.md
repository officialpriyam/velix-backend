---
name: hytale-world-gen
description: World generation and terrain creation for Hytale. Covers the V2 Orbis generator, visual node editor, biome creation, zones, procedural terrain, and resource placement. Use when creating custom biomes, modifying terrain generation, or designing procedural content.
---

# Hytale World Generation

Create custom biomes and procedural terrain using Hytale's world generation system.

## Overview

Hytale uses the **V2 Orbis Generator** - a powerful visual node-based system for world generation. You can create entire biomes and terrain without writing code!

## World Structure

### Hierarchy

```
World (Orbis)
└── Zones (large regions)
    └── Biomes (environment types)
        └── Features (terrain, props, structures)
```

### Zones

Zones are large regions with themed biomes:

| Zone | Theme | Biomes |
|------|-------|--------|
| Zone 1 | Temperate | Forests, plains, lakes |
| Zone 2 | Desert | Sand dunes, oases, ruins |
| Zone 3 | Arctic | Tundra, glaciers, snow |
| Zone 4 | Volcanic | Lava, ash, obsidian |

---

## Visual Node Editor

### What It Does

The node editor lets you create world generation rules by connecting visual nodes - no coding required!

```
[Noise Node] → [Threshold] → [Material Provider] → [Terrain Output]
```

### Node Types

| Node Type | Purpose |
|-----------|---------|
| **Noise** | Generate random patterns (Perlin, Simplex) |
| **Math** | Combine, blend, transform values |
| **Threshold** | Create cutoffs (above/below values) |
| **Material** | Define block types |
| **Placement** | Position props and structures |
| **Output** | Final terrain/biome result |

### Example: Simple Hills

```
[Perlin Noise]
    │
    ▼
[Scale: 0.02]     ← Controls frequency
    │
    ▼
[Multiply: 20]    ← Controls height
    │
    ▼
[Add: 64]         ← Base height
    │
    ▼
[Heightmap Output]
```

---

## Biome Creation

### Biome Components

Each biome defines:
- **Terrain shape** (heightmap)
- **Surface materials** (grass, sand, stone)
- **Subsurface layers** (dirt depth, rock)
- **Covers** (vegetation, debris)
- **Props** (trees, rocks, flowers)
- **Structures** (buildings, ruins)
- **Creatures** (spawn lists)

### Biome Definition (JSON)

```json
{
  "biomeId": "mymod:enchanted_forest",
  "displayName": "Enchanted Forest",
  "temperature": 0.7,
  "humidity": 0.8,
  "terrain": "mymod:enchanted_forest_terrain",
  "surfaceMaterial": "hytale:grass_block",
  "covers": [
    {
      "type": "hytale:tall_grass",
      "density": 0.3
    },
    {
      "type": "mymod:glowing_mushroom",
      "density": 0.05
    }
  ],
  "props": [
    {
      "prefab": "mymod:enchanted_tree",
      "frequency": 0.1,
      "minSpacing": 5
    }
  ]
}
```

---

## Terrain Layers

### Layer System

```
Surface    ─────────────  (grass, sand)
    │
    ▼
Topsoil    ─────────────  (dirt, 3-5 blocks deep)
    │
    ▼
Subsoil    ─────────────  (stone variants)
    │
    ▼
Bedrock    ─────────────  (unbreakable base)
```

### Layer Definition

```json
{
  "layers": [
    {
      "material": "hytale:grass_block",
      "depth": 1,
      "condition": "surface_exposed"
    },
    {
      "material": "hytale:dirt",
      "depth": { "min": 3, "max": 5 }
    },
    {
      "material": "hytale:stone",
      "depth": "remaining"
    }
  ]
}
```

---

## Props and Structures

### Prop Placement

```json
{
  "propPlacements": [
    {
      "prefab": "hytale:oak_tree",
      "frequency": 0.08,
      "conditions": {
        "surface": "grass",
        "slope": { "max": 0.3 },
        "minNeighborDistance": 4
      }
    }
  ]
}
```

### Pattern Scanning

Place props based on terrain patterns:

```json
{
  "pattern": "near_water",
  "searchRadius": 5,
  "prefab": "hytale:willow_tree",
  "frequency": 0.2
}
```

---

## Caves and Underground

### Cave Generation

```json
{
  "caveSystem": {
    "type": "worm",
    "frequency": 0.02,
    "minRadius": 2,
    "maxRadius": 6,
    "branchChance": 0.3,
    "features": [
      {
        "type": "stalactite",
        "frequency": 0.1
      },
      {
        "type": "ore_vein",
        "ores": ["iron", "gold"],
        "frequency": 0.05
      }
    ]
  }
}
```

---

## Ore Distribution

### Ore Veins

```json
{
  "oreGeneration": [
    {
      "ore": "hytale:iron_ore",
      "minHeight": 0,
      "maxHeight": 64,
      "veinSize": { "min": 4, "max": 8 },
      "frequency": 0.01
    },
    {
      "ore": "hytale:diamond_ore",
      "minHeight": 0,
      "maxHeight": 16,
      "veinSize": { "min": 1, "max": 4 },
      "frequency": 0.002
    }
  ]
}
```

---

## Water and Rivers

### Water Bodies

```json
{
  "waterGeneration": {
    "seaLevel": 62,
    "riverFrequency": 0.05,
    "lakeFrequency": 0.02,
    "riverWidth": { "min": 3, "max": 10 }
  }
}
```

---

## Creative Mode Tools

### Scripted Brushes

Use in-game for rapid terrain editing:
- **Raise/Lower** terrain
- **Smooth** rough areas
- **Paint** biome transitions
- **Stamp** prefabs

### Live Preview

Changes in the node editor show immediately in-game!

---

## Best Practices

### Do

| Practice | Why |
|----------|-----|
| Start simple | Add complexity gradually |
| Use live preview | Catch issues early |
| Test transitions | Biome edges should blend |
| Consider gameplay | Fun to explore |

### Don't

| Mistake | Why Bad |
|---------|---------|
| Too much noise | Chaotic terrain |
| Sharp transitions | Unnatural feel |
| Overload with props | Performance issues |
| Ignore spawn rules | Creatures stuck |

---

## Quick Reference

| Task | Location |
|------|----------|
| Edit biomes | Asset Editor → Biomes |
| Node editor | World Gen → Visual Editor |
| Test in-game | Creative Mode → Fly around |
| Place prefabs | Prefab Editor |

---

## Resources

- **Prefabs**: See `hytale-prefab-builder` skill
- **Pack Creation**: See `hytale-pack-creator` skill
