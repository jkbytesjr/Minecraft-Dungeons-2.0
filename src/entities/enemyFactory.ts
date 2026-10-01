import type { Enemy } from './enemy';
import { Grunt } from './grunt';
import { Archer } from './archer';
import { Exploder } from './exploder';
import type { Boss } from './boss';
import { Colossus } from './bosses/colossus';
import { Huntress } from './bosses/huntress';
import { Pyromancer } from './bosses/pyromancer';
import { Necromancer } from './bosses/necromancer';
import type { BossKind, EnemyKind } from '../world/dungeonGen';

const BOSSES: Record<BossKind, new (depth: number) => Boss> = {
  colossus: Colossus,
  huntress: Huntress,
  pyromancer: Pyromancer,
  necromancer: Necromancer,
};

/** Build an enemy for a dungeon depth (0-based). Deeper floors get tougher enemies. */
export function createEnemy(kind: EnemyKind, depth: number, boss: BossKind = 'colossus'): Enemy {
  const enemy =
    kind === 'archer'
      ? new Archer()
      : kind === 'exploder'
        ? new Exploder()
        : kind === 'boss'
          ? new BOSSES[boss](depth)
          : new Grunt();
  enemy.scaleForDepth(depth);
  return enemy;
}
