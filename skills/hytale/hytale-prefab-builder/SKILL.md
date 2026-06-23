---
name: hytale-prefab-builder
description: Creating and managing prefabs (reusable structures) in Hytale. Covers prefab editing worlds, selection tools, saving/loading prefabs, paste brush usage, and organizing prefab libraries. Use when building structures, creating dungeons, designing villages, or any reusable construction work.
---

# Hytale Prefab Builder

Create reusable structures and buildings using Hytale's prefab system.

## What Are Prefabs?

Prefabs are **reusable structures** that can be:
- Built once, placed many times
- Shared between worlds
- Used in world generation
- Exported and imported

## Prefab Workflow

### Step 1: Create a Prefab Editing World

```
/editprefab new <world-name>
```

This creates a dedicated world for building prefabs with special tools.

### Step 2: Build Your Structure

Build your structure using normal building tools:
- Place blocks
- Add decorations
- Include entities (NPCs, furniture)
- Set lighting

### Step 3: Select the Area

Use the **Selection Tool** to define the prefab bounds:

1. Equip the Selection Tool (from Creative menu)
2. Left-click to set first corner
3. Right-click to set second corner
4. The selected area is highlighted

### Step 4: Save the Prefab

```
/prefab save <prefab-name>
```

Prefab is saved to: `%APPDATA%/Hytale/UserData/Prefabs/`

### Step 5: Exit Editing World

```
/editprefab exit
```

---

## Placing Prefabs

### Method 1: Paste Brush

1. Open Creative menu
2. Select **Paste Brush**
3. Choose prefab from list
4. Click to place in world

### Method 2: Command

```
/prefab list                    # Show available prefabs
/prefab paste <prefab-name>     # Paste at current location
/prefab paste <name> <x> <y> <z> # Paste at coordinates
```

---

## Prefab Commands Reference

| Command | Description |
|---------|-------------|
| `/editprefab new <name>` | Create new prefab editing world |
| `/editprefab enter <name>` | Enter existing prefab world |
| `/editprefab exit` | Exit prefab editing world |
| `/prefab save <name>` | Save selected area as prefab |
| `/prefab list` | List available prefabs |
| `/prefab paste <name>` | Paste prefab at position |
| `/prefab delete <name>` | Delete a prefab |
| `/prefab info <name>` | Show prefab details |

---

## Prefab Best Practices

### Structure Design

- **Start with floor** - Build from bottom up
- **Include margins** - Leave space around edges
- **Consider rotation** - Design to look good from all angles
- **Add variation points** - Mark where randomization can occur

### Naming Conventions

Use clear, descriptive names:

```
building_house_small
building_house_large
dungeon_entrance
dungeon_room_treasure
village_market_stall
decoration_fountain
```

### Organization

Group prefabs by category:

```
Prefabs/
├── buildings/
│   ├── houses/
│   └── shops/
├── dungeons/
│   ├── rooms/
│   └── corridors/
├── decorations/
└── nature/
```

---

## Advanced Features

### Prefab with Entities

Prefabs can include:
- NPCs (villagers, merchants)
- Creatures (pets, guards)
- Items (chests with loot)
- Interactive blocks (doors, switches)

### Prefab Variants

Create variations of the same structure:
- `house_wooden_01`, `house_wooden_02`
- Same base design, different details

### Nested Prefabs

Use prefabs inside other prefabs:
1. Place sub-prefab
2. Build around it
3. Save combined structure

---

## World Generation Integration

Prefabs can be used in procedural world generation:

1. Create prefab structures
2. Define placement rules (in Pack JSON)
3. Game spawns prefabs during world gen

**Example placement config** (in Pack):

```json
{
  "type": "prefab_placement",
  "prefab": "building_house_small",
  "biomes": ["plains", "forest"],
  "frequency": 0.1,
  "minSpacing": 50
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Prefab not saving | Check selection is valid |
| Missing blocks | Ensure all blocks are in selection |
| Entities not included | Verify entities are within bounds |
| Prefab invisible | Check file location and permissions |

---

## Quick Reference

| Task | Command/Action |
|------|----------------|
| New prefab world | `/editprefab new myworld` |
| Save prefab | `/prefab save mybuilding` |
| List prefabs | `/prefab list` |
| Place prefab | Paste Brush or `/prefab paste` |
| Exit editing | `/editprefab exit` |

---

## Resources

- **Prefab Location**: `%APPDATA%/Hytale/UserData/Prefabs/`
- **Related Skill**: See `hytale-pack-creator` for world gen integration
