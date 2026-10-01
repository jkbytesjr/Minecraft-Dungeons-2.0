/** XP and leveling. Pure logic, unit-tested. */

export interface Progress {
  level: number;
  /** XP accumulated toward the next level. */
  xp: number;
}

export const MAX_LEVEL = 30;

export function xpToNext(level: number): number {
  return Math.round(40 * Math.pow(level, 1.4));
}

/** Add XP, carrying over into as many level-ups as it pays for. Returns levels gained. */
export function addXp(p: Progress, amount: number): number {
  let gained = 0;
  p.xp += Math.max(0, amount);
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    gained++;
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  return gained;
}

/** Stat bonuses granted by character level alone. */
export function levelBonuses(level: number): { maxHp: number; power: number } {
  return { maxHp: 10 * (level - 1), power: 0.06 * (level - 1) };
}
