/** Fog-of-war for the minimap: which tiles the player has seen. Pure logic, unit-tested. */
import { Tile, type TileGrid } from './grid';

export class Exploration {
  readonly seen: Uint8Array;

  constructor(readonly grid: TileGrid) {
    this.seen = new Uint8Array(grid.width * grid.height);
  }

  isSeen(x: number, z: number): boolean {
    return this.grid.inBounds(x, z) && this.seen[z * this.grid.width + x] === 1;
  }

  /**
   * Mark tiles within `radius` of world point (wx, wz) that are in line of sight.
   * Walls are revealed but block sight. Returns the newly seen tiles as flat indices.
   */
  reveal(wx: number, wz: number, radius: number): number[] {
    const { grid, seen } = this;
    const fresh: number[] = [];
    const cx = Math.floor(wx);
    const cz = Math.floor(wz);
    const r = Math.ceil(radius);
    for (let z = cz - r; z <= cz + r; z++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!grid.inBounds(x, z)) continue;
        const i = z * grid.width + x;
        if (seen[i] || grid.get(x, z) === Tile.Void) continue;
        if ((x - cx) ** 2 + (z - cz) ** 2 > radius * radius) continue;
        if (!this.lineOfSight(cx, cz, x, z)) continue;
        seen[i] = 1;
        fresh.push(i);
      }
    }
    return fresh;
  }

  /** Bresenham walk; only the end tile may be opaque. */
  private lineOfSight(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let x = x0;
    let z = z0;
    while (x !== x1 || z !== z1) {
      if ((x !== x0 || z !== z0) && !this.grid.isWalkable(x, z)) return false;
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        z += sz;
      }
    }
    return true;
  }
}
