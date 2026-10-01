import type { Enemy } from './enemy';
import { Grunt } from './grunt';
import type { EnemyKind } from '../world/dungeonGen';

/** Build an enemy for a dungeon depth (0-based). Deeper floors get tougher enemies. */
export function createEnemy(kind: EnemyKind, depth: number): Enemy {
  let enemy: Enemy;
  switch (kind) {
    // Archer, exploder and boss arrive in M4; grunts stand in until then.
    default:
      enemy = new Grunt();
  }
  enemy.scaleForDepth(depth);
  return enemy;
}
