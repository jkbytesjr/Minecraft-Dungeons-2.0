import * as THREE from 'three';
import { Tile } from './grid';
import type { Level } from './level';
import { Rng } from '../core/rng';
import { applyWallCutout } from './wallCutout';

const WALL_HEIGHT = 2;

interface Theme {
  floor: number[];
  wall: number[];
  accent: number;
}

/** One palette per dungeon floor: earthy stone, mossy ruins, ashen depths. */
const THEMES: Theme[] = [
  { floor: [0x5b5249, 0x544b43, 0x625850, 0x4d453e], wall: [0x6e6a66, 0x65615d, 0x75716c, 0x5e5a56], accent: 0x4a6b3a },
  { floor: [0x4a5446, 0x434d40, 0x52604c, 0x3e473a], wall: [0x5d6b62, 0x56625a, 0x66756b, 0x4f5b53], accent: 0x3f7a4a },
  { floor: [0x4a3a38, 0x433331, 0x523f3c, 0x3c2e2c], wall: [0x5a4a4a, 0x524242, 0x635151, 0x4a3c3c], accent: 0x8a3a20 },
];

/** Builds the static level geometry as a handful of InstancedMeshes. */
export function buildLevelMeshes(level: Level, seed: number): THREE.Group {
  const { grid } = level;
  const rng = new Rng(seed ^ 0x9e3779b9);
  const group = new THREE.Group();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  applyWallCutout(wallMaterial);
  const theme = THEMES[level.theme % THEMES.length];

  let floorCount = 0;
  let wallCount = 0;
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] === Tile.Floor) floorCount++;
    else if (grid.tiles[i] === Tile.Wall) wallCount++;
  }

  const floor = new THREE.InstancedMesh(cube, material, floorCount);
  const walls = new THREE.InstancedMesh(cube, wallMaterial, wallCount * WALL_HEIGHT);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const accent = new THREE.Color(theme.accent);
  let fi = 0;
  let wi = 0;

  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const t = grid.get(x, z);
      if (t === Tile.Floor) {
        m.makeTranslation(x + 0.5, -0.5, z + 0.5);
        floor.setMatrixAt(fi, m);
        c.setHex(rng.pick(theme.floor)).multiplyScalar(rng.range(0.9, 1.08));
        // Occasional moss / ember tile for variety.
        if (rng.chance(0.06)) c.lerp(accent, 0.45);
        floor.setColorAt(fi++, c);
      } else if (t === Tile.Wall) {
        for (let y = 0; y < WALL_HEIGHT; y++) {
          m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
          walls.setMatrixAt(wi, m);
          c.setHex(rng.pick(theme.wall)).multiplyScalar(rng.range(0.88, 1.06) * (y === WALL_HEIGHT - 1 ? 1.1 : 1));
          walls.setColorAt(wi++, c);
        }
      }
    }
  }

  for (const mesh of [floor, walls]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  floor.name = 'floor';
  walls.name = 'walls';
  return group;
}
