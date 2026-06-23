# Block States Reference

Advanced block state features for interactive blocks.

## State Cycling Logic

States cycle in array order: `off → on → off → ...`

For 3+ states: `state1 → state2 → state3 → state1 → ...`

## Interaction Types

| Type | Description |
|------|-------------|
| `CycleState` | Cycles through defined states |
| `SetState` | Sets a specific state |

## Advanced State Features

### Sounds

Add sound effects to state transitions:

```json
{
  "States": [
    {
      "Name": "on",
      "Sound": "Sounds/switch_on.ogg"
    }
  ]
}
```

### Animations

Link state to block animation:

```json
{
  "States": [
    {
      "Name": "active",
      "Animation": "Animations/block_active.blockyanim"
    }
  ]
}
```

### Particles

Trigger particles on state change:

```json
{
  "States": [
    {
      "Name": "on",
      "Particles": {
        "Type": "spark",
        "Color": "#ffff00"
      }
    }
  ]
}
```

## Multi-State Example (4 states)

```json
{
  "Interactions": [{
    "Type": "CycleState",
    "Hint": "server.dial.rotate",
    "State": "position"
  }],
  "States": [
    { "Name": "north", "Initial": true },
    { "Name": "east" },
    { "Name": "south" },
    { "Name": "west" }
  ]
}
```

## Required Files for States

1. Block JSON with Interactions and States arrays
2. Texture for each state (if visual change)
3. Translation for interaction hint
4. Optional: Sound, animation, particle definitions
