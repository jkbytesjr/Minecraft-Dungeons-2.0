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

/** Level cap in normal play (enough to max out every attribute). */
export const MAX_LEVEL = 100;
/** Level cap while logged in as admin. */
export const ADMIN_MAX_LEVEL = 1000;

/**
 * XP needed to go from `level` to the next. It grows linearly, while XP per
 * kill grows faster with depth (see xpForKill), so the deeper you get the
 * fewer kills each level takes.
 */
export function xpToNext(level: number): number {
  return 30 * level;
}

/** XP for a kill on floor `depth` (0-based). */
export function xpForKill(baseXp: number, depth: number): number {
  return Math.round(baseXp * (1 + depth));
}

/** Add XP, carrying over into as many level-ups as it pays for, up to `cap`. Returns levels gained. */
export function addXp(p: Progress, amount: number, cap = MAX_LEVEL): number {
  let gained = 0;
  p.xp += Math.max(0, amount);
  while (p.level < cap && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    gained++;
  }
  if (p.level >= cap) p.xp = 0;
  p.pendingPicks += gained;
  return gained;
}
