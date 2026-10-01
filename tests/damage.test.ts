import { describe, expect, it } from 'vitest';
import { armorFactor, falloffDamage, rollDamage, type AttackStats } from '../src/systems/damage';
import { inArc } from '../src/systems/combat';
import { Rng } from '../src/core/rng';

const base: AttackStats = { base: 20, power: 1, critChance: 0, critMultiplier: 2 };
/** A roll() that replays fixed values. */
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('rollDamage', () => {
  it('applies variance within ±10%', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const { amount } = rollDamage(base, 0, () => rng.next());
      expect(amount).toBeGreaterThanOrEqual(18);
      expect(amount).toBeLessThanOrEqual(22);
    }
  });

  it('multiplies by power and crit multiplier', () => {
    // roll #1 = crit check (0 < 1 => crit), roll #2 = variance midpoint (0.5 => x1.0)
    const r = rollDamage({ ...base, power: 1.5, critChance: 1 }, 0, fixed(0, 0.5));
    expect(r.crit).toBe(true);
    expect(r.amount).toBe(60);
  });

  it('armor reduces damage with diminishing returns', () => {
    expect(armorFactor(0)).toBe(1);
    expect(armorFactor(100)).toBe(0.5);
    expect(armorFactor(-20)).toBe(1);
    const unarmored = rollDamage(base, 0, fixed(0.99, 0.5)).amount;
    const armored = rollDamage(base, 100, fixed(0.99, 0.5)).amount;
    expect(armored).toBe(unarmored / 2);
  });

  it('always deals at least 1 damage', () => {
    expect(rollDamage({ ...base, base: 0.1 }, 1000, fixed(0.99, 0)).amount).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    const stats = { ...base, critChance: 0.3 };
    for (let i = 0; i < 50; i++) {
      expect(rollDamage(stats, 10, () => a.next())).toEqual(rollDamage(stats, 10, () => b.next()));
    }
  });
});

describe('falloffDamage', () => {
  it('is full at the centre, reduced at the edge, zero outside', () => {
    expect(falloffDamage(40, 0, 3)).toBe(40);
    expect(falloffDamage(40, 2.999, 3)).toBe(14);
    expect(falloffDamage(40, 3, 3)).toBe(0);
  });
});

describe('inArc', () => {
  const arc = Math.PI / 2;
  it('hits targets in front within range', () => {
    expect(inArc(0, 0, 0, 0, 1.5, 2, arc, 0.3)).toBe(true);
  });
  it('misses targets behind or out of range', () => {
    expect(inArc(0, 0, 0, 0, -1.5, 2, arc, 0.3)).toBe(false);
    expect(inArc(0, 0, 0, 0, 3, 2, arc, 0.3)).toBe(false);
  });
  it('handles angle wrap-around', () => {
    // Facing almost -PI, target at almost +PI: same direction.
    expect(inArc(0, 0, -Math.PI + 0.05, -0.05, -1.5, 2, arc, 0.3)).toBe(true);
  });
  it('always hits targets overlapping the attacker', () => {
    expect(inArc(0, 0, 0, 0, -0.2, 2, arc, 0.3)).toBe(true);
  });
});
