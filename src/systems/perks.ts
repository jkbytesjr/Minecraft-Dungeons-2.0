/** Level-up attribute choices. Pure logic, unit-tested. */
import type { Rng } from '../core/rng';

export type PerkId =
  | 'vitality'
  | 'might'
  | 'precision'
  | 'ferocity'
  | 'haste'
  | 'swiftness'
  | 'toughness'
  | 'vampirism'
  | 'alchemy'
  | 'focus'
  | 'ascendance';

/** Rank every attribute is set to by the admin-only Ascendance. */
export const ASCENDED_RANK = 100;

export interface PerkDef {
  id: PerkId;
  name: string;
  /** What one pick gives. */
  description: string;
  /** Most times it can be picked in one run. */
  max: number;
  color: string;
  /** Only offered to a logged-in admin. */
  adminOnly?: boolean;
}

export const PERKS: Record<PerkId, PerkDef> = {
  vitality: { id: 'vitality', name: 'Vitality', description: '+25 max HP', max: 10, color: '#e2574c' },
  might: { id: 'might', name: 'Might', description: '+10% damage', max: 10, color: '#ff8a3c' },
  precision: { id: 'precision', name: 'Precision', description: '+5% crit chance', max: 8, color: '#ffd23f' },
  ferocity: { id: 'ferocity', name: 'Ferocity', description: '+30% crit damage', max: 6, color: '#ff5ad2' },
  haste: { id: 'haste', name: 'Haste', description: '+10% attack speed', max: 6, color: '#7fd4ff' },
  swiftness: { id: 'swiftness', name: 'Swiftness', description: '+7% move speed', max: 4, color: '#9be34a' },
  toughness: { id: 'toughness', name: 'Toughness', description: '+8 armor', max: 10, color: '#a7b0c0' },
  vampirism: { id: 'vampirism', name: 'Vampirism', description: '+1 life on hit', max: 5, color: '#c0262b' },
  alchemy: { id: 'alchemy', name: 'Alchemy', description: '+1 potion now, potions heal 10% more', max: 3, color: '#6fe07a' },
  focus: { id: 'focus', name: 'Focus', description: 'Abilities and dodge recharge 12% faster', max: 4, color: '#b07cff' },
  ascendance: {
    id: 'ascendance',
    name: 'Ascendance',
    description: `Every attribute jumps to rank ${ASCENDED_RANK}`,
    max: 1,
    color: '#29ffe0',
    adminOnly: true,
  },
};

/** The attributes anyone can pick (Ascendance is admin-only). */
export const PERK_IDS = (Object.keys(PERKS) as PerkId[]).filter((id) => !PERKS[id].adminOnly);

export type PerkCounts = Partial<Record<PerkId, number>>;

/** Stat changes from all picked perks. */
export interface PerkBonuses {
  maxHp: number;
  damagePct: number;
  critChance: number;
  critMultiplier: number;
  attackSpeedPct: number;
  moveSpeedPct: number;
  armor: number;
  lifeOnHit: number;
  potionHeal: number;
  cooldownRate: number;
}

export function perkBonuses(perks: PerkCounts): PerkBonuses {
  const n = (id: PerkId) => perks[id] ?? 0;
  return {
    maxHp: 25 * n('vitality'),
    damagePct: 0.1 * n('might'),
    critChance: 0.05 * n('precision'),
    critMultiplier: 0.3 * n('ferocity'),
    attackSpeedPct: 0.1 * n('haste'),
    moveSpeedPct: 0.07 * n('swiftness'),
    armor: 8 * n('toughness'),
    lifeOnHit: n('vampirism'),
    potionHeal: 0.1 * n('alchemy'),
    cooldownRate: 0.12 * n('focus'),
  };
}

/**
 * `count` distinct perks that aren't maxed out yet. An admin who hasn't
 * ascended always gets Ascendance as the first card.
 */
export function rollPerkChoices(rng: Rng, owned: PerkCounts, count = 3, admin = false): PerkId[] {
  const open = PERK_IDS.filter((id) => (owned[id] ?? 0) < PERKS[id].max);
  const picks = rng.shuffle(open).slice(0, count);
  if (admin && !owned.ascendance) return ['ascendance', ...picks.slice(0, count - 1)];
  return picks;
}

/** Take a pick: Ascendance sets every attribute to ASCENDED_RANK, anything else adds one rank. */
export function applyPerk(perks: PerkCounts, id: PerkId): void {
  if (id === 'ascendance') {
    for (const p of PERK_IDS) perks[p] = Math.max(perks[p] ?? 0, ASCENDED_RANK);
    perks.ascendance = 1;
    return;
  }
  perks[id] = (perks[id] ?? 0) + 1;
}
