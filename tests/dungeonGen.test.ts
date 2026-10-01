import { describe, expect, it } from 'vitest';
import { generateDungeon, type Dungeon } from '../src/world/dungeonGen';
import { Tile } from '../src/world/grid';

/** Count floor tiles reachable from the player start (4-connected). */
function reachableFloor(d: Dungeon): { reachable: number; total: number } {
  const { grid } = d;
  const seen = new Uint8Array(grid.width * grid.height);
  const sx = Math.floor(d.playerStart.x);
  const sz = Math.floor(d.playerStart.z);
  const stack = [[sx, sz]];
  seen[sz * grid.width + sx] = 1;
  let reachable = 0;
  while (stack.length) {
    const [x, z] = stack.pop()!;
    reachable++;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (!grid.isWalkable(nx, nz) || seen[nz * grid.width + nx]) continue;
      seen[nz * grid.width + nx] = 1;
      stack.push([nx, nz]);
    }
  }
  const total = grid.tiles.reduce((n, t) => n + (t === Tile.Floor ? 1 : 0), 0);
  return { reachable, total };
}

const SEEDS = [1, 2, 3, 42, 1337, 98765, 4_000_000_000];

describe('generateDungeon', () => {
  it('is deterministic for a seed and depth', () => {
    const a = generateDungeon(1234, 1);
    const b = generateDungeon(1234, 1);
    expect(Array.from(a.grid.tiles)).toEqual(Array.from(b.grid.tiles));
    expect(a.spawns).toEqual(b.spawns);
    expect(a.chests).toEqual(b.chests);
    expect(a.playerStart).toEqual(b.playerStart);
  });

  it('differs between seeds and between depths', () => {
    const base = Array.from(generateDungeon(1, 0).grid.tiles).join('');
    expect(Array.from(generateDungeon(2, 0).grid.tiles).join('')).not.toBe(base);
    expect(Array.from(generateDungeon(1, 1).grid.tiles).join('')).not.toBe(base);
  });

  for (const seed of SEEDS) {
    for (const depth of [0, 2]) {
      it(`seed ${seed} depth ${depth}: connected, enclosed, sane spawns`, () => {
        const d = generateDungeon(seed, depth);
        const { grid } = d;

        // Every floor tile is reachable from the start.
        const { reachable, total } = reachableFloor(d);
        expect(reachable).toBe(total);

        // Floors never touch the map edge or void: always walled in.
        for (let z = 0; z < grid.height; z++)
          for (let x = 0; x < grid.width; x++) {
            if (grid.get(x, z) !== Tile.Floor) continue;
            for (let dz = -1; dz <= 1; dz++)
              for (let dx = -1; dx <= 1; dx++) expect(grid.get(x + dx, z + dz)).not.toBe(Tile.Void);
          }

        // Rooms don't overlap.
        for (const a of d.rooms)
          for (const b of d.rooms) {
            if (a === b) continue;
            const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.h && a.z + a.h > b.z;
            expect(overlap).toBe(false);
          }

        // Exactly one start and one boss room, and they differ.
        const start = d.rooms.filter((r) => r.kind === 'start');
        const boss = d.rooms.filter((r) => r.kind === 'boss');
        expect(start).toHaveLength(1);
        expect(boss).toHaveLength(1);
        expect(start[0].id).not.toBe(boss[0].id);

        // Spawns: on floor, none in the start room, exactly one boss in the boss room.
        for (const s of d.spawns) {
          expect(grid.isWalkableAt(s.x, s.z)).toBe(true);
          expect(s.roomId).not.toBe(start[0].id);
        }
        const bosses = d.spawns.filter((s) => s.kind === 'boss');
        expect(bosses).toHaveLength(1);
        expect(bosses[0].roomId).toBe(boss[0].id);
        expect(d.spawns.length).toBeGreaterThan(8);

        expect(grid.isWalkableAt(d.playerStart.x, d.playerStart.z)).toBe(true);
        expect(grid.isWalkableAt(d.exit.x, d.exit.z)).toBe(true);
        for (const c of d.chests) expect(grid.isWalkableAt(c.x, c.z)).toBe(true);
      });
    }
  }

  it('deeper floors have more enemies on average', () => {
    const avg = (depth: number) => SEEDS.reduce((n, s) => n + generateDungeon(s, depth).spawns.length, 0) / SEEDS.length;
    expect(avg(2)).toBeGreaterThan(avg(0));
  });
});
