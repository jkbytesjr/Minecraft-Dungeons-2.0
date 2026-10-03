# Mods

A mod is a JSON file in this folder. It can change the game's rules, add items to the loot tables and add new enemy variants. Mods are plain data: they can't run code.

## Adding a mod

1. Put your file here, for example `public/mods/my-mod.json`.
2. List it in `index.json`:

   ```json
   { "mods": ["my-mod.json", { "file": "example-mod.json", "enabled": false }] }
   ```

   A plain file name is switched on by default. Use `{ "file": ..., "enabled": false }` to ship it switched off.
3. Reload the game. Under **Mods** on the title screen you can switch each mod on or off, and see any problems with the file.

You can also import a mod file with **Mods → Import mod file…**. Imported mods are kept in that browser only.

Changes apply from the next floor you enter.

## Format

Every section is optional except `id` and `name`.

```json
{
  "id": "my-mod",
  "name": "My Mod",
  "version": "1.0",
  "author": "you",
  "description": "What it does.",
  "tweaks": { "xpMult": 2 },
  "items": [],
  "enemies": []
}
```

### `tweaks`

| Key | Default | Range | Effect |
| --- | --- | --- | --- |
| `xpMult` | 1 | 0–100 | XP from kills |
| `dropMult` | 1 | 0–20 | How often normal enemies drop items and potions |
| `enemyHpMult` | 1 | 0.05–100 | Enemy health (bosses too) |
| `enemyDamageMult` | 1 | 0–100 | Enemy damage |
| `enemySpeedMult` | 1 | 0.25–3 | Speeds up everything enemies do |
| `playerHpBonus` | 0 | −90–100000 | Flat max HP |
| `playerDamageMult` | 1 | 0.05–1000 | Your damage |
| `playerSpeedMult` | 1 | 0.25–3 | Your move speed |
| `potionHealMult` | 1 | 0–10 | How much a potion heals |
| `bonusPotions` | 0 | 0–9 | Extra potions at the start of a run |
| `modItemChance` | 0.2 | 0–1 | Chance that an item drop is one of the mods' items |

When several mods are on, multipliers multiply, `playerHpBonus` and `bonusPotions` add up, and the highest `modItemChance` wins.

### `items`

```json
{
  "name": "Moonblade",
  "kind": "weapon",
  "weapon": "sword",
  "rarity": "mythic",
  "damage": 26,
  "mods": [{ "stat": "critChance", "value": 0.12 }],
  "powers": ["frost", "chain"],
  "weight": 1,
  "minFloor": 2,
  "scales": true
}
```

- `kind`: `weapon` or `armor`.
- `weapon`: `sword`, `spear` or `bow`.
- `rarity`: `common`, `rare`, `unique` or `mythic`.
- Weapons use `damage`. Armor uses `armor` and `maxHp`.
- `mods`: bonus stats. Each `stat` is one of `damagePct`, `critChance`, `attackSpeedPct`, `moveSpeedPct`, `maxHp`, `armor` or `lifeOnHit`. Percent stats are fractions, so 0.1 means +10%.
- `powers`: weapons only. Pick from `ignite`, `frost`, `chain`, `shockwave` and `detonate`.
- `weight`: relative chance among all mod items. Default 1.
- `minFloor`: first floor it can drop on. Default 1.
- `scales`: grow the item's numbers with the floor like normal loot. Default true.

### `enemies`

Variants of existing monsters:

```json
{
  "id": "frost-grunt",
  "name": "Frost Grunt",
  "base": "grunt",
  "tint": "#8fd4ff",
  "hpMult": 1.5,
  "damageMult": 1.2,
  "speedMult": 1,
  "xpMult": 1.5,
  "scale": 1.1,
  "chance": 0.3,
  "minFloor": 1
}
```

- `base`: `grunt`, `archer`, `exploder`, `spider`, `shieldbearer`, `shaman` or `wraith`.
- `tint`: a colour multiplied over the model.
- `scale`: body size, from 0.4 to 2.5.
- `chance`: chance that each spawn of the base monster becomes this variant.

Numbers outside their range are clamped. A broken entry is skipped, and the problem is listed in the Mods screen.
