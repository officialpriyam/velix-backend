---
name: hytale-server-mods
description: Installing mods on a Hytale dedicated server. Covers the correct folder structure (mods vs plugins), config file locations, BlockCounter issues, and Docker considerations. Use when adding mods to a Hytale server, troubleshooting mod loading issues, or configuring mod settings.
---

# Installing Mods on a Hytale Server

This skill covers installing and configuring mods on a Hytale dedicated server.

## Critical: Folder Location

**Mods go in the `mods/` folder, NOT `plugins/`!**

```
server/
├── mods/           ← PUT MODS HERE (.jar files)
│   ├── YourMod.jar
│   └── YourMod/    ← Config folder (auto-generated)
├── plugins/        ← OLD/WRONG location - mods won't load here
├── config.json     ← Server config
└── universe/       ← World data
```

## Installation Steps

### 1. Download the Mod
Get the `.jar` file from CurseForge or other source.

### 2. Upload to Server
```bash
scp YourMod.jar user@server:/path/to/hytale/server/mods/
```

### 3. Restart Server
```bash
# For Docker:
cd /path/to/hytale && docker compose restart

# For bare metal:
# Stop → Start the server process
```

### 4. Verify Loading
Check server logs for the mod name:
```bash
docker logs hytale-server 2>&1 | grep -i 'YourModName'
```

Look for: `[PluginManager] - com.author:ModName`

### 5. Configure the Mod
After first load, config folder appears:
```
mods/
└── com.author_ModName/
    └── ModName.json    ← Edit this file
```

**Important:** Stop the server before editing configs (server may overwrite on shutdown).

---

## Common Issues

### Issue 1: Mod Not Loading
**Symptom:** No log messages, commands not working

**Causes & Fixes:**
1. **Wrong folder** - Move from `plugins/` to `mods/`
2. **Docker not mounting** - Check `docker-compose.yml` volumes include `./server/mods:/server/mods`
3. **Mod not registered** - Some mods need entry in `config.json` Mods section

### Issue 2: Config Changes Not Applying
**Symptom:** Edit config, restart, settings revert

**Fix:** Stop server completely before editing:
```bash
docker compose stop    # Not restart!
# Edit config
docker compose start
```

### Issue 3: BlockCounter Limiting Features
**Symptom:** "Limit reached" even with mod configured for unlimited

**Cause:** `BlockCounter.json` tracks placements from before mod was active

**Fix:**
```bash
docker compose stop
# Reset the counter:
echo '{"BlockPlacementCounts":{}}' > server/universe/worlds/default/resources/BlockCounter.json
docker compose start
```

### Issue 4: LuckPerms Not Found Warning
**Symptom:** Log shows "LuckPerms API class not found"

**Impact:** Usually harmless - mod falls back to config file settings. Only install LuckPerms if you need per-rank permissions.

---

## Docker Considerations

The server runs in Docker, which means:

1. **Volume mounts matter** - Only mounted folders are accessible
2. **File ownership** - Files created by Docker may be owned by root
3. **Restart vs Stop/Start** - Use `stop` then `start` when editing files the server writes to

### Typical docker-compose.yml volumes:
```yaml
volumes:
  - ./server:/server
  - ./server/mods:/server/mods
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Upload mod | `scp mod.jar host:/path/server/mods/` |
| Restart server | `docker compose restart` |
| Stop for config edit | `docker compose stop` |
| Check mod loaded | `docker logs container 2>&1 \| grep ModName` |
| View config folder | `ls server/mods/com.author_ModName/` |

---

## Pre-Built Mods vs Custom Development

### Pre-Built Mods (CurseForge)
Download `.jar` from CurseForge → Put in `mods/` → Configure → Done!

### Packs (Data Mods) - CAN Create From Scratch ✅
Use the `hytale-pack-creator` skill to create Packs that:
- Add blocks, items, textures
- Override game configs (GameplayConfigs, etc.)
- Add translations

Packs go in `mods/YourPackName/` with a `manifest.json`.

### Java Plugins - CAN Create ✅ (but setup required)
You CAN create Java plugins. The setup requires:

1. **Java 25** - Hard requirement, uses modern features
2. **Extract API from HytaleServer.jar** - Install to local Maven cache:
   ```bash
   mvn install:install-file \
       -Dfile="HytaleServer.jar" \
       -DgroupId=com.hypixel.hytale \
       -DartifactId=Server \
       -Dversion=1.0-SNAPSHOT \
       -Dpackaging=jar
   ```
3. **Use community maven mirror**: `maven.hytale-modding.info/releases`
4. **Use `hytale-mod` Gradle plugin** for build tooling

See `hytale-plugin-dev` skill for full setup guide.
