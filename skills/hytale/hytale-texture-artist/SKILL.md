---
name: hytale-texture-artist
description: Creating pixel art textures for Hytale following official art style guidelines. Covers texture density (32px/64px), color theory, shadow painting, avoiding pure black/white, and texture techniques. Use when creating textures for blocks, items, characters, or any visual assets.
---

# Hytale Texture Artist

Create pixel art textures following Hytale's official art style.

## Core Principles

Hytale textures are **illustrations painted onto 3D models**, not just flat colors. Every texture should have:
- Baked-in lighting and shadows
- Color variation (no flat surfaces)
- Readable silhouettes
- Consistent style

## Texture Density Standards

| Asset Type | Density | Texture Size |
|------------|---------|--------------|
| **Blocks** | 32px per unit | 32x32, 64x64 |
| **Props** | 32px per unit | 32x32, 64x64 |
| **Characters** | 64px per unit | 64x64, 128x128 |
| **Items/Icons** | 32px or 64px | 32x32, 64x64 |

**Rule**: All textures must be multiples of 32px.

---

## Color Rules

### Never Use

| Color | Why |
|-------|-----|
| Pure Black (#000000) | Too harsh, looks unnatural |
| Pure White (#FFFFFF) | Too bright, breaks immersion |
| Flat gray shadows | Feels dead and lifeless |

### Always Do

| Technique | Why |
|-----------|-----|
| Tinted shadows | Adds life (use purple, blue hints) |
| Warm highlights | Natural light feeling |
| Color variation | Prevents flat, boring surfaces |
| Subtle gradients | Creates depth |

---

## Shadow Painting Technique

### Step 1: Base Color

Start with your mid-tone base color:

```
Example stone: #8C8C8C (medium gray)
```

### Step 2: Add Light

Add lighter areas where light hits (typically top/left):

```
Highlight: #A8A8A8 (lighter gray)
Rim light: #B8B8B8 (lightest)
```

### Step 3: Add Shadows (With Color!)

Add darker areas with tinted shadows:

```
Shadow: #6A6878 (purple-tinted gray)
Deep shadow: #585068 (more purple)
```

### Step 4: Detail

Add texture details (cracks, spots, grain):
- Use pencil brush
- Keep consistent light direction
- Don't overdo detail

---

## Brush Workflow

### Recommended Brushes

| Brush | Use For |
|-------|---------|
| **Pencil (hard)** | Outlines, details, color blocking |
| **Soft round** | Gradients, volume, soft shadows |
| **Texture brush** | Surface noise, grain |

### Opacity Settings

- **Pencil**: 100% opacity for clean pixels
- **Soft round**: 10-30% for gradual blending
- **Texture**: 5-15% for subtle variation

---

## Material Guidelines

### Stone/Rock

```
Base: Desaturated cool gray (#8A8C90)
Highlight: Slightly warm (#A0A2A0)
Shadow: Blue-purple tint (#707080)
Details: Cracks, chips, weathering
```

### Wood

```
Base: Warm brown (#8B6B4A)
Highlight: Golden yellow hint (#A08058)
Shadow: Reddish-brown (#6B4A35)
Details: Grain lines, knots, rings
```

### Metal

```
Base: Cool gray-blue (#7A7A88)
Highlight: Near-white (#C8C8D0)
Shadow: Dark blue (#505068)
Details: Scratches, reflections, edges
```

### Foliage

```
Base: Varied greens (#4A8B4A, #5A9B50)
Highlight: Yellow-green (#70AB60)
Shadow: Blue-green (#3A6B40)
Details: Leaf shapes, veins
```

---

## Common Mistakes

### ❌ Bad Practices

| Mistake | Problem |
|---------|---------|
| Pure gray shadows | Looks lifeless |
| No light direction | Flat, confusing |
| Too much contrast | Harsh, unreadable |
| Inconsistent style | Breaks immersion |
| Over-detailing | Muddy at distance |

### ✅ Good Practices

| Technique | Benefit |
|-----------|---------|
| Consistent light | Unified look |
| Subtle color shifts | Natural depth |
| Limited palette | Cohesive style |
| Test in-game | Catches issues early |

---

## Texture Workflow

### 1. Set Up Canvas

- Create file at correct size (32x32, 64x64, etc.)
- Set up grid (View → Show Grid)
- Work at 400-800% zoom

### 2. Block In Colors

- Fill with base color
- Add main color regions
- Don't worry about detail yet

### 3. Establish Light

- Decide light direction (usually top-left)
- Add highlight areas
- Add shadow areas (with color!)

### 4. Add Details

- Surface texture
- Edge details
- Unique identifiers

### 5. Polish

- Soften harsh transitions
- Check at 100% zoom
- Test in-game

---

## File Formats

| Format | Use For |
|--------|---------|
| PNG | All Hytale textures |
| 32-bit | If transparency needed |
| sRGB | Color space |

---

## Quick Reference Card

| Aspect | Guideline |
|--------|-----------|
| Block density | 32px/unit |
| Character density | 64px/unit |
| Sizes | Multiples of 32px |
| Pure black | ❌ Never |
| Pure white | ❌ Never |
| Shadow color | Add purple/blue hints |
| Light direction | Consistent (top-left) |

---

## Resources

- **Hytale Art Guide**: [Official Blog Post](https://hytale.com/news/2025/12/an-introduction-to-making-models-for-hytale)
- **Color Palettes**: Use Lospec.com for retro palettes
- **Related Skills**: See `hytale-model-creator` for 3D workflow
