/** XP and leveling. Pure logic, unit-tested. */
import type { PerkCounts } from './perks';

export interface Progress {
  level: number;
  /** XP accumulated toward the next level. */
  xp: number;
  /** Level-up attribute picks taken so far. */
  perks: PerkCounts;
  /** Level-ups whose attribute hasn't been chosen yet. */
  pendingPicks: number;
}

export function newProgress(): Progress {
  return { level: 1, xp: 0, perks: {}, pendingPicks: 0 };
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
  p.pendingPicks += gained;
  return gained;
}
