# Voxel Dungeon: Plan

An original browser dungeon crawler made from colored cubes. Everything is procedural: geometry, layouts, loot and audio.

## Architecture

```
src/
  core/      Game loop, input, seeded RNG, math helpers, event bus, camera rig
  world/     Dungeon generator (pure, testable), voxel builder (InstancedMesh), torches, collision grid
  entities/  Player, enemies (grunt, archer, exploder, boss), projectiles, chests, portal, pickups
  systems/   Combat & damage formulas (pure), loot rolls (pure), XP/leveling, particles, audio (Web Audio), damage numbers
  ui/        HUD (DOM overlay): health/XP bars, ability icons, inventory panel, minimap, game-over/victory screens
```

Main ideas:
- **Pure logic, separate from rendering.** The dungeon generator, loot rolls and damage math don't import three.js, so Vitest can test them headlessly.
- **Seeded RNG** (mulberry32). Each level comes from `seed + levelIndex`, so a seed always rebuilds the same level.
- **Collision on a 2D grid.** The dungeon is a tile grid (wall/floor). Entities are circles that slide against wall tiles, so there's no physics engine.
- **Rendering.** Each material/color group of wall and floor cubes is one `InstancedMesh`. Characters are small `Group`s of boxes. Particles use one pooled `InstancedMesh`.
- **Fixed-timestep simulation** (60 Hz), with rendering at display rate.

## Milestones
- **M1:** Vite/TS/three setup, game loop, input, isometric follow camera, player movement with collision, voxel test room with torches and fog.
- **M2:** Melee combat (aim with the mouse, attack arc), dodge roll with i-frames and cooldown, grunt enemy, HP and death.
- **M3:** Seeded procedural dungeon (rooms and corridors), spawn points, start room and boss room. Generator tests.
- **M4:** Archer (kites and shoots), exploder (rushes and detonates), mini-boss with phases, exit portal and win/lose flow.
- **M5:** Loot tables, rarity tiers, stat modifiers, chests, sword/spear/bow, potions, inventory, XP and leveling, Q/E abilities. Loot and damage tests.
- **M6:** Full HUD and minimap, particles, damage numbers, screen shake, Web Audio SFX, performance pass, README.

Before every commit: `npm run lint && npm run typecheck && npm test`.
