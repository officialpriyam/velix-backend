---
name: hytale-animation
description: Animation workflows for Hytale using Blockbench. Covers keyframe animation, character rigging, animation states, looping, easing, and export formats. Use when creating animations for mobs, characters, items, or any animated content.
---

# Hytale Animation

Create animations for characters, mobs, and objects using Blockbench.

## Tools Required

1. **Blockbench** - [blockbench.net](https://www.blockbench.net/)
2. **Hytale Blockbench Plugin** - File → Plugins → Search "hytale"
3. **(Optional) BlockbenchMCP** - For AI-assisted animation (see `blockbench-mcp` skill)

## Animation Basics

### Keyframe Animation

Animations in Hytale use **keyframe interpolation**:
- Set key poses at specific times
- Engine interpolates between them
- Supports position, rotation, and scale

### Animation Timeline

```
Frame 0     Frame 10    Frame 20    Frame 30
   |           |           |           |
   ▼           ▼           ▼           ▼
[Idle]  →  [Arm Up]  →  [Strike]  →  [Idle]
```

---

## Creating Animations in Blockbench

### Step 1: Open Your Model

1. Open Blockbench with Hytale plugin
2. Load or create your model
3. Ensure bones are properly named (see `hytale-model-creator`)

### Step 2: Open Animation Panel

1. **View → Animation Mode** (or press `Ctrl+A`)
2. Animation panel appears at bottom

### Step 3: Create New Animation

1. Click **"+"** in Animations panel
2. Name your animation (e.g., `walk`, `attack`, `idle`)
3. Set animation properties:
   - **Length**: Duration in seconds
   - **Loop**: Whether it repeats
   - **Override**: Priority over other animations

### Step 4: Add Keyframes

1. Select a bone in the outliner
2. Move timeline to desired frame
3. Transform the bone (rotate, move, scale)
4. Click **"+"** next to transform type to add keyframe

### Step 5: Refine and Preview

1. Press **Play** to preview
2. Adjust timing and poses
3. Add easing for smoother motion

---

## Animation Types

### Idle Animation

- Subtle breathing motion
- Slight swaying
- Loop seamlessly
- Duration: 2-4 seconds

```
Keyframes:
0s: Base pose
1s: Slight breath in (chest up, arms out slightly)
2s: Base pose (loops back)
```

### Walk Cycle

- Alternating legs
- Arm swing opposite to legs
- Head bob
- Duration: ~1 second per cycle

```
Keyframes:
0.00s: Right foot forward, left arm forward
0.25s: Passing position (legs together)
0.50s: Left foot forward, right arm forward
0.75s: Passing position
1.00s: Back to start (loops)
```

### Attack Animation

- Wind-up, strike, recovery
- No loop (plays once)
- Duration: 0.5-1 second

```
Keyframes:
0.00s: Idle pose
0.15s: Wind-up (arm back)
0.25s: Strike (arm forward, maximum extension)
0.40s: Follow-through
0.60s: Return to idle
```

### Jump Animation

- Anticipation, jump, landing
- Triggered by game events

```
Keyframes:
0.00s: Crouch (anticipation)
0.10s: Launch (extended)
0.30s: Apex (relaxed pose)
0.50s: Landing (crouch)
0.70s: Return to idle
```

---

## Bone Hierarchy for Animation

Use consistent naming for Hytale's animation system:

```
root
├── body
│   ├── head
│   │   ├── jaw (for talking)
│   │   └── eyes (for blinking)
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

## Easing Functions

Control how keyframes interpolate:

| Easing | Effect | Use For |
|--------|--------|---------|
| Linear | Constant speed | Mechanical motion |
| Ease In | Slow start | Beginning actions |
| Ease Out | Slow end | Landing, stopping |
| Ease In-Out | Slow both ends | Natural motion |
| Bounce | Bouncy end | Cartoony effects |

---

## Animation States

Games often use state machines for animations:

```
         ┌─────────────┐
         │    Idle     │◄────────────┐
         └──────┬──────┘             │
                │ (move input)       │ (stop)
                ▼                    │
         ┌─────────────┐             │
         │    Walk     │─────────────┘
         └──────┬──────┘
                │ (attack)
                ▼
         ┌─────────────┐
         │   Attack    │───► (returns to previous)
         └─────────────┘
```

---

## Best Practices

### Do

| Practice | Why |
|----------|-----|
| Start with key poses | Foundation first |
| Use reference videos | Natural motion |
| Exaggerate slightly | Reads better in-game |
| Test in-game early | Catches issues |
| Keep loops seamless | No jarring transitions |

### Don't

| Mistake | Why Bad |
|---------|---------|
| Too many keyframes | Hard to edit |
| Robotic motion | Looks unnatural |
| Forget anticipation | Actions feel sudden |
| Ignore secondary motion | Feels stiff |

---

## Export Settings

When exporting from Blockbench:

1. **File → Export → Hytale Animation**
2. Output: `.blockyanim` file
3. Place in: `Common/Animations/` folder in your Pack

---

## Animation in Plugins

Trigger animations from Java plugins:

```java
// Play animation on entity
entity.playAnimation("attack");

// Play with options
entity.playAnimation("walk", AnimationOptions.builder()
    .loop(true)
    .blendTime(0.2f)
    .build());

// Stop animation
entity.stopAnimation("walk");
```

---

## Quick Reference

| Animation | Duration | Loop | Notes |
|-----------|----------|------|-------|
| Idle | 2-4s | Yes | Subtle movement |
| Walk | 0.8-1.2s | Yes | Cycle per step |
| Run | 0.4-0.6s | Yes | Faster cycle |
| Attack | 0.3-0.8s | No | Once per action |
| Jump | 0.5-1s | No | Triggered |
| Death | 1-2s | No | Final pose |

---

## Resources

- **Model Creation**: See `hytale-model-creator` skill
- **AI Animation Help**: See `blockbench-mcp` skill
- **Official Examples**: [Hytale Model Examples ZIP](https://cdn.hytale.com/Hytale%20Model%20Examples.zip)
