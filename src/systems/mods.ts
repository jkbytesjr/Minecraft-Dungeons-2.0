/**
 * Mods: JSON files that tweak the rules, add items to the loot tables and add
 * enemy variants. Pure data, no code is ever run from a mod. Validation and
 * the combined registry are pure and unit-tested; loading lives in modLoader.
 *
 * Format (every section optional):
 * {
 *   "id": "my-mod", "name": "My Mod", "version": "1.0", "author": "me", "description": "...",
 *   "tweaks": { "xpMult": 2, "dropMult": 1.5, "enemyHpMult": 1.2, ... },
 *   "items": [{ "name": "Moonblade", "kind": "weapon", "weapon": "sword", "rarity": "mythic", "damage": 40, ... }],
 *   "enemies": [{ "id": "frost-grunt", "name": "Frost Grunt", "base": "grunt", "tint": "#88ccff", ... }]
 * }
 */
import type { Rng } from '../core/rng';
import { RARITIES, type Item, type Modifier, type Rarity, type StatKey, MOD_RANGES } from './loot';
import { POWER_IDS, type PowerId } from './powers';
import type { WeaponKind } from './weapons';

export interface ModTweaks {
  /** Multiplies XP from kills. */
  xpMult: number;
  /** Multiplies how often normal enemies drop items and potions. */
  dropMult: number;
  enemyHpMult: number;
  enemyDamageMult: number;
  /** Speeds up (or slows) everything enemies do. */
  enemySpeedMult: number;
  /** Flat max HP added to the hero. */
  playerHpBonus: number;
  playerDamageMult: number;
  playerSpeedMult: number;
  /** Multiplies how much a potion heals. */
  potionHealMult: number;
  /** Extra potions at the start of a run. */
  bonusPotions: number;
  /** Chance that an item drop is replaced by one of the mods' items (when any exist). */
  modItemChance: number;
}

export interface ModItemDef {
  name: string;
  kind: 'weapon' | 'armor';
  weapon?: WeaponKind;
  rarity: Exclude<Rarity, 'admin'>;
  damage: number;
  armor: number;
  maxHp: number;
  mods: Modifier[];
  powers: PowerId[];
  /** Relative chance among the mods' items. */
  weight: number;
  /** First floor (1-based) it can drop on. */
  minFloor: number;
  /** Scale damage/armor/HP with the floor like normal loot (default true). */
  scales: boolean;
}

export interface ModEnemyDef {
  id: string;
  name: string;
  base: ModEnemyBase;
  hpMult: number;
  damageMult: number;
  speedMult: number;
  xpMult: number;
  /** Body size multiplier. */
  scale: number;
  /** Colour multiplied over the model, as a number (parsed from "#rrggbb"). */
  tint: number | null;
  /** Chance that a spawn of the base kind becomes this variant. */
  chance: number;
  minFloor: number;
}

export const MOD_ENEMY_BASES = ['grunt', 'archer', 'exploder', 'spider', 'shieldbearer', 'shaman', 'wraith'] as const;
export type ModEnemyBase = (typeof MOD_ENEMY_BASES)[number];

export interface ModDef {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  tweaks: Partial<ModTweaks>;
  items: ModItemDef[];
  enemies: ModEnemyDef[];
}

export const DEFAULT_TWEAKS: ModTweaks = {
  xpMult: 1,
  dropMult: 1,
  enemyHpMult: 1,
  enemyDamageMult: 1,
  enemySpeedMult: 1,
  playerHpBonus: 0,
  playerDamageMult: 1,
  playerSpeedMult: 1,
  potionHealMult: 1,
  bonusPotions: 0,
  modItemChance: 0.2,
};

/** Allowed range per tweak; values outside are clamped (with a warning). */
const TWEAK_RANGE: Record<keyof ModTweaks, [number, number]> = {
  xpMult: [0, 100],
  dropMult: [0, 20],
  enemyHpMult: [0.05, 100],
  enemyDamageMult: [0, 100],
  enemySpeedMult: [0.25, 3],
  playerHpBonus: [-90, 100000],
  playerDamageMult: [0.05, 1000],
  playerSpeedMult: [0.25, 3],
  potionHealMult: [0, 10],
  bonusPotions: [0, 9],
  modItemChance: [0, 1],
};

const WEAPONS: readonly WeaponKind[] = ['sword', 'spear', 'bow'];

export interface ModResult {
  mod: ModDef | null;
  errors: string[];
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** "#88ccff" / "88ccff" / 0x88ccff → number, else null. */
export function parseColor(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff) return v;
  if (typeof v !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  return m ? Number.parseInt(m[1], 16) : null;
}

/** Check a parsed mod file. Bad entries are skipped with an error; a mod with no usable id or name is rejected. */
export function validateMod(raw: unknown): ModResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { mod: null, errors: ['A mod file must be a JSON object.'], warnings };
  const id = str(raw.id, 40);
  const name = str(raw.name);
  const idOk = !!id && /^[a-z0-9][a-z0-9_-]*$/i.test(id);
  if (!idOk) errors.push('"id" is required: letters, digits, - and _ only.');
  if (!name) errors.push('"name" is required.');
  if (!idOk || !id || !name) return { mod: null, errors, warnings };

  /** A number field: default when missing, clamped into range, error when not a number. */
  const num = (where: string, v: unknown, def: number, [lo, hi]: [number, number]): number => {
    if (v === undefined) return def;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${where} must be a number.`);
      return def;
    }
    if (v < lo || v > hi) {
      warnings.push(`${where} = ${v} is outside ${lo}..${hi}; clamped.`);
      return Math.min(hi, Math.max(lo, v));
    }
    return v;
  };

  const tweaks: Partial<ModTweaks> = {};
  if (raw.tweaks !== undefined) {
    if (!isObj(raw.tweaks)) errors.push('"tweaks" must be an object.');
    else
      for (const [key, value] of Object.entries(raw.tweaks)) {
        if (!(key in TWEAK_RANGE)) {
          warnings.push(`Unknown tweak "${key}" ignored.`);
          continue;
        }
        const k = key as keyof ModTweaks;
        tweaks[k] = num(`tweaks.${k}`, value, DEFAULT_TWEAKS[k], TWEAK_RANGE[k]);
      }
  }

  const items: ModItemDef[] = [];
  const rawItems = raw.items ?? [];
  if (!Array.isArray(rawItems)) errors.push('"items" must be a list.');
  else
    rawItems.forEach((it: unknown, i) => {
      const where = `items[${i}]`;
      if (!isObj(it)) return errors.push(`${where} must be an object.`);
      const itemName = str(it.name, 40);
      const kind = it.kind;
      if (!itemName) return errors.push(`${where}.name is required.`);
      if (kind !== 'weapon' && kind !== 'armor') return errors.push(`${where}.kind must be "weapon" or "armor".`);
      const rarity = (it.rarity ?? 'rare') as Rarity;
      if (!RARITIES.includes(rarity)) return errors.push(`${where}.rarity must be one of ${RARITIES.join(', ')}.`);
      let weapon: WeaponKind | undefined;
      if (kind === 'weapon') {
        weapon = (it.weapon ?? 'sword') as WeaponKind;
        if (!WEAPONS.includes(weapon)) return errors.push(`${where}.weapon must be sword, spear or bow.`);
      }
      const mods: Modifier[] = [];
      if (it.mods !== undefined) {
        if (!Array.isArray(it.mods)) errors.push(`${where}.mods must be a list.`);
        else
          for (const m of it.mods as unknown[]) {
            if (!isObj(m) || typeof m.stat !== 'string' || !(m.stat in MOD_RANGES)) {
              errors.push(`${where}.mods: each needs a "stat" (${Object.keys(MOD_RANGES).join(', ')}) and a "value".`);
              continue;
            }
            mods.push({ stat: m.stat as StatKey, value: num(`${where}.mods.${m.stat}`, m.value, 0, [-1000, 100000]) });
          }
      }
      const powers: PowerId[] = [];
      if (it.powers !== undefined) {
        if (!Array.isArray(it.powers)) errors.push(`${where}.powers must be a list.`);
        else
          for (const p of it.powers as unknown[]) {
            if (POWER_IDS.includes(p as PowerId)) powers.push(p as PowerId);
            else errors.push(`${where}.powers: "${String(p)}" is not one of ${POWER_IDS.join(', ')}.`);
          }
      }
      items.push({
        name: itemName,
        kind,
        weapon,
        rarity: rarity as ModItemDef['rarity'],
        damage: num(`${where}.damage`, it.damage, 20, [1, 100000]),
        armor: num(`${where}.armor`, it.armor, 15, [0, 100000]),
        maxHp: num(`${where}.maxHp`, it.maxHp, 10, [0, 100000]),
        mods,
        powers: kind === 'weapon' ? [...new Set(powers)] : [],
        weight: num(`${where}.weight`, it.weight, 1, [0, 1000]),
        minFloor: num(`${where}.minFloor`, it.minFloor, 1, [1, 10000]),
        scales: it.scales !== false,
      });
    });

  const enemies: ModEnemyDef[] = [];
  const rawEnemies = raw.enemies ?? [];
  if (!Array.isArray(rawEnemies)) errors.push('"enemies" must be a list.');
  else
    rawEnemies.forEach((en: unknown, i) => {
      const where = `enemies[${i}]`;
      if (!isObj(en)) return errors.push(`${where} must be an object.`);
      const enemyId = str(en.id, 40);
      if (!enemyId) return errors.push(`${where}.id is required.`);
      const base = en.base as ModEnemyBase;
      if (!MOD_ENEMY_BASES.includes(base)) return errors.push(`${where}.base must be one of ${MOD_ENEMY_BASES.join(', ')}.`);
      const tint = en.tint === undefined ? null : parseColor(en.tint);
      if (en.tint !== undefined && tint === null) errors.push(`${where}.tint must be a colour like "#88ccff".`);
      enemies.push({
        id: enemyId,
        name: str(en.name, 40) ?? enemyId,
        base,
        hpMult: num(`${where}.hpMult`, en.hpMult, 1, [0.05, 100]),
        damageMult: num(`${where}.damageMult`, en.damageMult, 1, [0, 100]),
        speedMult: num(`${where}.speedMult`, en.speedMult, 1, [0.25, 3]),
        xpMult: num(`${where}.xpMult`, en.xpMult, 1, [0, 100]),
        scale: num(`${where}.scale`, en.scale, 1, [0.4, 2.5]),
        tint,
        chance: num(`${where}.chance`, en.chance, 0.25, [0, 1]),
        minFloor: num(`${where}.minFloor`, en.minFloor, 1, [1, 10000]),
      });
    });

  return {
    mod: {
      id,
      name,
      version: str(raw.version, 20) ?? '1.0',
      author: str(raw.author, 40) ?? 'unknown',
      description: str(raw.description, 300) ?? '',
      tweaks,
      items,
      enemies,
    },
    errors,
    warnings,
  };
}

/** Multipliers multiply and bonuses add across mods; the item swap chance takes the highest. */
export function combineTweaks(list: Partial<ModTweaks>[]): ModTweaks {
  const out = { ...DEFAULT_TWEAKS };
  const additive: (keyof ModTweaks)[] = ['playerHpBonus', 'bonusPotions'];
  let itemChance: number | null = null;
  for (const t of list)
    for (const [key, value] of Object.entries(t) as [keyof ModTweaks, number][]) {
      if (key === 'modItemChance') itemChance = Math.max(itemChance ?? 0, value);
      else if (additive.includes(key)) out[key] += value;
      else out[key] *= value;
    }
  if (itemChance !== null) out.modItemChance = itemChance;
  for (const key of Object.keys(TWEAK_RANGE) as (keyof ModTweaks)[]) {
    const [lo, hi] = TWEAK_RANGE[key];
    out[key] = Math.min(hi, Math.max(lo, out[key]));
  }
  return out;
}

/** Everything the enabled mods add, merged. */
export class ModRegistry {
  readonly tweaks: ModTweaks;
  readonly items: ModItemDef[];
  readonly enemies: ModEnemyDef[];

  constructor(readonly mods: readonly ModDef[] = []) {
    this.tweaks = combineTweaks(mods.map((m) => m.tweaks));
    this.items = mods.flatMap((m) => m.items);
    this.enemies = mods.flatMap((m) => m.enemies);
  }

  /** Maybe swap a rolled item for a mod item that can drop on this floor (0-based depth). */
  maybeModItem(rng: Rng, depth: number): Item | null {
    const pool = this.items.filter((d) => d.minFloor <= depth + 1 && d.weight > 0);
    if (!pool.length || !rng.chance(this.tweaks.modItemChance)) return null;
    return makeModItem(rng.weighted(pool.map((d) => [d, d.weight] as [ModItemDef, number])), depth, rng.int(1, 2 ** 31 - 1));
  }

  /** The variant (if any) a spawn of `base` becomes on this floor. */
  variantFor(base: string, depth: number, rng: Rng): ModEnemyDef | null {
    for (const v of this.enemies) if (v.base === base && v.minFloor <= depth + 1 && rng.chance(v.chance)) return v;
    return null;
  }

  enemyById(id: string): ModEnemyDef | null {
    return this.enemies.find((v) => v.id === id) ?? null;
  }
}

/** Build a droppable item from a mod definition at a floor depth. */
export function makeModItem(def: ModItemDef, depth: number, id: number): Item {
  const scale = def.scales ? 1 + 0.25 * depth : 1;
  const mods = def.mods.map((m) => ({ ...m }));
  if (def.kind === 'armor')
    return {
      kind: 'armor',
      id,
      name: def.name,
      rarity: def.rarity,
      itemLevel: depth,
      armor: Math.round(def.armor * scale),
      maxHp: Math.round(def.maxHp * scale),
      mods,
    };
  const tier = def.rarity === 'mythic' ? 2 : 1;
  return {
    kind: 'weapon',
    id,
    name: def.name,
    weapon: def.weapon ?? 'sword',
    rarity: def.rarity,
    itemLevel: depth,
    damage: Math.round(def.damage * scale),
    mods,
    ...(def.powers.length ? { powers: def.powers.map((p) => ({ id: p, tier: tier as 1 | 2 })) } : {}),
  };
}

/** The registry in effect (replaced when mods are loaded or toggled). */
let active = new ModRegistry();

export function activeMods(): ModRegistry {
  return active;
}

export function setActiveMods(registry: ModRegistry): void {
  active = registry;
}
