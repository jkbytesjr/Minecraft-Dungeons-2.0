/**
 * Visual ground height (raised altars, ledges, sunken pits) for whatever is
 * standing at a world point. Presentation only: collision and combat stay on
 * the flat grid; this just lifts models, effects and projectiles onto the steps.
 */
import type { Level } from './level';

let heights: Float32Array | null = null;
let width = 0;
let depth = 0;
let walkable: (x: number, z: number) => boolean = () => false;

/** Use this level's height map (call when a floor loads). */
export function setTerrain(level: Level): void {
  heights = level.heights ?? null;
  width = level.grid.width;
  depth = level.grid.height;
  walkable = (x, z) => level.grid.isWalkable(x, z);
}

const tileHeight = (x: number, z: number): number => (heights && x >= 0 && z >= 0 && x < width && z < depth ? heights[z * width + x] : 0);

/**
 * Ground height at (x, z), blended between neighbouring walkable tiles so
 * walking up a step is a smooth rise rather than a pop.
 */
export function groundAt(x: number, z: number): number {
  if (!heights) return 0;
  const gx = x - 0.5;
  const gz = z - 0.5;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const fx = gx - x0;
  const fz = gz - z0;
  let sum = 0;
  let weight = 0;
  for (const [dx, dz, w] of [
    [0, 0, (1 - fx) * (1 - fz)],
    [1, 0, fx * (1 - fz)],
    [0, 1, (1 - fx) * fz],
    [1, 1, fx * fz],
  ] as const) {
    if (w <= 0 || !walkable(x0 + dx, z0 + dz)) continue;
    sum += tileHeight(x0 + dx, z0 + dz) * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : tileHeight(Math.floor(x), Math.floor(z));
}
