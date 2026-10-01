import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/core/fixedStep';
import { Exploration } from '../src/world/exploration';
import { Tile, TileGrid } from '../src/world/grid';

describe('FixedStep', () => {
  it('accumulates partial frames into whole ticks', () => {
    const fs = new FixedStep(1 / 60);
    expect(fs.advance(1 / 120)).toBe(0);
    expect(fs.advance(1 / 120)).toBe(1);
    expect(fs.advance(1 / 30)).toBe(2);
  });

  it('caps ticks per frame and drops the backlog', () => {
    const fs = new FixedStep(1 / 60, 5);
    expect(fs.advance(1)).toBe(5);
    expect(fs.advance(0)).toBeLessThanOrEqual(1);
  });

  it('ignores negative time', () => {
    expect(new FixedStep().advance(-1)).toBe(0);
  });
});

describe('Exploration', () => {
  // Two 5x5 rooms side by side, separated by a solid wall column at x = 6.
  const grid = new TileGrid(13, 7);
  grid.fillRect(1, 1, 5, 5, Tile.Floor);
  grid.fillRect(7, 1, 5, 5, Tile.Floor);
  grid.buildWalls();

  it('reveals floor and walls in range', () => {
    const ex = new Exploration(grid);
    const fresh = ex.reveal(3.5, 3.5, 4);
    expect(fresh.length).toBeGreaterThan(0);
    expect(ex.isSeen(3, 3)).toBe(true);
    expect(ex.isSeen(6, 3)).toBe(true);
  });

  it('does not see through walls', () => {
    const ex = new Exploration(grid);
    ex.reveal(5.5, 3.5, 6);
    expect(ex.isSeen(8, 3)).toBe(false);
  });

  it('only reports tiles once', () => {
    const ex = new Exploration(grid);
    ex.reveal(3.5, 3.5, 4);
    expect(ex.reveal(3.5, 3.5, 4)).toEqual([]);
  });
});
