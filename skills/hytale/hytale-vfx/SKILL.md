---
name: hytale-vfx
description: Visual effects and particle systems for Hytale mods. Covers particle emitters, effect triggers, custom particles, trails, and visual feedback. Use when creating spell effects, explosions, weather, ambient particles, or any visual feedback.
---

# Hytale VFX & Particles

Create custom visual effects and particle systems for your Hytale mods.

## VFX Types

| Type | Use For | Examples |
|------|---------|----------|
| **Particles** | Small visual elements | Sparks, dust, bubbles |
| **Trails** | Following motion | Sword swings, projectiles |
| **Bursts** | One-time effects | Explosions, impacts |
| **Ambient** | Environmental | Fireflies, snow, leaves |
| **Auras** | Entity effects | Buffs, status effects |

---

## Folder Structure

```
MyPack/
└── Common/
    └── VFX/
        ├── particles/
        │   ├── spark.json
        │   └── magic_dust.json
        ├── effects/
        │   ├── explosion.json
        │   └── heal_aura.json
        └── textures/
            ├── particle_spark.png
            └── particle_dust.png
```

---

## Particle Definition

### Basic Particle

```json
{
  "particleId": "mymod:magic_spark",
  "texture": "textures/particle_spark.png",
  "lifetime": {
    "min": 0.5,
    "max": 1.5
  },
  "size": {
    "start": 0.2,
    "end": 0.0
  },
  "color": {
    "start": [1.0, 0.8, 0.2, 1.0],
    "end": [1.0, 0.2, 0.0, 0.0]
  },
  "velocity": {
    "x": { "min": -0.5, "max": 0.5 },
    "y": { "min": 0.5, "max": 1.5 },
    "z": { "min": -0.5, "max": 0.5 }
  },
  "gravity": -0.5,
  "emissive": true
}
```

### Particle Properties

| Property | Description |
|----------|-------------|
| `texture` | Sprite image |
| `lifetime` | Duration in seconds |
| `size.start/end` | Size over time |
| `color.start/end` | RGBA over time |
| `velocity` | Initial speed |
| `gravity` | Downward force |
| `emissive` | Glows in dark |
| `collides` | Stops at blocks |

---

## Particle Emitters

### Emitter Definition

```json
{
  "emitterId": "mymod:campfire_smoke",
  "particle": "mymod:smoke_puff",
  "rate": 5,
  "shape": "point",
  "offset": { "y": 0.5 },
  "continuous": true
}
```

### Emitter Shapes

| Shape | Description |
|-------|-------------|
| `point` | Single origin |
| `sphere` | Random in sphere |
| `box` | Random in box |
| `ring` | Circle outline |
| `cone` | Cone direction |

```json
{
  "emitterId": "mymod:aura",
  "shape": "sphere",
  "shapeParams": {
    "radius": 1.0,
    "surface": true
  }
}
```

---

## Effect Definitions

### Burst Effect

```json
{
  "effectId": "mymod:explosion",
  "particles": [
    {
      "particle": "mymod:fire_spark",
      "count": 50,
      "burst": true
    },
    {
      "particle": "mymod:smoke",
      "count": 20,
      "delay": 0.1
    }
  ],
  "sound": "mymod:explosion_sound",
  "light": {
    "color": [1.0, 0.5, 0.0],
    "intensity": 2.0,
    "duration": 0.3
  }
}
```

### Trail Effect

```json
{
  "effectId": "mymod:sword_trail",
  "type": "trail",
  "texture": "textures/trail_slash.png",
  "length": 5,
  "width": 0.3,
  "fadeTime": 0.2,
  "color": [0.8, 0.9, 1.0, 0.8]
}
```

---

## Attaching VFX to Content

### Block VFX

```json
{
  "blockId": "mymod:magic_crystal",
  "vfx": {
    "ambient": {
      "emitter": "mymod:crystal_sparkle",
      "offset": { "y": 0.5 }
    },
    "break": "mymod:crystal_shatter"
  }
}
```

### Item VFX

```json
{
  "itemId": "mymod:fire_sword",
  "vfx": {
    "held": "mymod:flame_aura",
    "attack": "mymod:fire_slash"
  }
}
```

### Entity VFX

```json
{
  "entityId": "mymod:fire_elemental",
  "vfx": {
    "ambient": "mymod:fire_aura",
    "hurt": "mymod:ember_burst",
    "death": "mymod:fire_explosion"
  }
}
```

---

## Triggering VFX in Plugins

### Play Effect

```java
// Play at position
world.playEffect("mymod:explosion", position);

// Play on entity
entity.playEffect("mymod:heal_aura");

// Play with options
world.playEffect("mymod:magic_burst", position, EffectOptions.builder()
    .scale(2.0f)
    .color(Color.BLUE)
    .duration(3.0f)
    .build());
```

### Attach Continuous Effect

```java
// Start continuous effect
EffectHandle handle = entity.startEffect("mymod:fire_aura");

// Later, stop it
handle.stop();

// Or with fade
handle.fadeOut(1.0f);
```

### Projectile Trails

```java
Projectile arrow = world.spawnProjectile("arrow", position, velocity);
arrow.setTrailEffect("mymod:magic_trail");
```

---

## Common Effect Patterns

### Heal Effect

```json
{
  "effectId": "mymod:heal",
  "particles": [
    {
      "particle": "mymod:heal_plus",
      "count": 10,
      "velocity": { "y": { "min": 0.5, "max": 1.0 } }
    },
    {
      "particle": "mymod:sparkle",
      "count": 20,
      "shape": "sphere",
      "radius": 0.5
    }
  ],
  "sound": "mymod:heal_sound"
}
```

### Level Up Effect

```json
{
  "effectId": "mymod:level_up",
  "particles": [
    {
      "particle": "mymod:star",
      "count": 30,
      "shape": "ring",
      "radius": 1.0,
      "velocity": { "y": { "min": 1.0, "max": 2.0 } }
    }
  ],
  "light": {
    "color": [1.0, 1.0, 0.5],
    "intensity": 3.0,
    "duration": 1.0
  }
}
```

### Weather Particles

```json
{
  "emitterId": "mymod:snow",
  "particle": "mymod:snowflake",
  "rate": 50,
  "area": { "width": 32, "height": 20 },
  "followPlayer": true,
  "velocity": { 
    "y": { "min": -2.0, "max": -1.0 },
    "x": { "min": -0.3, "max": 0.3 }
  }
}
```

---

## Performance Tips

### Do

| Practice | Why |
|----------|-----|
| Limit particle count | Performance |
| Use simple textures | Memory |
| Short lifetimes | Cleanup |
| Pool particles | Efficiency |

### Don't

| Mistake | Why Bad |
|---------|---------|
| Too many particles | FPS drops |
| Huge textures | Memory waste |
| Infinite emitters | Memory leak |
| Complex shapes | CPU heavy |

---

## Asset Editor Workflow

1. Open Asset Editor
2. Navigate to VFX section
3. Create new particle/effect
4. Adjust properties visually
5. Preview in real-time
6. Save and test in-game

---

## Quick Reference

| Task | How |
|------|-----|
| Create particle | Define in particles/ JSON |
| Create emitter | Define with rate and shape |
| Attach to block | Add `vfx` to block JSON |
| Play from plugin | `world.playEffect("id", pos)` |
| Create trail | Use `type: "trail"` effect |

---

## Resources

- **Animation**: See `hytale-animation` skill
- **Audio**: See `hytale-audio` skill
- **Pack Creation**: See `hytale-pack-creator` skill
