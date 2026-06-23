---
name: hytale-audio
description: Audio and sound design for Hytale mods. Covers custom sound effects, music integration, ambient sounds, volume/pitch control, and audio triggers. Use when adding sounds to blocks, items, mobs, biomes, or creating custom music systems.
---

# Hytale Audio & Sound Design

Add custom sounds and music to your Hytale mods.

## Audio Types in Hytale

| Type | Use For | Examples |
|------|---------|----------|
| **Sound Effects** | Actions, feedback | Block break, item pickup, attack |
| **Ambient** | Environment | Wind, water, cave echoes |
| **Music** | Background | Biome themes, boss battles |
| **Voice/Dialogue** | NPCs | Greetings, quests |
| **UI Sounds** | Interface | Button clicks, notifications |

---

## File Formats

| Format | Use For | Notes |
|--------|---------|-------|
| `.ogg` | All sounds | Preferred, smaller files |
| `.wav` | High quality SFX | Larger files |
| `.mp3` | Music | Good compression |

---

## Folder Structure

```
MyPack/
└── Common/
    └── Sounds/
        ├── blocks/
        │   ├── my_block_break.ogg
        │   └── my_block_place.ogg
        ├── mobs/
        │   ├── my_mob_idle.ogg
        │   └── my_mob_hurt.ogg
        ├── ambient/
        │   └── my_biome_wind.ogg
        └── music/
            └── my_theme.ogg
```

---

## Defining Sounds (JSON)

### Sound Definition

```json
{
  "soundId": "mymod:block_break",
  "file": "sounds/blocks/my_block_break.ogg",
  "volume": 1.0,
  "pitch": {
    "min": 0.9,
    "max": 1.1
  },
  "distance": {
    "min": 1,
    "max": 16
  },
  "loop": false
}
```

### Sound Properties

| Property | Description | Default |
|----------|-------------|---------|
| `volume` | Loudness (0.0 - 2.0) | 1.0 |
| `pitch.min/max` | Random pitch range | 1.0 |
| `distance.min` | Full volume range | 1 |
| `distance.max` | Fade to silence | 16 |
| `loop` | Repeat continuously | false |
| `category` | Sound category | "effects" |

---

## Attaching Sounds to Content

### Block Sounds

```json
{
  "blockId": "mymod:crystal_block",
  "sounds": {
    "break": "mymod:crystal_break",
    "place": "mymod:crystal_place",
    "step": "mymod:crystal_step",
    "hit": "mymod:crystal_hit"
  }
}
```

### Item Sounds

```json
{
  "itemId": "mymod:magic_wand",
  "sounds": {
    "use": "mymod:wand_cast",
    "equip": "mymod:wand_equip"
  }
}
```

### Mob Sounds

```json
{
  "entityId": "mymod:dragon",
  "sounds": {
    "idle": {
      "sound": "mymod:dragon_idle",
      "interval": { "min": 5, "max": 15 }
    },
    "hurt": "mymod:dragon_hurt",
    "death": "mymod:dragon_death",
    "attack": "mymod:dragon_roar",
    "step": "mymod:dragon_step"
  }
}
```

---

## Ambient Sounds

### Biome Ambient

```json
{
  "biomeId": "mymod:enchanted_forest",
  "ambient": {
    "sound": "mymod:forest_ambience",
    "volume": 0.5,
    "loop": true
  },
  "randomSounds": [
    {
      "sound": "mymod:bird_chirp",
      "interval": { "min": 10, "max": 30 },
      "chance": 0.3
    }
  ]
}
```

### Location-Based Sounds

```json
{
  "type": "sound_emitter",
  "position": { "x": 100, "y": 64, "z": 200 },
  "sound": "mymod:waterfall",
  "radius": 20,
  "loop": true
}
```

---

## Music System

### Music Tracks

```json
{
  "musicId": "mymod:boss_theme",
  "file": "sounds/music/boss_theme.ogg",
  "fadeIn": 2.0,
  "fadeOut": 3.0,
  "volume": 0.8
}
```

### Music Triggers

```json
{
  "trigger": "enter_biome",
  "biome": "mymod:dark_forest",
  "music": "mymod:dark_forest_theme"
}
```

### In Plugin

```java
// Play music for a player
player.playMusic("mymod:boss_theme");

// Stop music
player.stopMusic();

// Fade to new music
player.crossfadeMusic("mymod:victory_theme", 2.0f);
```

---

## Playing Sounds in Plugins

### Basic Playback

```java
// Play at entity location
entity.playSound("mymod:dragon_roar");

// Play at position
world.playSound("mymod:explosion", position);

// Play with options
world.playSound("mymod:thunder", position, SoundOptions.builder()
    .volume(2.0f)
    .pitch(0.8f)
    .build());
```

### Player-Specific Sounds

```java
// Only this player hears it
player.playSound("mymod:level_up");

// UI sound (no 3D positioning)
player.playUISound("mymod:button_click");
```

---

## Sound Categories

| Category | Description | Player Control |
|----------|-------------|----------------|
| `master` | All sounds | Yes |
| `music` | Background music | Yes |
| `effects` | Sound effects | Yes |
| `ambient` | Environmental | Yes |
| `voice` | NPC dialogue | Yes |
| `ui` | Interface sounds | Yes |

```json
{
  "soundId": "mymod:npc_greeting",
  "category": "voice",
  "file": "sounds/voice/greeting.ogg"
}
```

---

## Audio Tips

### Do

| Practice | Why |
|----------|-----|
| Use .ogg format | Smaller files, good quality |
| Add pitch variation | Sounds less repetitive |
| Set appropriate distance | Immersive falloff |
| Test in-game | Volumes differ |
| Loop ambient smoothly | No jarring restart |

### Don't

| Mistake | Why Bad |
|---------|---------|
| Too loud sounds | Annoys players |
| No variation | Repetitive |
| Huge files | Slow loading |
| Clipping audio | Distortion |

---

## Creating Sound Effects

### Tools

- **Audacity** - Free, cross-platform editor
- **BFXR/SFXR** - Retro game sound generator
- **Freesound.org** - Free sound library (check licenses!)

### Workflow

1. Record or generate sound
2. Edit in Audacity (trim, normalize)
3. Export as .ogg (Quality 5-7)
4. Place in Sounds folder
5. Define in JSON
6. Test in-game

---

## Quick Reference

| Task | How |
|------|-----|
| Add block sound | Define in block JSON `sounds` |
| Add mob sound | Define in entity JSON `sounds` |
| Play from plugin | `entity.playSound("id")` |
| Loop ambient | Set `loop: true` in definition |
| Add biome music | Define music trigger |

---

## Resources

- **Pack Creation**: See `hytale-pack-creator` skill
- **Plugin Development**: See `hytale-plugin-dev` skill
- **NPC Dialogue**: See `hytale-npc-ai` skill
