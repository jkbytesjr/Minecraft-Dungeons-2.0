import * as THREE from 'three';

const unitCube = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map<number, THREE.MeshLambertMaterial>();

export function voxelMaterial(color: number): THREE.MeshLambertMaterial {
  let mat = materialCache.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    materialCache.set(color, mat);
  }
  return mat;
}

/** A unit-cube mesh scaled to `size`, using a shared per-colour material. */
export function voxelBox(
  size: [number, number, number],
  color: number,
  pos: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitCube, voxelMaterial(color));
  mesh.scale.set(...size);
  mesh.position.set(...pos);
  return mesh;
}

/**
 * Pivot group: the box hangs below the pivot so rotating the pivot swings it
 * like a limb from the shoulder or hip.
 */
export function limb(size: [number, number, number], color: number, pivot: [number, number, number]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...pivot);
  g.add(voxelBox(size, color, [0, -size[1] / 2, 0]));
  return g;
}

export interface HumanoidParts {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

export interface HumanoidColors {
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  boots: number;
}

/** A blocky biped about 1.5 units tall, facing +Z. */
export function buildHumanoid(colors: HumanoidColors, scale = 1): HumanoidParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(scale);

  const legL = limb([0.22, 0.55, 0.24], colors.pants, [-0.13, 0.6, 0]);
  const legR = limb([0.22, 0.55, 0.24], colors.pants, [0.13, 0.6, 0]);
  legL.add(voxelBox([0.24, 0.12, 0.28], colors.boots, [0, -0.52, 0.02]));
  legR.add(voxelBox([0.24, 0.12, 0.28], colors.boots, [0, -0.52, 0.02]));
  const torso = voxelBox([0.5, 0.55, 0.3], colors.shirt, [0, 0.88, 0]);
  const armL = limb([0.18, 0.52, 0.2], colors.shirt, [-0.35, 1.12, 0]);
  const armR = limb([0.18, 0.52, 0.2], colors.shirt, [0.35, 1.12, 0]);
  armL.add(voxelBox([0.16, 0.12, 0.18], colors.skin, [0, -0.5, 0]));
  armR.add(voxelBox([0.16, 0.12, 0.18], colors.skin, [0, -0.5, 0]));
  const head = voxelBox([0.42, 0.42, 0.42], colors.skin, [0, 1.38, 0]);
  const hair = voxelBox([0.46, 0.14, 0.46], colors.hair, [0, 0.22, -0.01]);
  hair.scale.divide(head.scale);
  hair.position.divide(head.scale);
  head.add(hair);
  // Eyes on the +Z face.
  for (const ex of [-0.1, 0.1]) {
    const eye = voxelBox([0.07, 0.07, 0.02], 0x1b1b1b, [ex, 0.02, 0.215]);
    eye.scale.divide(head.scale);
    eye.position.divide(head.scale);
    head.add(eye);
  }
  body.add(legL, legR, torso, armL, armR, head);
  return { root, body, head, armL, armR, legL, legR };
}
