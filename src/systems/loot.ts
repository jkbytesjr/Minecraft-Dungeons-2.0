/** Item model and loot rolls. Pure logic (no three.js), unit-tested. */
import type { Rng } from '../core/rng';
import { BASE_WEAPONS, type WeaponKind } from './weapons';

export type Rarity = 'common' | 'rare' | 'unique';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'unique'];

export type StatKey = 'damagePct' | 'critChance' | 'attackSpeedPct' | 'maxHp' | 'armor' | 'moveSpeedPct' | 'lifeOnHit';

export interface Modifier {
  stat: StatKey;
  value: number;
}

interface ItemBase {
  id: number;
  name: string;
  rarity: Rarity;
  /** Dungeon depth the item dropped on; scales its numbers. */
  itemLevel: number;
  mods: Modifier[];
}

export interface WeaponItem extends ItemBase {
  kind: 'weapon';
  weapon: WeaponKind;
  damage: number;
}

export interface ArmorItem extends ItemBase {
  kind: 'armor';
  armor: number;
  maxHp: number;
}

export type Item = WeaponItem | ArmorItem;

/** What an enemy or chest can drop. Potions stack, so they aren't items. */
export type Drop = { type: 'item'; item: Item } | { type: 'potion' };

export type DropSource = 'grunt' | 'archer' | 'exploder' | 'boss' | 'chest';

export const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.3, unique: 1.7 };
const MOD_COUNT: Record<Rarity, [number, number]> = { common: [0, 1], rare: [2, 2], unique: [3, 3] };

/** Base [min, max] roll per stat at item level 0. `flat` stats also scale with item level. */
export const MOD_RANGES: Record<StatKey, { min: number; max: number; flat: boolean }> = {
  damagePct: { min: 0.05, max: 0.15, flat: false },
  critChance: { min: 0.03, max: 0.08, flat: false },
  attackSpeedPct: { min: 0.05, max: 0.15, flat: false },
  moveSpeedPct: { min: 0.04, max: 0.1, flat: false },
  maxHp: { min: 8, max: 20, flat: true },
  armor: { min: 5, max: 15, flat: true },
  lifeOnHit: { min: 1, max: 3, flat: true },
};

const PREFIX: Record<StatKey, string> = {
  damagePct: 'Brutal',
  critChance: 'Keen',
  attackSpeedPct: 'Swift',
  moveSpeedPct: 'Fleet',
  maxHp: 'Sturdy',
  armor: 'Guarded',
  lifeOnHit: 'Thirsting',
};

const BASE_NAMES: Record<WeaponKind | 'armor', string[]> = {
  sword: ['Iron Sword', 'Broadsword', 'Falchion'],
  spear: ['Pike', 'Glaive', 'Partisan'],
  bow: ['Shortbow', 'Hunting Bow', 'Longbow'],
  armor: ['Leather Jerkin', 'Scale Vest', 'Chain Hauberk', 'Plate Cuirass'],
};

const UNIQUE_NAMES: Record<WeaponKind | 'armor', string[]> = {
  sword: ['Emberfang', 'Dawnsplitter', 'Grimcleaver'],
  spear: ['Stormspire', 'Thornlance', 'Wyrmtooth'],
  bow: ['Whisperwind', 'Starfall', 'Hollowstring'],
  armor: ['Aegis of Cinders', 'Mantle of the Deep', 'Ironheart Plate'],
};

const levelScale = (itemLevel: number, perLevel: number) => 1 + perLevel * itemLevel;

export function rollRarity(rng: Rng, minRarity: Rarity = 'common', uniqueBoost = 0): Rarity {
  const floor = RARITIES.indexOf(minRarity);
  const weights: [Rarity, number][] = [
    ['common', 70],
    ['rare', 25],
    ['unique', 5 + uniqueBoost],
  ];
  return rng.weighted(weights.filter(([r]) => RARITIES.indexOf(r) >= floor));
}

export function rollModifiers(rng: Rng, rarity: Rarity, itemLevel: number): Modifier[] {
  const [lo, hi] = MOD_COUNT[rarity];
  const count = rng.int(lo, hi);
  const pool = rng.shuffle(Object.keys(MOD_RANGES) as StatKey[]);
  return pool.slice(0, count).map((stat) => {
    const r = MOD_RANGES[stat];
    let value = rng.range(r.min, r.max) * RARITY_MULT[rarity];
    if (r.flat) value = Math.round(value * levelScale(itemLevel, 0.25));
    else value = Math.round(value * 1000) / 1000;
    return { stat, value };
  });
}

function itemName(rng: Rng, base: WeaponKind | 'armor', rarity: Rarity, mods: Modifier[]): string {
  if (rarity === 'unique') return rng.pick(UNIQUE_NAMES[base]);
  const name = rng.pick(BASE_NAMES[base]);
  return rarity === 'rare' && mods.length ? `${PREFIX[mods[0].stat]} ${name}` : name;
}

export interface RollOptions {
  kind?: 'weapon' | 'armor';
  minRarity?: Rarity;
  uniqueBoost?: number;
}

export function rollItem(rng: Rng, itemLevel: number, opts: RollOptions = {}): Item {
  const rarity = rollRarity(rng, opts.minRarity, opts.uniqueBoost);
  const kind = opts.kind ?? (rng.chance(0.55) ? 'weapon' : 'armor');
  const mods = rollModifiers(rng, rarity, itemLevel);
  const id = rng.int(1, 2 ** 31 - 1);
  const mult = RARITY_MULT[rarity];
  if (kind === 'weapon') {
    const weapon = rng.pick(['sword', 'spear', 'bow'] as const);
    const damage = Math.round(BASE_WEAPONS[weapon].damage * levelScale(itemLevel, 0.25) * mult * rng.range(0.9, 1.1));
    return { kind, id, weapon, damage, rarity, itemLevel, mods, name: itemName(rng, weapon, rarity, mods) };
  }
  return {
    kind,
    id,
    armor: Math.round(rng.range(8, 14) * levelScale(itemLevel, 0.3) * mult),
    maxHp: Math.round(rng.range(5, 15) * levelScale(itemLevel, 0.3) * mult),
    rarity,
    itemLevel,
    mods,
    name: itemName(rng, 'armor', rarity, mods),
  };
}

/** Roll everything a defeated enemy / opened chest drops. */
export function rollDrops(rng: Rng, source: DropSource, itemLevel: number): Drop[] {
  const drops: Drop[] = [];
  const item = (opts?: RollOptions): Drop => ({ type: 'item', item: rollItem(rng, itemLevel, opts) });
  switch (source) {
    case 'boss':
      drops.push(item({ minRarity: 'rare', uniqueBoost: 30 }), item({ minRarity: 'rare' }), { type: 'potion' });
      break;
    case 'chest':
      drops.push(item());
      if (rng.chance(0.5)) drops.push(item({ uniqueBoost: 5 }));
      if (rng.chance(0.5)) drops.push({ type: 'potion' });
      break;
    default:
      if (rng.chance(0.12)) drops.push(item());
      if (rng.chance(0.1)) drops.push({ type: 'potion' });
  }
  return drops;
}

export const STARTER_WEAPON: WeaponItem = {
  kind: 'weapon',
  id: 0,
  name: 'Rusty Sword',
  weapon: 'sword',
  damage: BASE_WEAPONS.sword.damage,
  rarity: 'common',
  itemLevel: 0,
  mods: [],
};

export const RARITY_COLOR: Record<Rarity, string> = { common: '#d8d8d8', rare: '#5aa9ff', unique: '#ff9a2e' };

const STAT_LABEL: Record<StatKey, (v: number) => string> = {
  damagePct: (v) => `+${Math.round(v * 100)}% damage`,
  critChance: (v) => `+${Math.round(v * 100)}% crit chance`,
  attackSpeedPct: (v) => `+${Math.round(v * 100)}% attack speed`,
  moveSpeedPct: (v) => `+${Math.round(v * 100)}% move speed`,
  maxHp: (v) => `+${v} max HP`,
  armor: (v) => `+${v} armor`,
  lifeOnHit: (v) => `+${v} life on hit`,
};

export function describeModifier(m: Modifier): string {
  return STAT_LABEL[m.stat](m.value);
}
