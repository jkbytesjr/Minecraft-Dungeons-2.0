/** Equipment + bag + derived stats. Pure logic, unit-tested. */
import { STARTER_WEAPON, type ArmorItem, type Item, type StatKey, type WeaponItem } from './loot';
import { perkBonuses, type PerkCounts } from './perks';

export const BAG_SIZE = 16;
export const MAX_POTIONS = 9;
/** Move speed tops out at this multiple of the base speed. */
export const MAX_MOVE_MULT = 3;

export interface DerivedStats {
  maxHp: number;
  /** Damage multiplier from level and gear. */
  power: number;
  critChance: number;
  critMultiplier: number;
  armor: number;
  moveSpeed: number;
  /** Attack cooldown is divided by this. */
  attackSpeed: number;
  lifeOnHit: number;
  weaponDamage: number;
  /** Fraction of max HP a potion restores. */
  potionHeal: number;
  /** Ability and dodge cooldowns are divided by this. */
  cooldownRate: number;
}

const BASE = { maxHp: 100, critChance: 0.08, critMultiplier: 1.75, moveSpeed: 5, potionHeal: 0.4 };

export class Inventory {
  weapon: WeaponItem = STARTER_WEAPON;
  armor: ArmorItem | null = null;
  readonly bag: Item[] = [];
  potions = 1;

  get full(): boolean {
    return this.bag.length >= BAG_SIZE;
  }

  /** Returns false if the bag is full. */
  add(item: Item): boolean {
    if (this.full) return false;
    this.bag.push(item);
    return true;
  }

  addPotion(): boolean {
    if (this.potions >= MAX_POTIONS) return false;
    this.potions++;
    return true;
  }

  /** Equip the bag item at `index`, moving the currently equipped one into its place. */
  equip(index: number): void {
    const item = this.bag[index];
    if (!item) return;
    if (item.kind === 'weapon') {
      this.bag[index] = this.weapon;
      this.weapon = item;
    } else if (this.armor) {
      this.bag[index] = this.armor;
      this.armor = item;
    } else {
      this.bag.splice(index, 1);
      this.armor = item;
    }
  }

  /** Destroy a bag item. */
  salvage(index: number): void {
    if (index >= 0 && index < this.bag.length) this.bag.splice(index, 1);
  }

  /** Item currently equipped in the same slot as `item`. */
  equippedFor(item: Item): Item | null {
    return item.kind === 'weapon' ? this.weapon : this.armor;
  }
}

function sumMods(items: (Item | null)[], stat: StatKey): number {
  let total = 0;
  for (const item of items) if (item) for (const m of item.mods) if (m.stat === stat) total += m.value;
  return total;
}

/** Final stats from gear plus level-up perks. Character level itself grants nothing; the perks do. */
export function computeStats(perks: PerkCounts, inv: Pick<Inventory, 'weapon' | 'armor'>): DerivedStats {
  const gear = [inv.weapon, inv.armor];
  const pk = perkBonuses(perks);
  return {
    maxHp: BASE.maxHp + pk.maxHp + (inv.armor?.maxHp ?? 0) + sumMods(gear, 'maxHp'),
    power: 1 + pk.damagePct + sumMods(gear, 'damagePct'),
    critChance: Math.min(0.75, BASE.critChance + pk.critChance + sumMods(gear, 'critChance')),
    critMultiplier: BASE.critMultiplier + pk.critMultiplier,
    armor: (inv.armor?.armor ?? 0) + pk.armor + sumMods(gear, 'armor'),
    // Capped at 3x so the hero can still steer and stop on the cursor.
    moveSpeed: BASE.moveSpeed * Math.min(MAX_MOVE_MULT, 1 + pk.moveSpeedPct + sumMods(gear, 'moveSpeedPct')),
    attackSpeed: 1 + pk.attackSpeedPct + sumMods(gear, 'attackSpeedPct'),
    lifeOnHit: pk.lifeOnHit + sumMods(gear, 'lifeOnHit'),
    weaponDamage: inv.weapon.damage,
    potionHeal: BASE.potionHeal + pk.potionHeal,
    cooldownRate: 1 + pk.cooldownRate,
  };
}
