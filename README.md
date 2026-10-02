
# Voxel Dungeon

A dungeon crawler that runs in the browser, built entirely from coloured cubes. Descend through endless procedurally generated floors, collect loot with special powers, choose how your character grows, and see how deep you can get.

Nothing is pre-made: dungeon layouts, character models, loot and sound effects are all generated in code. The repo contains no image or audio assets.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-000000?logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)

![Fighting a pack of grunts](docs/screenshots/combat.png)

## Features

- **Endless procedurally generated floors**: rooms and corridors with a cycling colour theme, getting harder as you go. A seed always rebuilds the same dungeon, and the game remembers your deepest floor.
- **Four bosses** with telegraphed attacks and an enraged phase below half health. They return with grander titles every four floors.
- **Real-time combat**: mouse-aimed melee and bow attacks, a dodge roll with brief invulnerability, a ground slam, an arrow volley and health potions.
- **Loot** in four rarities (common, rare, unique, mythic) with random stat modifiers. Unique and mythic weapons carry special powers like Chain Lightning and Ignite. Your equipped armor and weapon show on your character.
- **Level-up choices**: each level pauses the game and offers three random attributes to pick from. Levels come faster the deeper you go.
- **Title screen and saves**: continue a saved run, start a new one or play a specific seed. The game autosaves at every floor, and Esc lets you save and quit.
- **Detailed voxel art**: characters with faces, outfits and gear, distinct enemy and boss designs, banners and clutter in the rooms, and a slate-roofed building around the whole dungeon.
- **Game feel**: particles, floating damage numbers, screen shake, a slow-motion "boss defeated" finale, a fog-of-war minimap, and sound effects synthesised in the browser.

## Screenshots

| | |
| --- | --- |
| ![The Cinder King marks bomb spots around the player](docs/screenshots/boss-cinder-king.png) | ![Vesh the Thornhuntress telegraphs an arrow fan](docs/screenshots/boss-huntress.png) |
| *The Cinder King marks where his bombs will land.* | *Vesh the Thornhuntress telegraphs an arrow fan.* |
| ![Inventory with an item comparison tooltip](docs/screenshots/inventory.png) | ![Level-up screen offering three attributes](docs/screenshots/level-up.png) |
| *Hover an item to compare it with your gear.* | *Pick one of three attributes on each level-up.* |

## Getting started

You need [Node.js](https://nodejs.org/) 22.12 or newer.

```sh
npm install
npm run dev
```

Then open http://localhost:5173. The title screen lets you start a new run, continue a saved one, or type in a seed. Sound starts after your first click or key press.

The same seed always produces the same floors, bosses and level-up offers. You can also skip the title screen and jump straight into a seed with a URL like `http://localhost:5173/?seed=12345`.

**Saving.** The game autosaves at the start of every floor. Press Esc and choose *Save & quit to menu* to stop playing, then pick *Continue* on the title screen. You resume at the start of the saved floor with your level, attributes and gear. Saves live in your browser, and dying deletes the save.

To make a production build:

```sh
npm run build      # type-check and build to dist/
npm run preview    # serve the build locally
```

`dist/` is a static site, so you can host it anywhere that serves static files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move. By default W walks toward the mouse, S backs away and A/D circle around it. Switch to screen-relative movement on the title screen. |
| Mouse | Aim |
| Left click | Attack (hold to keep attacking) |
| Space | Dodge roll, with brief invulnerability |
| Q | Ground slam (area damage) |
| E | Arrow volley (7-arrow spread) |
| 1 | Drink a health potion |
| 1 / 2 / 3 | Pick an attribute on the level-up screen |
| Tab / I | Inventory (pauses the game) |
| H | Controls overlay (pauses the game) |
| Esc | Pause menu (resume, controls, save & quit) |
| M | Mute / unmute |
| F3 | FPS and draw-call meter |
| R | Restart after death |

## How a run works

Each floor is a set of rooms joined by corridors, ending in a boss arena. Killing the boss triggers a slow-motion finale and opens a portal to the next floor. The floors never end: enemies keep getting tougher, and the run is over when you die. The death screen shows how deep you got and your best floor so far.

**Enemies.** Grunts close in for melee, archers keep their distance and shoot, and exploders rush you and detonate.

**Bosses.** Every big attack is marked on the ground in red before it lands.

| Boss | Fighting style |
| --- | --- |
| The Ashen Colossus | Ground slams, charges, and summons helpers when hurt. |
| Vesh the Thornhuntress | Stays at range, fires arrow fans and rapid shots, and dashes away if you close in. |
| The Cinder King | Drops bombs on marked spots around you and blasts a fire nova if you get close. |
| The Hollow Lich | Raises minions, fires bolt fans and rings, and teleports away when cornered. |

Floor 1 is always the Colossus, and floors 2–4 bring the other three in an order set by the seed. After that each floor gets a seeded boss, never the same one twice in a row. Returning bosses earn a title every four floors: *Reborn* from floor 5, *Ascendant* from floor 9 and *Eternal* from floor 13.

**Loot.** Enemies and chests drop swords, spears, bows, armor and potions in four rarities: common, rare, unique and mythic. Rarer items have bigger stats and more modifiers. Mythic items are very rare on the first floors and turn up more often deeper down and from bosses. Your equipped gear appears on your character (leather, chain or plate, with rarity-coloured trim) and in the HUD.

**Weapon powers.** Every unique weapon has one special power, and every mythic weapon has two stronger ones. Powers trigger on weapon hits:

| Power | Effect |
| --- | --- |
| Ignite | Sets enemies on fire, dealing damage over time. |
| Frost | Slows enemies, with a chance to freeze them solid. Bosses are only slowed. |
| Chain Lightning | Chance to arc to several nearby enemies. |
| Shockwave | Every few hits releases a blast around the target. |
| Detonate | Critical hits explode, damaging enemies around the target. |

**Leveling.** Kills give XP, and deeper floors give much more, so each level takes fewer kills the further you get. Each level-up fully heals you and lets you choose one of three random attributes, such as max HP, damage, crit chance, attack speed or faster cooldowns. Each attribute has a maximum rank.

## Development

```sh
npm run lint && npm run typecheck && npm test   # run before every commit
npm run smoke                                    # headless browser test
```

- **Unit tests** (`npm test`, Vitest) cover the pure game logic: dungeon generation and boss order, the collision grid, damage formulas, loot rolls and weapon powers, inventory, leveling pace and attribute picks, save validation, pathfinding, the fixed-step clock and minimap exploration.
- **Smoke test** (`npm run smoke`) starts the dev server and plays the game in headless Chromium with Playwright. It checks movement (including walking toward the mouse), combat, every enemy type, ten floors and their bosses, the boss-defeated banner, the death summary, loot, every weapon power, inventory, abilities, level-ups, the pause menu, saving and continuing, the title screen, effects and the HUD. It fails on any console error or warning, and saves screenshots to `smoke-out/`. Install the browser once with `npx playwright install chromium`.

### Project layout

```
src/
  core/      Game loop, fixed-step clock, input, seeded RNG, event bus, camera rig
  world/     Dungeon generator, tile grid and collision, voxel level builder, torches, fog of war
  entities/  Player and gear models, enemies, bosses (bosses/), chests, pickups, portal
  systems/   Damage, loot, weapon powers, inventory, leveling, attributes, saves, projectiles, pathfinding, particles, audio
  ui/        Title and pause menus, HUD, minimap, inventory, level-up screen, damage numbers, FPS meter
tests/       Vitest unit tests
scripts/     Playwright smoke test
docs/        README screenshots
```

### How it's built

- **Game logic is separate from rendering.** Generation, loot, damage and progression don't import three.js, so they're tested without a browser.
- **Seeded randomness.** A mulberry32 RNG derives every floor, its boss and the level-up offers from the run seed.
- **Grid collision.** Characters are circles that slide along wall tiles; there's no physics engine.
- **Fixed timestep.** The simulation runs at 60 Hz regardless of screen refresh rate. The camera, particles, damage numbers and minimap update every rendered frame.
- **Event-driven effects.** The simulation emits events (`hit`, `enemyDied`, `explosion`, ...). Sound, particles, damage numbers, screen shake and messages listen for them and never change game state.
- **Cheap rendering.** Level geometry (floors, walls, rooftop, props) is one instanced mesh per kind, character models merge their boxes into one mesh per body part, and all particles share a single pooled instanced mesh. A small pool of point lights follows the torches nearest the player. If the frame rate stays below 45, the renderer lowers its resolution.
- **Synthesised audio.** Sound effects are built from Web Audio oscillators and filtered noise. Audio starts on the first key press or click, as browsers require.
