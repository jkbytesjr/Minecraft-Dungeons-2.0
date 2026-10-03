import type { Enemy } from './enemy';
import { Grunt } from './grunt';
import { Archer } from './archer';
import { Exploder } from './exploder';
import { Spider } from './spider';
import { Shieldbearer } from './shieldbearer';
import { Shaman } from './shaman';
import { Wraith } from './wraith';
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
  const regular: Record<Exclude<EnemyKind, 'boss'>, () => Enemy> = {
    grunt: () => new Grunt(),
    archer: () => new Archer(),
    exploder: () => new Exploder(),
    spider: () => new Spider(),
    shieldbearer: () => new Shieldbearer(),
    shaman: () => new Shaman(),
    wraith: () => new Wraith(),
  };
  const enemy = kind === 'boss' ? new BOSSES[boss](depth) : regular[kind]();
  enemy.scaleForDepth(depth);
  return enemy;
}
