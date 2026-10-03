import { Tile, type TileGrid } from './grid';

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
  /** Palette index for the voxel builder. */
  theme: number;
  /**
   * Visual floor height per tile (row-major, width x height), for raised altars,
   * ledges and sunken pits. Presentation only: collision stays flat. Neighbouring
   * walkable tiles differ by at most one step (STEP).
   */
  heights?: Float32Array;
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
