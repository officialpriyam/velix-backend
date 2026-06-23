---
name: hytale-pack-creator
description: Creating Hytale Packs (content/asset packs) for adding blocks, items, mobs, and behavior without coding. Use when working with Pack folder structure, manifest.json, block definitions, item categories, block states, textures, or the Asset Editor. Triggers on Hytale Pack creation, block/item modding, or data asset configuration.
---

# Hytale Pack Creator

Create Packs to add new blocks, items, mobs, and behavior to Hytale without coding.

## Pack Overview

Packs are content/asset packages that define game content via JSON files. They don't require programming - use the in-game **Asset Editor** to modify settings visually.

**Pack Location**: `%AppData%/Hytale/UserData/Packs/YourPackName/`

## Quick Start Workflow

1. Create Pack folder in `%AppData%/Hytale/UserData/Packs/`
2. Create `manifest.json` with Pack metadata
3. Add `Common/` folder (visuals) and `Server/` folder (logic)
4. Create content (blocks, items, etc.) via JSON files
5. Add textures to `Common/` folder
6. Activate Pack in Hytale: Worlds tab → Right-click world → Toggle Pack

## Pack Structure

```
YourPackName/
├── manifest.json              # Pack metadata (required)
├── Common/                    # Visual assets (client-side)
│   ├── Icons/
│   │   └── ItemsGenerated/    # Inventory icons
│   ├── Models/                # 3D models
│   └── Textures/              # Block/item textures
└── Server/                    # Game logic (server-side)
    ├── Blocks/                # Block definitions
    ├── Items/                 # Item definitions
    ├── Categories/            # Creative menu categories
    └── Translations/          # Localization files
```

## Creating Content

### manifest.json (Required)

Every Pack needs a manifest file:

```json
{
  "Group": "YourName",
  "Name": "MyPack",
  "Version": "1.0.0",
  "Description": "Description of your Pack",
  "Authors": [
    { "Name": "YourName", "Role": "Author" }
  ],
  "ServerVersion": "*"
}
```

**Required fields**: Group, Name, Version, Description, Authors, ServerVersion

### Adding a Block

Create `Server/Blocks/my_block.json`:

```json
{
  "TranslationProperties": {
    "Name": "server.My_Block.name"
  },
  "MaxStack": 100,
  "Icon": "Icons/ItemsGenerated/My_Block.png",
  "Categories": ["Blocks.Rocks"],
  "PlayerAnimationsId": "Block",
  "Set": "Rock_Stone",
  "BlockType": {
    "Material": "Solid",
    "DrawType": "Cube",
    "Group": "Stone",
    "ParticleColor": "#808080",
    "BlockSoundSetId": "Stone",
    "Textures": {
      "All": "Textures/Blocks/my_block.png"
    }
  }
}
```

**BlockType.Material options**: `Solid`, `Liquid`, `Gas`
**BlockType.DrawType options**: `Cube`, `Cross`, `Model`

### Texture Requirements

| Type | Size | Format | Location |
|------|------|--------|----------|
| Block texture | 16x16 or 32x32 | PNG | `Common/Textures/Blocks/` |
| Icon | 32x32 or 64x64 | PNG | `Common/Icons/ItemsGenerated/` |

Transparency supported for non-solid blocks.

### Translations

Create `Server/Translations/en.json`:

```json
{
  "server.My_Block.name": "My Custom Block"
}
```

For multiple languages, create additional files: `es.json`, `de.json`, etc.

### Item Categories

Create `Server/Categories/my_category.json`:

```json
{
  "Parent": "Blocks",
  "Name": "server.category.my_category.name",
  "Icon": "Icons/Categories/my_category.png",
  "Order": 100,
  "Children": [
    {
      "Name": "server.category.subcategory.name",
      "Icon": "Icons/Categories/subcategory.png"
    }
  ]
}
```

Reference in block: `"Categories": ["my_category.subcategory"]`

### Block States (On/Off, Cycling)

Add to block JSON for interactive states:

```json
{
  "Interactions": [{
    "Type": "CycleState",
    "Hint": "server.my_block.interaction.toggle",
    "State": "active"
  }],
  "States": [
    {
      "Name": "off",
      "Initial": true,
      "BlockType": { "Textures": { "All": "Textures/block_off.png" } }
    },
    {
      "Name": "on",
      "BlockType": { "Textures": { "All": "Textures/block_on.png" } }
    }
  ]
}
```

## Asset Editor

Modify Pack settings visually in-game:

1. Enter world with Pack enabled
2. Open Creation Tools tab
3. Select Asset Editor
4. Modify block/item properties without editing JSON

**Editable via Asset Editor**: Most block properties, hitboxes, sounds, textures

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Block doesn't appear | Check Pack is enabled, verify JSON syntax, restart world |
| Missing texture (pink) | Verify file path matches JSON, check PNG format |
| Translation shows key | Verify translation file name matches language, check JSON syntax |
| States don't change | Verify Interactions and States arrays, check state names match |

## Resources

- **Block States**: See [references/block-states.md](references/block-states.md) for advanced state features
- **JSON Templates**: See [assets/templates/](assets/templates/) for starter files
