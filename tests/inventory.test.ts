import { describe, expect, it } from 'vitest';
import { BAG_SIZE, Inventory, MAX_POTIONS, computeStats } from '../src/systems/inventory';
import { addXp, levelBonuses, xpToNext } from '../src/systems/progression';
import type { ArmorItem, WeaponItem } from '../src/systems/loot';

const spear: WeaponItem = {
  kind: 'weapon', id: 1, name: 'Pike', weapon: 'spear', damage: 20, rarity: 'rare', itemLevel: 0,
  mods: [{ stat: 'damagePct', value: 0.1 }, { stat: 'critChance', value: 0.05 }],
};
const plate: ArmorItem = {
  kind: 'armor', id: 2, name: 'Plate', armor: 30, maxHp: 15, rarity: 'common', itemLevel: 0,
  mods: [{ stat: 'maxHp', value: 10 }],
};

describe('Inventory', () => {
  it('starts with a sword, no armor, one potion', () => {
    const inv = new Inventory();
    expect(inv.weapon.weapon).toBe('sword');
    expect(inv.armor).toBeNull();
    expect(inv.potions).toBe(1);
  });

  it('refuses items when the bag is full', () => {
    const inv = new Inventory();
    for (let i = 0; i < BAG_SIZE; i++) expect(inv.add({ ...plate, id: 100 + i })).toBe(true);
    expect(inv.add(plate)).toBe(false);
    expect(inv.bag).toHaveLength(BAG_SIZE);
  });

  it('swaps equipped weapons and fills an empty armor slot', () => {
    const inv = new Inventory();
    inv.add(spear);
    inv.add(plate);
    inv.equip(0);
    expect(inv.weapon).toBe(spear);
    expect(inv.bag[0].name).toBe('Rusty Sword');
    inv.equip(1);
    expect(inv.armor).toBe(plate);
    expect(inv.bag).toHaveLength(1);
  });

  it('caps potions', () => {
    const inv = new Inventory();
    for (let i = 0; i < 20; i++) inv.addPotion();
    expect(inv.potions).toBe(MAX_POTIONS);
  });
});

describe('computeStats', () => {
  it('sums level, base item stats and modifiers', () => {
    const s = computeStats(3, { weapon: spear, armor: plate });
    expect(s.maxHp).toBe(100 + 20 + 15 + 10);
    expect(s.armor).toBe(30);
    expect(s.power).toBeCloseTo(1 + 0.12 + 0.1);
    expect(s.critChance).toBeCloseTo(0.08 + 0.05);
    expect(s.weaponDamage).toBe(20);
  });
});

describe('progression', () => {
  it('xp requirement grows with level', () => {
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
  });

  it('carries leftover xp across multiple level-ups', () => {
    const p = { level: 1, xp: 0 };
    const gained = addXp(p, xpToNext(1) + xpToNext(2) + 5);
    expect(gained).toBe(2);
    expect(p).toEqual({ level: 3, xp: 5 });
  });

  it('level bonuses start at zero', () => {
    expect(levelBonuses(1)).toEqual({ maxHp: 0, power: 0 });
  });
});
