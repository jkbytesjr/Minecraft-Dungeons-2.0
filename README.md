# Voxel Dungeon

A browser dungeon crawler built entirely from coloured cubes. Fight through six procedurally generated floors, loot gear, level up, and defeat each floor's boss to open the portal down.

Everything is generated at runtime: dungeon layouts, voxel models, loot and sound effects. There are no image or audio assets.

## Running it

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
```

Add `?seed=12345` to the URL to play a specific dungeon. The same seed always builds the same floors.

```sh
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim |
| Left click | Attack (hold to keep attacking) |
| Space | Dodge roll, with brief invulnerability |
| Q | Ground slam (area damage) |
| E | Arrow volley (7-arrow spread) |
| 1 | Drink a health potion |
| Tab / I | Inventory (pauses the game) |
| H | Controls overlay (pauses the game) |
| M | Mute / unmute |
| F3 | FPS and draw-call meter |
| 1 / 2 / 3 | Pick an attribute on the level-up screen |
| R | Restart after death |

## How a run works

- **Floors.** Each floor is a set of rooms joined by corridors, with a boss arena. Killing the boss opens a portal to the next floor. Clear all six to win. Each floor has its own colour theme, and enemies get tougher the deeper you go.
- **Enemies.** Grunts close in for melee, archers keep their distance and shoot, and exploders rush you and detonate.
- **Bosses.** Four bosses, each with telegraphed attacks that get faster and nastier below half health:
  - *The Ashen Colossus*: ground slams, charges, and summons adds.
  - *Vesh the Thornhuntress*: keeps her distance, fires arrow fans and rapid shots, and dashes away if you close in.
  - *The Cinder King*: drops bombs on marked spots around you and blasts a fire nova if you get close.
  - *The Hollow Lich*: raises minions, fires bolt fans and rings, and teleports away when cornered.

  Floor 1 is always the Colossus, and floors 2–4 bring the other three in an order set by the seed. Floors 5 and 6 are rematches against two different bosses.
- **Loot.** Enemies and chests drop weapons (sword, spear, bow), armor and potions. Items come in three rarities (common, rare, unique) with more random stat modifiers at higher rarities. Hover a bag item in the inventory to compare it with what you have equipped. Your equipped weapon and armor are shown on your character and in the HUD.
- **Leveling.** Kills give XP. Each level fully heals you and pauses the game so you can pick one of three random attributes, such as max HP, damage, crit chance, attack speed or faster ability cooldowns. Each attribute has a maximum rank. The inventory screen lists the ones you've picked.

## Development

```sh
npm run lint && npm run typecheck && npm test   # run before every commit
npm run smoke                                    # headless browser test
```

- `npm test` runs the Vitest unit tests for the pure logic: dungeon generation and boss order, collision grid, damage formulas, loot rolls, inventory, leveling and attribute picks, pathfinding, the fixed-step clock and minimap exploration.
- `npm run smoke` starts the dev server, drives the game in headless Chromium with Playwright, and checks movement, combat, every enemy type, floor progression, loot, inventory, abilities, effects and the HUD. It fails on any console error or warning and saves screenshots to `smoke-out/`. Install the browser once with `npx playwright install chromium`.

### Layout

```
src/
  core/      Game loop, fixed-step clock, input, seeded RNG, event bus, camera rig
  world/     Dungeon generator, tile grid and collision, voxel level builder, torches, fog of war
  entities/  Player and gear models, enemies, bosses (bosses/), chests, pickups, portal
  systems/   Damage, loot, inventory, leveling, attributes (perks), projectiles, pathfinding, particles, audio
  ui/        HUD, minimap, inventory panel, level-up panel, damage numbers, FPS meter
```

### Design notes

- **Pure logic is separate from rendering.** Generation, loot, damage and progression don't import three.js, so they're tested headlessly.
- **Seeded randomness.** A mulberry32 RNG derives each floor, its boss and the level-up offers from the run seed.
- **Grid collision.** Entities are circles that slide against wall tiles. There's no physics engine.
- **Fixed timestep.** The simulation ticks at 60 Hz regardless of display rate. Camera, particles, damage numbers and the minimap update every rendered frame.
- **Event-driven presentation.** The simulation emits events (`hit`, `enemyDied`, `explosion`, ...). Sound, particles, damage numbers, screen shake and toasts subscribe to them and never touch game state.
- **Cheap rendering.** Level geometry is one `InstancedMesh` per material, and all particles share one pooled `InstancedMesh`. A small pool of point lights follows the torches nearest the player. If the frame rate stays below 45, the renderer lowers its pixel ratio.
- **Audio** is synthesised with Web Audio (oscillators plus filtered noise). It starts on the first key press or click, as browsers require.
