import { Tile, TileGrid } from './grid';

export interface TorchSpot {
  /** World position of the torch flame. */
  x: number;
  y: number;
  z: number;
}

export interface Level {
  grid: TileGrid;
  torches: TorchSpot[];
  playerStart: { x: number; z: number };
}

/** Place torches on walls that face a floor tile, roughly every `spacing` tiles. */
export function placeTorches(grid: TileGrid, spacing: number): TorchSpot[] {
  const torches: TorchSpot[] = [];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const;
  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, z) !== Tile.Wall) continue;
      if ((x * 7 + z * 13) % spacing !== 0) continue;
      for (const [dx, dz] of dirs) {
        if (grid.get(x + dx, z + dz) !== Tile.Floor) continue;
        const tooClose = torches.some((t) => Math.abs(t.x - x) + Math.abs(t.z - z) < spacing * 0.6);
        if (tooClose) break;
        torches.push({ x: x + 0.5 + dx * 0.6, y: 1.5, z: z + 0.5 + dz * 0.6 });
        break;
      }
    }
  }
  return torches;
}

/** M1 test room: one big room with a few pillars and a side alcove. */
export function buildTestLevel(): Level {
  const grid = new TileGrid(32, 28);
  grid.fillRect(4, 4, 22, 18, Tile.Floor);
  grid.fillRect(26, 11, 4, 4, Tile.Floor);
  for (const [px, pz] of [
    [9, 9],
    [19, 9],
    [9, 16],
    [19, 16],
  ]) {
    grid.fillRect(px, pz, 2, 2, Tile.Void);
  }
  grid.buildWalls();
  return { grid, torches: placeTorches(grid, 5), playerStart: { x: 15, z: 13 } };
}
