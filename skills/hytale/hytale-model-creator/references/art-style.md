# Hytale Art Style Reference

Detailed reference for Hytale's visual design principles.

## The Four Pillars

### 1. Immersive
- World feels alive
- Motion and detail everywhere
- Wind in leaves, creatures wander
- Clouds move, light pierces through
- World reacts to player
- Lasting impression on memory

### 2. Fantasy
- Medieval fantasy at core
- Consistent across different universes/themes
- Each character has unique personality
- Popular archetypes with unique twists

### 3. Stylized
- Iconic, easily identifiable proportions
- Readable regardless of scene clutter
- Simplicity is key (not low quality)
- Careful selection of what to preserve/discard

### 4. Flexible
- Composed of primitive shapes
- Easy to understand construction
- Simple technical structure
- Easy to iterate on
- Designed for user creativity

## Renderer Characteristics

Hytale's custom renderer:
- No standard PBR workflows (no roughness, normal maps, displacement)
- In-house light propagation techniques
- Selective shaders and post-processing:
  - Bloom
  - Depth of Field
  - Ambient Occlusion
- Models should look good without effects

## Color Temperature

### Lights
- Warm tones for indoor/artificial light
- Cool tones for outdoor/natural light

### Shadows
- Never pure gray/desaturated
- Add color hints (purple, blue, etc.)
- Creates vibrant, alive feeling

## Material Types (Shading Modes)

In-game materials available:
- Standard solid
- Transparent
- Emissive
- Foliage (wind reaction)

## Best Practices

1. **Test in-game** - Blockbench preview ≠ in-game appearance
2. **Start simple** - Add detail only when needed
3. **Prioritize silhouette** - Readable at distance
4. **Bake lighting** - Paint shadows into texture
5. **Use color in shadows** - Adds vibrancy
6. **Match density** - 32px props, 64px characters
