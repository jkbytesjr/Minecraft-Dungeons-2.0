import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { MOD_RANGES, RARITY_MULT, rollDrops, rollItem, rollRarity, type Item } from '../src/systems/loot';

describe('rollRarity', () => {
  it('follows roughly 70/25/5 weights, with mythics under 1% on floor 1', () => {
    const rng = new Rng(11);
    const counts = { common: 0, rare: 0, unique: 0, mythic: 0, admin: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) counts[rollRarity(rng)]++;
    expect(counts.common / N).toBeCloseTo(0.7, 1);
    expect(counts.rare / N).toBeCloseTo(0.25, 1);
    expect(counts.unique / N).toBeGreaterThan(0.03);
    expect(counts.unique / N).toBeLessThan(0.07);
    expect(counts.mythic).toBeGreaterThan(0);
    expect(counts.mythic / N).toBeLessThan(0.01);
    expect(counts.admin).toBe(0);
  });

  it('makes mythics more common on deeper floors and from bosses', () => {
    const rate = (itemLevel: number, boost: number) => {
      const rng = new Rng(77);
      let n = 0;
      for (let i = 0; i < 20000; i++) if (rollRarity(rng, 'common', boost, itemLevel) === 'mythic') n++;
      return n / 20000;
    };
    expect(rate(20, 0)).toBeGreaterThan(rate(0, 0) * 3);
    expect(rate(0, 30)).toBeGreaterThan(rate(0, 0) * 3);
  });

  it('respects a minimum rarity', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 500; i++) expect(rollRarity(rng, 'rare')).not.toBe('common');
  });
});

describe('rollItem', () => {
  it('is deterministic for a seed', () => {
    expect(rollItem(new Rng(99), 2)).toEqual(rollItem(new Rng(99), 2));
  });

  it('gives each rarity the right number of unique modifiers', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 2000; i++) {
      const item = rollItem(rng, 1);
      const n = item.mods.length;
      if (item.rarity === 'common') expect(n).toBeLessThanOrEqual(1);
      if (item.rarity === 'rare') expect(n).toBe(2);
      if (item.rarity === 'unique') expect(n).toBe(3);
      if (item.rarity === 'mythic') expect(n).toBe(4);
      expect(new Set(item.mods.map((m) => m.stat)).size).toBe(n);
    }
  });

  it('keeps modifier values inside their scaled ranges', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 2000; i++) {
      const lvl = i % 3;
      const item = rollItem(rng, lvl);
      for (const m of item.mods) {
        const r = MOD_RANGES[m.stat];
        const scale = RARITY_MULT[item.rarity] * (r.flat ? 1 + 0.25 * lvl : 1);
        expect(m.value).toBeGreaterThanOrEqual(Math.floor(r.min * scale) - 0.001);
        expect(m.value).toBeLessThanOrEqual(Math.ceil(r.max * scale) + 0.001);
      }
    }
  });

  it('scales base stats with rarity and item level', () => {
    const avg = (pred: (i: Item) => boolean, lvl: number, minRarity?: 'rare') => {
      const rng = new Rng(21 + lvl);
      const xs: number[] = [];
      while (xs.length < 400) {
        const it = rollItem(rng, lvl, { kind: 'weapon', minRarity });
        if (pred(it) && it.kind === 'weapon') xs.push(it.damage / { sword: 12, spear: 15, bow: 9 }[it.weapon]);
      }
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    const common0 = avg((i) => i.rarity === 'common', 0);
    const unique0 = avg((i) => i.rarity === 'unique', 0, 'rare');
    const common2 = avg((i) => i.rarity === 'common', 2);
    expect(unique0).toBeGreaterThan(common0 * 1.5);
    expect(common2).toBeGreaterThan(common0 * 1.4);
  });

  it('can force weapon or armor', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 50; i++) {
      expect(rollItem(rng, 0, { kind: 'armor' }).kind).toBe('armor');
      expect(rollItem(rng, 0, { kind: 'weapon' }).kind).toBe('weapon');
    }
  });
});

describe('rollDrops', () => {
  it('bosses always drop two rare-or-better items and a potion', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 200; i++) {
      const drops = rollDrops(rng, 'boss', 1);
      const items = drops.flatMap((d) => (d.type === 'item' ? [d.item] : []));
      expect(items).toHaveLength(2);
      for (const it of items) expect(it.rarity).not.toBe('common');
      expect(drops.some((d) => d.type === 'potion')).toBe(true);
    }
  });

  it('chests always drop at least one item', () => {
    const rng = new Rng(6);
    for (let i = 0; i < 200; i++) expect(rollDrops(rng, 'chest', 0).some((d) => d.type === 'item')).toBe(true);
  });

  it('regular enemies drop items occasionally (~12%)', () => {
    const rng = new Rng(7);
    let items = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) items += rollDrops(rng, 'grunt', 0).filter((d) => d.type === 'item').length;
    expect(items / N).toBeGreaterThan(0.09);
    expect(items / N).toBeLessThan(0.15);
  });
});
