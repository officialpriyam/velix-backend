---
name: hytale-model-creator
description: Creating 3D models for Hytale using Blockbench with official Hytale plugin. Covers Hytale art style pillars, geometry constraints (cubes/quads only), texture density guidelines, bone naming conventions, and animation export. Use when creating characters, mobs, props, blocks, or any 3D assets for Hytale.
---

# Hytale Model Creator

Create 3D models for Hytale using Blockbench following official art style guidelines.

## IMPORTANT: First-Time Setup Flow

When a user asks you to create a model, follow this setup checklist:

### Step 1: Check MCP Configuration

Check if `.mcp.json` exists in workspace root. If not, guide user through setup:

```
I'll help you create that model! First, let me set up AI-assisted Blockbench control.

Prerequisites you need installed:
1. Blockbench (blockbench.net) - the 3D modeling tool
2. Node.js 18+ (nodejs.org) - for the MCP server
3. pnpm (run: npm install -g pnpm)

Shall I guide you through the BlockbenchMCP installation?
```

### Step 2: Install BlockbenchMCP (One-Time)

If user confirms, guide them:

```bash
# Clone and build BlockbenchMCP
git clone https://github.com/enfp-dev-studio/blockbench-mcp.git
cd blockbench-mcp
pnpm install
pnpm build

# Build the Blockbench plugin
cd apps/mcp-plugin
pnpm build
```

Then in Blockbench:
1. **File → Plugins → Load Plugin from File**
2. Select: `blockbench-mcp/apps/mcp-plugin/dist/` 
3. Enable "MCP Plugin"

Also install the **Hytale plugin** in Blockbench:
- **File → Plugins → Search "hytale" → Install**

### Step 3: Configure Antigravity MCP

Create `.mcp.json` in workspace root:

```json
{
  "mcpServers": {
    "blockbench": {
      "command": "node",
      "args": ["C:/path/to/blockbench-mcp/apps/mcp-server/dist/index.js"]
    }
  }
}
```

Tell user to **restart Antigravity** after creating this file.

### Step 4: Start Blockbench Connection

In Blockbench:
1. Open **View → Panels**
2. Find "MCP Plugin" panel
3. Click **"Connect to MCP Server"** (listens on port 9999)

Now you have direct Blockbench control!

---

## Creating Models (After Setup)

Once MCP is configured, you can directly control Blockbench to create models.

### Workflow

1. **Start Blockbench** and connect MCP plugin
2. **Create new Hytale model**: File → New → Hytale Model
3. **Build geometry** using only cubes and quads
4. **Apply textures** at proper density
5. **Set bone hierarchy** with correct naming
6. **Export** for Hytale

---

## Hytale Art Style Guidelines

### The Four Pillars

| Pillar | Description |
|--------|-------------|
| **Immersive** | World feels alive - motion, detail, reactions |
| **Fantasy** | Medieval fantasy core, consistent across themes |
| **Stylized** | Iconic, easily readable proportions |
| **Flexible** | Simple structure, easy to understand |

### Geometry Rules

**ONLY use:**
- ✅ Cubes (6 sides)
- ✅ Quads (2 sides)

**NOT allowed:**
- ❌ Spheres
- ❌ Edge loops
- ❌ Triangles/pyramids

### Texture Density

| Asset Type | Density | Example Size |
|------------|---------|--------------|
| Props/Blocks | 32px/unit | 32x32, 64x64 |
| Characters | 64px/unit | 64x64, 128x128 |

- Must be multiples of 32px
- Non-square allowed

### Proportions

- Characters: **Small, bulky, cartoony, toylike**
- Blocks/furniture: **Pure, iconic shapes**

### Triangle Counts

| Model Type | Target |
|------------|--------|
| Simple block | 12-24 |
| Furniture | 50-200 |
| Character | 200-800 |
| Complex entity | 500-1500 |

### Stretching Limits

- Minimum: **0.7x**
- Maximum: **1.3x**

### Color Rules

- ❌ No pure white (#FFFFFF)
- ❌ No pure black (#000000)
- ✅ Add color to shadows (purple tints work great)
- ✅ Bake lighting into textures

---

## Bone Naming (Auto-Animation)

Use exact names for Hytale's animation system:

```
root
├── body
│   ├── head
│   │   ├── jaw (optional)
│   │   └── eyes (optional)
│   ├── arm_right
│   │   ├── forearm_right
│   │   └── hand_right
│   ├── arm_left
│   │   ├── forearm_left
│   │   └── hand_left
│   └── waist
│       ├── leg_right
│       │   ├── shin_right
│       │   └── foot_right
│       └── leg_left
│           ├── shin_left
│           └── foot_left
```

---

## Quick Reference Card

| Aspect | Guideline |
|--------|-----------|
| Geometry | Cubes and quads only |
| Spheres | ❌ Never |
| Stretch | 0.7x to 1.3x |
| Texture size | Multiples of 32px |
| Props density | 32px/unit |
| Character density | 64px/unit |
| Pure black/white | ❌ Avoid |
| Shadow color | Add hue (purple) |

---

## Resources

- **Official Guide**: [Making Models for Hytale](https://hytale.com/news/2025/12/an-introduction-to-making-models-for-hytale)
- **Example Models**: [Download Official Examples (ZIP)](https://cdn.hytale.com/Hytale%20Model%20Examples.zip)
- **Art Style Details**: See [references/art-style.md](references/art-style.md)
