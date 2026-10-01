/** Base weapon definitions. Loot (M5) rolls modifiers on top of these. */
export type WeaponKind = 'sword' | 'spear' | 'bow';

export interface WeaponDef {
  kind: WeaponKind;
  damage: number;
  /** Reach for melee, projectile travel distance for ranged. */
  range: number;
  /** Full melee arc in radians (ignored for ranged). */
  arc: number;
  /** Seconds between attacks. */
  cooldown: number;
  /** Fraction of the swing at which damage lands. */
  impactAt: number;
  knockback: number;
}

export const BASE_WEAPONS: Record<WeaponKind, WeaponDef> = {
  sword: { kind: 'sword', damage: 12, range: 1.9, arc: (110 * Math.PI) / 180, cooldown: 0.42, impactAt: 0.45, knockback: 5 },
  spear: { kind: 'spear', damage: 15, range: 2.9, arc: (35 * Math.PI) / 180, cooldown: 0.65, impactAt: 0.5, knockback: 7 },
  bow: { kind: 'bow', damage: 9, range: 16, arc: 0, cooldown: 0.55, impactAt: 0.6, knockback: 2 },
};
