/** Pure damage math. No three.js, so it is unit-testable. */

export interface AttackStats {
  /** Weapon or ability base damage. */
  base: number;
  /** Multiplier from level, gear, etc. 1 = no bonus. */
  power: number;
  /** 0..1 */
  critChance: number;
  /** e.g. 1.5 = +50% on crit. */
  critMultiplier: number;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
}

/** Fraction of damage that gets through `armor`. 0 armor = 1, 100 armor = 0.5. */
export function armorFactor(armor: number): number {
  return 100 / (100 + Math.max(0, armor));
}

/** Roll a hit. `roll` must return floats in [0, 1) (pass rng.next bound to an Rng). */
export function rollDamage(attack: AttackStats, armor: number, roll: () => number): DamageResult {
  const crit = roll() < attack.critChance;
  const variance = 0.9 + 0.2 * roll();
  const raw = attack.base * attack.power * variance * (crit ? attack.critMultiplier : 1);
  return { amount: Math.max(1, Math.round(raw * armorFactor(armor))), crit };
}

/** Damage from an explosion, falling off linearly to `minFraction` at the edge of `radius`. */
export function falloffDamage(base: number, distance: number, radius: number, minFraction = 0.35): number {
  if (distance >= radius) return 0;
  const t = Math.max(0, distance) / radius;
  return Math.round(base * (1 - t * (1 - minFraction)));
}
