import type { Enemy } from './enemy';
import { Grunt } from './grunt';
import { Archer } from './archer';
import { Exploder } from './exploder';
import { Boss } from './boss';
import type { EnemyKind } from '../world/dungeonGen';

/** Build an enemy for a dungeon depth (0-based). Deeper floors get tougher enemies. */
export function createEnemy(kind: EnemyKind, depth: number): Enemy {
  const enemy =
    kind === 'archer' ? new Archer() : kind === 'exploder' ? new Exploder() : kind === 'boss' ? new Boss(depth) : new Grunt();
  enemy.scaleForDepth(depth);
  return enemy;
}
