import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { POWERS, POWER_IDS, describePower, rollPowers } from '../src/systems/powers';
import { rollItem } from '../src/systems/loot';

describe('rollPowers', () => {
  it('gives no powers below unique', () => {
    const rng = new Rng(1);
    expect(rollPowers(rng, 'common')).toEqual([]);
    expect(rollPowers(rng, 'rare')).toEqual([]);
  });

  it('gives unique weapons one tier-1 power', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 100; i++) {
      const p = rollPowers(rng, 'unique');
      expect(p).toHaveLength(1);
      expect(p[0].tier).toBe(1);
    }
  });

  it('gives mythic weapons two different tier-2 powers', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 100; i++) {
      const p = rollPowers(rng, 'mythic');
      expect(p).toHaveLength(2);
      expect(p[0].id).not.toBe(p[1].id);
      expect(p.every((x) => x.tier === 2)).toBe(true);
    }
  });

  it('can roll every power', () => {
    const rng = new Rng(4);
    const seen = new Set(Array.from({ length: 200 }, () => rollPowers(rng, 'unique')[0].id));
    expect(seen).toEqual(new Set(POWER_IDS));
  });

  it('describes every power at both tiers', () => {
    for (const id of POWER_IDS)
      for (const tier of [1, 2] as const) {
        expect(describePower({ id, tier })).toContain(POWERS[id].name);
        expect(POWERS[id].describe(tier)).not.toMatch(/undefined|NaN/);
      }
  });
});

describe('weapon drops', () => {
  it('only unique and mythic weapons carry powers; armor never does', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 3000; i++) {
      const item = rollItem(rng, 10, { uniqueBoost: 20 });
      if (item.kind === 'armor') {
        expect('powers' in item).toBe(false);
        continue;
      }
      const n = item.powers?.length ?? 0;
      expect(n).toBe({ common: 0, rare: 0, unique: 1, mythic: 2, admin: 5 }[item.rarity]);
    }
  });
});
