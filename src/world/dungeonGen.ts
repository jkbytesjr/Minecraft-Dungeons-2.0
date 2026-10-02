/**
 * Seeded procedural dungeon: rooms joined by corridors (minimum spanning tree
 * plus a few loops). Pure logic, no three.js, so it is unit-tested.
 */
import { Rng, hashSeed } from '../core/rng';
import { Tile, TileGrid } from './grid';
import { placeTorches, type Level } from './level';

export type RoomKind = 'start' | 'normal' | 'treasure' | 'boss';
export type EnemyKind = 'grunt' | 'archer' | 'exploder' | 'boss';
export type BossKind = 'colossus' | 'huntress' | 'pyromancer' | 'necromancer';
export const BOSS_KINDS: readonly BossKind[] = ['colossus', 'huntress', 'pyromancer', 'necromancer'];

export interface Room {
  id: number;
  x: number;
  z: number;
  w: number;
  h: number;
  kind: RoomKind;
}

export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  z: number;
  roomId: number;
}

export interface Dungeon extends Level {
  seed: number;
  depth: number;
  rooms: Room[];
  /** Pairs of room ids joined by a corridor. */
  connections: [number, number][];
  spawns: EnemySpawn[];
  chests: { x: number; z: number }[];
  /** Where the exit portal appears (inside the boss room). */
  exit: { x: number; z: number };
  /** Which boss guards this floor. */
  boss: BossKind;
}

const SIZE = 72;
const ROOM_MARGIN = 3;
const CORRIDOR_WIDTH = 2;

export function roomCenter(r: Room): { x: number; z: number } {
  return { x: Math.floor(r.x + r.w / 2), z: Math.floor(r.z + r.h / 2) };
}

function overlaps(a: Room, b: Room, margin: number): boolean {
  return (
    a.x - margin < b.x + b.w && a.x + a.w + margin > b.x && a.z - margin < b.z + b.h && a.z + a.h + margin > b.z
  );
}

/** Enemy mix shifts toward ranged/explosive enemies on deeper floors. */
function enemyWeights(depth: number): [EnemyKind, number][] {
  return [
    ['grunt', Math.max(24, 60 - depth * 8)],
    ['archer', 20 + Math.min(depth, 5) * 4],
    ['exploder', 20 + Math.min(depth, 5) * 4],
  ];
}

/**
 * The boss guarding floor `depth` (0-based) of a run. Floor 1 is always the
 * Colossus (the gentlest fight); floors 2-4 are the other three in a seeded
 * order, so each boss appears once. After that the floors go on forever, each
 * with a seeded boss that is never the same as the previous floor's.
 */
export function bossForFloor(seed: number, depth: number): BossKind {
  const first: BossKind[] = ['colossus', ...new Rng(hashSeed(`${seed}:bosses`)).shuffle(BOSS_KINDS.filter((b) => b !== 'colossus'))];
  if (depth < first.length) return first[Math.max(0, depth)];
  let prev = first[first.length - 1];
  for (let d = first.length; d <= depth; d++) {
    prev = new Rng(hashSeed(`${seed}:boss:${d}`)).pick(BOSS_KINDS.filter((b) => b !== prev));
  }
  return prev;
}

export function generateDungeon(seed: number, depth: number): Dungeon {
  const rng = new Rng(hashSeed(`${seed}:${depth}`));
  const grid = new TileGrid(SIZE, SIZE);
  const rooms: Room[] = [];
  const targetRooms = 9 + Math.min(depth, 3);

  const tryPlace = (w: number, h: number, kind: RoomKind): Room | null => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const room: Room = { id: rooms.length, x: rng.int(2, SIZE - w - 2), z: rng.int(2, SIZE - h - 2), w, h, kind };
      if (rooms.every((r) => !overlaps(r, room, ROOM_MARGIN))) {
        rooms.push(room);
        return room;
      }
    }
    return null;
  };

  // Boss arena first so it always fits.
  const bossSize = rng.int(13, 15);
  const boss = tryPlace(bossSize, bossSize, 'boss')!;
  for (let attempt = 0; attempt < 400 && rooms.length < targetRooms; attempt++) {
    tryPlace(rng.int(6, 11), rng.int(6, 11), 'normal');
  }

  // Pillars in larger rooms, placed before corridors so corridors can cut through them.
  for (const r of rooms) {
    grid.fillRect(r.x, r.z, r.w, r.h, Tile.Floor);
    if (r.w >= 9 && r.h >= 9 && rng.chance(0.6)) {
      const px = r.x + 2;
      const pz = r.z + 2;
      const qx = r.x + r.w - 3;
      const qz = r.z + r.h - 3;
      for (const [x, z] of [
        [px, pz],
        [qx, pz],
        [px, qz],
        [qx, qz],
      ])
        grid.set(x, z, Tile.Void);
    }
  }

  // Minimum spanning tree over room centres (Prim), then a few extra loops.
  const centers = rooms.map(roomCenter);
  const dist = (a: number, b: number) => Math.hypot(centers[a].x - centers[b].x, centers[a].z - centers[b].z);
  const connections: [number, number][] = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of inTree)
      for (let b = 0; b < rooms.length; b++) {
        if (inTree.has(b)) continue;
        const d = dist(a, b);
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    connections.push(best!);
    inTree.add(best![1]);
  }
  for (let a = 0; a < rooms.length; a++)
    for (let b = a + 1; b < rooms.length; b++) {
      const exists = connections.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
      if (!exists && dist(a, b) < 24 && rng.chance(0.15)) connections.push([a, b]);
    }

  for (const [a, b] of connections) carveCorridor(grid, centers[a], centers[b], rng.chance(0.5));
  grid.buildWalls();

  // Start = room furthest (in corridor hops) from the boss.
  const hops = roomHops(rooms.length, connections, boss.id);
  let start = rooms.find((r) => r.kind === 'normal')!;
  for (const r of rooms) {
    if (r.kind !== 'normal') continue;
    if (hops[r.id] > hops[start.id] || (hops[r.id] === hops[start.id] && dist(r.id, boss.id) > dist(start.id, boss.id)))
      start = r;
  }
  start.kind = 'start';
  const normals = rooms.filter((r) => r.kind === 'normal');
  if (normals.length > 2) rng.pick(normals).kind = 'treasure';

  // Spawns and chests.
  const spawns: EnemySpawn[] = [];
  const chests: { x: number; z: number }[] = [];
  const used = new Set<number>();
  const freeTile = (r: Room, inset: number): { x: number; z: number } | null => {
    for (let i = 0; i < 60; i++) {
      const x = rng.int(r.x + inset, r.x + r.w - 1 - inset);
      const z = rng.int(r.z + inset, r.z + r.h - 1 - inset);
      const key = z * SIZE + x;
      if (grid.get(x, z) === Tile.Floor && !used.has(key)) {
        used.add(key);
        return { x: x + 0.5, z: z + 0.5 };
      }
    }
    return null;
  };

  const bossCenter = roomCenter(boss);
  spawns.push({ kind: 'boss', x: bossCenter.x + 0.5, z: bossCenter.z + 0.5, roomId: boss.id });
  used.add(bossCenter.z * SIZE + bossCenter.x);

  for (const r of rooms) {
    if (r.kind === 'start') continue;
    if (r.kind === 'normal' || r.kind === 'treasure') {
      const area = r.w * r.h;
      // Deeper floors add enemies per room, up to a cap; beyond that they just hit harder.
      const count = Math.round(area / 22) + Math.min(depth, 3) + rng.int(0, 1);
      for (let i = 0; i < count; i++) {
        const t = freeTile(r, 1);
        if (t) spawns.push({ kind: rng.weighted(enemyWeights(depth)), ...t, roomId: r.id });
      }
    }
    const chestCount = r.kind === 'treasure' ? 2 : r.kind === 'normal' && rng.chance(0.25) ? 1 : 0;
    for (let i = 0; i < chestCount; i++) {
      const t = freeTile(r, 1);
      if (t) chests.push(t);
    }
  }

  const sc = roomCenter(start);
  const exit = { x: boss.x + boss.w / 2, z: boss.z + 2.5 };
  return {
    seed,
    depth,
    grid,
    rooms,
    connections,
    spawns,
    chests,
    exit,
    boss: bossForFloor(seed, depth),
    theme: depth,
    torches: placeTorches(grid, 6),
    playerStart: { x: sc.x + 0.5, z: sc.z + 0.5 },
  };
}

function carveCorridor(
  grid: TileGrid,
  a: { x: number; z: number },
  b: { x: number; z: number },
  horizontalFirst: boolean,
): void {
  const corner = horizontalFirst ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
  carveLine(grid, a, corner);
  carveLine(grid, corner, b);
}

function carveLine(grid: TileGrid, a: { x: number; z: number }, b: { x: number; z: number }): void {
  const x0 = Math.min(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const w = Math.abs(a.x - b.x) + CORRIDOR_WIDTH;
  const h = Math.abs(a.z - b.z) + CORRIDOR_WIDTH;
  grid.fillRect(x0, z0, w, h, Tile.Floor);
}

/** BFS hop count from `from` to every room over the corridor graph. */
function roomHops(count: number, connections: [number, number][], from: number): number[] {
  const hops = new Array<number>(count).fill(Infinity);
  hops[from] = 0;
  const queue = [from];
  while (queue.length) {
    const r = queue.shift()!;
    for (const [a, b] of connections) {
      const n = a === r ? b : b === r ? a : -1;
      if (n >= 0 && hops[n] === Infinity) {
        hops[n] = hops[r] + 1;
        queue.push(n);
      }
    }
  }
  return hops;
}
