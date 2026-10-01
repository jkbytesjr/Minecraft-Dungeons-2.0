import { describe, expect, it } from 'vitest';
import { Tile, TileGrid } from '../src/world/grid';
import { Rng } from '../src/core/rng';

function room(): TileGrid {
  const g = new TileGrid(10, 10);
  g.fillRect(2, 2, 6, 6, Tile.Floor);
  g.buildWalls();
  return g;
}

describe('TileGrid', () => {
  it('surrounds floors with walls', () => {
    const g = room();
    expect(g.get(1, 1)).toBe(Tile.Wall);
    expect(g.get(8, 5)).toBe(Tile.Wall);
    expect(g.get(0, 0)).toBe(Tile.Void);
    expect(g.get(4, 4)).toBe(Tile.Floor);
  });

  it('stops movement at walls and slides along them', () => {
    const g = room();
    const pos = { x: 5, z: 5 };
    g.moveBox(pos, 10, 1, 0.3);
    expect(pos.x).toBeLessThanOrEqual(8 - 0.3);
    expect(pos.x).toBeGreaterThan(7.6);
    expect(pos.z).toBeCloseTo(6);
  });

  it('never tunnels through a wall on a large move', () => {
    const g = new TileGrid(12, 5);
    g.fillRect(1, 1, 10, 3, Tile.Floor);
    g.set(5, 1, Tile.Wall);
    g.set(5, 2, Tile.Wall);
    g.set(5, 3, Tile.Wall);
    const pos = { x: 2.5, z: 2.5 };
    g.moveBox(pos, 6, 0, 0.3);
    expect(pos.x).toBeLessThan(5);
  });

  it('computes line of sight', () => {
    const g = room();
    g.set(5, 4, Tile.Wall);
    expect(g.lineOfSight(3.5, 3.5, 7.5, 3.5)).toBe(true);
    expect(g.lineOfSight(5.5, 2.5, 5.5, 6.5)).toBe(false);
  });
});

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(new Rng(43).next()).not.toBe(seqA[0]);
  });

  it('int() stays within inclusive bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});
