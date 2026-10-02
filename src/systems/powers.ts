/** Special weapon powers on unique and mythic weapons. Pure logic, unit-tested. */
import type { Rng } from '../core/rng';

export type PowerId = 'ignite' | 'frost' | 'chain' | 'shockwave' | 'detonate';
export const POWER_IDS: readonly PowerId[] = ['ignite', 'frost', 'chain', 'shockwave', 'detonate'];

export interface WeaponPower {
  id: PowerId;
  /** 1 on unique weapons, 2 (stronger) on mythic weapons. */
  tier: 1 | 2;
}

/** Tuning per power and tier. Damage values are fractions of the hit's weapon damage. */
export const POWER_VALUES = {
  ignite: { 1: { dps: 0.35, duration: 3 }, 2: { dps: 0.55, duration: 4 } },
  frost: { 1: { slow: 0.5, duration: 2, freezeChance: 0.12, freeze: 1.2 }, 2: { slow: 0.4, duration: 2.5, freezeChance: 0.2, freeze: 1.5 } },
  chain: { 1: { chance: 0.25, jumps: 3, damage: 0.6, range: 5 }, 2: { chance: 0.4, jumps: 5, damage: 0.8, range: 6 } },
  shockwave: { 1: { every: 4, radius: 2.6, damage: 0.8 }, 2: { every: 3, radius: 3.2, damage: 1.1 } },
  detonate: { 1: { radius: 2.2, damage: 0.9 }, 2: { radius: 2.8, damage: 1.3 } },
} as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const POWERS: Record<PowerId, { name: string; color: string; describe: (tier: 1 | 2) => string }> = {
  ignite: {
    name: 'Ignite',
    color: '#ff8a3c',
    describe: (t) => `Hits set enemies on fire for ${pct(POWER_VALUES.ignite[t].dps)} weapon damage per second (${POWER_VALUES.ignite[t].duration}s)`,
  },
  frost: {
    name: 'Frost',
    color: '#8fd4ff',
    describe: (t) => {
      const v = POWER_VALUES.frost[t];
      return `Hits slow enemies to ${pct(v.slow)} speed; ${pct(v.freezeChance)} chance to freeze them for ${v.freeze}s`;
    },
  },
  chain: {
    name: 'Chain Lightning',
    color: '#c8e6ff',
    describe: (t) => {
      const v = POWER_VALUES.chain[t];
      return `${pct(v.chance)} chance on hit to arc to ${v.jumps} nearby enemies for ${pct(v.damage)} damage`;
    },
  },
  shockwave: {
    name: 'Shockwave',
    color: '#e8e2c8',
    describe: (t) => {
      const v = POWER_VALUES.shockwave[t];
      return `Every ${v.every === 3 ? '3rd' : '4th'} hit releases a shockwave for ${pct(v.damage)} damage`;
    },
  },
  detonate: {
    name: 'Detonate',
    color: '#ff5a3c',
    describe: (t) => `Critical hits explode for ${pct(POWER_VALUES.detonate[t].damage)} damage around the target`,
  },
};

export function describePower(p: WeaponPower): string {
  return `${POWERS[p.id].name}: ${POWERS[p.id].describe(p.tier)}`;
}

/** Unique weapons get one power; mythic weapons get two different, stronger ones. */
export function rollPowers(rng: Rng, rarity: string): WeaponPower[] {
  if (rarity === 'unique') return [{ id: rng.pick(POWER_IDS), tier: 1 }];
  if (rarity === 'mythic') return rng.shuffle([...POWER_IDS]).slice(0, 2).map((id) => ({ id, tier: 2 as const }));
  return [];
}
