import { describe, expect, it } from 'vitest';
import exampleMod from '../public/mods/example-mod.json';
import { Rng } from '../src/core/rng';
import { DEFAULT_TWEAKS, ModRegistry, combineTweaks, makeModItem, parseColor, validateMod } from '../src/systems/mods';
import { DEFAULT_APPEARANCE, randomAppearance, validateAppearance } from '../src/systems/appearance';
import { buildTutorial, lessonFor, newTutorialProgress, roomAt } from '../src/world/tutorial';
import { ADMIN_ARMOR, ADMIN_DAMAGE, ADMIN_MAX_HP, makeAdminItem, RARITIES } from '../src/systems/loot';
import { DamageNumbers } from '../src/ui/damageNumbers';
import { MAX_MOVE_MULT, computeStats } from '../src/systems/inventory';
import { ADMIN_MAX_LEVEL, MAX_LEVEL, addXp, newProgress } from '../src/systems/progression';
import { ASCENDED_RANK, PERK_IDS, applyPerk, rollPerkChoices } from '../src/systems/perks';
import { rollDamage } from '../src/systems/damage';
import { POWER_IDS } from '../src/systems/powers';
import { Tile } from '../src/world/grid';

describe('validateMod', () => {
  it('accepts the shipped example mod without problems', () => {
    const r = validateMod(exampleMod);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.mod!.items).toHaveLength(2);
    expect(r.mod!.enemies.map((e) => e.id)).toEqual(['frost-grunt', 'giant-spider']);
    expect(r.mod!.enemies[0].tint).toBe(0x8fd4ff);
  });

  it('rejects files without an id or name', () => {
    expect(validateMod(null).mod).toBeNull();
    expect(validateMod({ name: 'x' }).mod).toBeNull();
    expect(validateMod({ id: 'bad id!', name: 'x' }).mod).toBeNull();
  });

  it('skips bad entries with errors and clamps out-of-range numbers', () => {
    const r = validateMod({
      id: 'm',
      name: 'M',
      tweaks: { xpMult: 1000, nonsense: 2, dropMult: 'lots' },
      items: [
        { name: 'Admin Sword', kind: 'weapon', rarity: 'admin' },
        { name: 'Ok', kind: 'weapon', weapon: 'axe' },
        { name: 'Fine', kind: 'armor', armor: 5, mods: [{ stat: 'luck', value: 1 }] },
      ],
      enemies: [{ id: 'e', base: 'dragon' }, { id: 'f', base: 'grunt', tint: 'blue' }],
    });
    expect(r.mod!.tweaks.xpMult).toBe(100);
    expect(r.mod!.tweaks.dropMult).toBe(DEFAULT_TWEAKS.dropMult);
    expect(r.mod!.items.map((i) => i.name)).toEqual(['Fine']);
    expect(r.mod!.items[0].mods).toEqual([]);
    expect(r.mod!.enemies.map((e) => e.id)).toEqual(['f']);
    expect(r.mod!.enemies[0].tint).toBeNull();
    // Admin rarity can never come from a mod.
    expect(r.errors.some((e) => e.includes('rarity'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('nonsense'))).toBe(true);
  });

  it('parses colours', () => {
    expect(parseColor('#ff0000')).toBe(0xff0000);
    expect(parseColor('00ff00')).toBe(0x00ff00);
    expect(parseColor('red')).toBeNull();
  });
});

describe('ModRegistry', () => {
  it('multiplies multipliers and adds bonuses across mods', () => {
    const t = combineTweaks([{ xpMult: 2, playerHpBonus: 10 }, { xpMult: 3, playerHpBonus: 5, modItemChance: 0.5 }]);
    expect(t.xpMult).toBe(6);
    expect(t.playerHpBonus).toBe(15);
    expect(t.modItemChance).toBe(0.5);
    expect(new ModRegistry().tweaks).toEqual(DEFAULT_TWEAKS);
  });

  it('only drops mod items from their minimum floor, and scales them', () => {
    const { mod } = validateMod({ id: 'm', name: 'M', tweaks: { modItemChance: 1 }, items: [{ name: 'Deep', kind: 'weapon', damage: 10, minFloor: 3 }] });
    const reg = new ModRegistry([mod!]);
    const rng = new Rng(4);
    expect(reg.maybeModItem(rng, 0)).toBeNull();
    const item = reg.maybeModItem(rng, 4)!;
    expect(item.name).toBe('Deep');
    expect(item.kind === 'weapon' && item.damage).toBe(20);
    expect(makeModItem(mod!.items[0], 0, 1).rarity).toBe('rare');
  });

  it('turns roughly `chance` of matching spawns into a variant', () => {
    const { mod } = validateMod({ id: 'm', name: 'M', enemies: [{ id: 'v', base: 'grunt', chance: 0.25 }] });
    const reg = new ModRegistry([mod!]);
    const rng = new Rng(8);
    let n = 0;
    for (let i = 0; i < 4000; i++) if (reg.variantFor('grunt', 0, rng)) n++;
    expect(n / 4000).toBeGreaterThan(0.2);
    expect(n / 4000).toBeLessThan(0.3);
    expect(reg.variantFor('archer', 0, rng)).toBeNull();
  });
});

describe('appearance', () => {
  it('falls back to defaults field by field', () => {
    expect(validateAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    const look = validateAppearance({ skin: 0x123456, hair: 'pink', hairStyle: 'mohawk', beard: 0x111111 });
    expect(look.skin).toBe(0x123456);
    expect(look.hair).toBe(DEFAULT_APPEARANCE.hair);
    expect(look.hairStyle).toBe('mohawk');
    expect(look.beard).toBe(0x111111);
    expect(validateAppearance({ hairStyle: 'afro' }).hairStyle).toBe('short');
  });

  it('random looks are always valid', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 50; i++) {
      const look = randomAppearance(() => rng.next());
      expect(validateAppearance(look)).toEqual(look);
    }
  });
});

describe('tutorial', () => {
  it('is one connected row of six rooms with a boss and a chest', () => {
    const t = buildTutorial();
    expect(t.tutorial).toBe(true);
    expect(t.rooms).toHaveLength(6);
    expect(t.spawns.filter((s) => s.kind === 'boss')).toHaveLength(1);
    expect(t.chests).toHaveLength(1);
    // Walk the corridor row from the start to the exit: all floor.
    for (let x = Math.floor(t.playerStart.x); x <= Math.floor(t.exit.x); x++) expect(t.grid.get(x, 11)).toBe(Tile.Floor);
    for (const s of t.spawns) expect(t.grid.isWalkableAt(s.x, s.z)).toBe(true);
    expect(roomAt(t, t.playerStart.x, t.playerStart.z)).toBe(0);
    expect(roomAt(t, t.exit.x, t.exit.z)).toBe(5);
    // In the corridor after room 0, the lesson is still room 0's.
    expect(roomAt(t, 14, 11.5)).toBe(0);
  });

  it('checks steps off as they are done', () => {
    const p = newTutorialProgress();
    expect(lessonFor(1, p, false).steps.every(([, d]) => d)).toBe(false);
    p.attacked = true;
    expect(lessonFor(1, p, true).steps.every(([, d]) => d)).toBe(true);
  });
});

describe('admin gear', () => {
  it('never drops, and carries every stat and power', () => {
    expect(RARITIES).not.toContain('admin');
    const sword = makeAdminItem('sword', 1);
    expect(sword.rarity).toBe('admin');
    expect(sword.kind === 'weapon' && sword.powers!.map((p) => p.id)).toEqual([...POWER_IDS]);
    expect(sword.kind === 'weapon' && sword.powers!.every((p) => p.tier === 3)).toBe(true);
    expect(new Set(sword.mods.map((m) => m.stat)).size).toBe(7);
    expect(sword.kind === 'weapon' && sword.damage).toBe(ADMIN_DAMAGE);
    expect(DamageNumbers.format(1234)).toBe('1234');
    expect(DamageNumbers.format(240_400)).toBe('240K');
    expect(DamageNumbers.format(6_038_271)).toBe('6.0M');
    const armor = makeAdminItem('armor', 2);
    if (sword.kind !== 'weapon' || armor.kind !== 'armor') throw new Error('kinds');
    const stats = computeStats({}, { weapon: sword, armor });
    expect(stats.critChance).toBe(0.75);
    expect(stats.maxHp).toBeGreaterThanOrEqual(ADMIN_MAX_HP);
    expect(stats.armor).toBeGreaterThanOrEqual(ADMIN_ARMOR);
    // A crit from an enemy around floor 1000 (base 40, x300 damage) barely scratches it.
    expect(rollDamage({ base: 40, power: 300, critChance: 1, critMultiplier: 1.75 }, stats.armor, () => 0.5).amount).toBeLessThanOrEqual(2);
  });
});

describe('level caps and Ascendance', () => {
  it('caps normal players at 100 and admins at 1000', () => {
    const p = newProgress();
    addXp(p, 1e9);
    expect(p.level).toBe(MAX_LEVEL);
    expect(MAX_LEVEL).toBe(100);
    addXp(p, 1e12, ADMIN_MAX_LEVEL);
    expect(p.level).toBe(1000);
  });

  it('is offered only to admins, once, and sets every attribute to 100', () => {
    for (let seed = 1; seed < 30; seed++) {
      expect(rollPerkChoices(new Rng(seed), {})).not.toContain('ascendance');
      const c = rollPerkChoices(new Rng(seed), {}, 3, true);
      expect(c[0]).toBe('ascendance');
      expect(new Set(c).size).toBe(3);
    }
    const perks = {};
    applyPerk(perks, 'ascendance');
    for (const id of PERK_IDS) expect(perks[id as keyof typeof perks]).toBe(ASCENDED_RANK);
    expect(rollPerkChoices(new Rng(1), perks, 3, true)).toEqual([]);
    const stats = computeStats(perks, { weapon: makeAdminItem('sword', 1) as never, armor: null });
    expect(stats.maxHp).toBe(100 + 25 * 100 + 999);
    expect(stats.moveSpeed).toBe(5 * MAX_MOVE_MULT);
  });
});
