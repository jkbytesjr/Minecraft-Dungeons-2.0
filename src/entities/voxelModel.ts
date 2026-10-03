import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

/** Shared material for merged models: colour comes from the vertices. */
const mergedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

/**
 * Merge every plain voxel box under each node of `root` into one mesh per node,
 * baking each box's colour into its vertices. A detailed model drops from
 * dozens of draw calls to a handful. Glowing (basic-material) parts, and
 * anything added later (weapons, armour), stay separate.
 */
export function compactModel(root: THREE.Object3D): void {
  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const parent of parents) {
    const boxes = parent.children.filter(
      (c): c is THREE.Mesh =>
        (c as THREE.Mesh).isMesh &&
        c.children.length === 0 &&
        (c as THREE.Mesh).geometry === unitCube &&
        (c as THREE.Mesh).material instanceof THREE.MeshLambertMaterial &&
        !c.userData.keep,
    );
    if (boxes.length < 2) continue;
    const geos = boxes.map((b) => {
      b.updateMatrix();
      const g = unitCube.clone().applyMatrix4(b.matrix);
      const col = (b.material as THREE.MeshLambertMaterial).color;
      const n = g.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([col.r, col.g, col.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), mergedMaterial);
    for (const g of geos) g.dispose();
    for (const b of boxes) parent.remove(b);
    parent.add(merged);
  }
}

const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** Swap every mesh under `root` to a flat flash material (hit feedback), or restore. */
export function setFlash(root: THREE.Object3D, on: boolean, material: THREE.Material = flashMaterial): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.noFlash) return;
    if (on) {
      mesh.userData.baseMaterial ??= mesh.material;
      mesh.material = material;
    } else if (mesh.userData.baseMaterial) {
      mesh.material = mesh.userData.baseMaterial as THREE.Material;
    }
  });
}

export interface HumanoidParts {
  root: THREE.Group;
  /** Pivots around the character's centre (for rolls and death tilts). */
  body: THREE.Group;
  /** Standing height of the body pivot (mutable: elites are scaled up). */
  bodyBaseY: number;
  head: THREE.Mesh;
  /** Hair, kept separate so headgear can hide it instead of clipping through it. */
  hair?: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

export type HairStyle = 'short' | 'bald' | 'long' | 'mohawk' | 'ponytail';

export interface HumanoidColors {
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  boots: number;
  /** Belt colour (defaults to a darkened shirt). */
  belt?: number;
  /** Eye colour (defaults to near-black). Bright colours read as glowing. */
  eyes?: number;
  /** Hair style: short cap with fringe (default), bald, long, mohawk or ponytail. */
  hairStyle?: HairStyle;
  /** Beard colour; no beard when unset. */
  beard?: number;
}

/** Multiply a hex colour's channels by `f` (darken below 1, lighten above). */
export function shade(hex: number, f: number): number {
  const c = new THREE.Color(hex).multiplyScalar(f);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return c.getHex();
}

/**
 * Add a box to the scaled head cube, sized and placed in body units (the head
 * is 0.42 across, centred on its origin, face on +Z).
 */
export function onHead(head: THREE.Mesh, size: [number, number, number], color: number, pos: [number, number, number]): THREE.Mesh {
  const box = voxelBox(size, color, pos);
  box.scale.divide(head.scale);
  box.position.divide(head.scale);
  head.add(box);
  return box;
}

/** A blocky biped about 1.5 units tall, facing +Z. */
export function buildHumanoid(colors: HumanoidColors, scale = 1): HumanoidParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const inner = new THREE.Group();
  root.add(body);
  body.add(inner);
  body.scale.setScalar(scale);
  const bodyBaseY = 0.75 * scale;
  body.position.y = bodyBaseY;
  inner.position.y = -0.75;
  const belt = colors.belt ?? shade(colors.shirt, 0.55);
  const glowEyes = colors.eyes !== undefined && new THREE.Color(colors.eyes).getHSL({ h: 0, s: 0, l: 0 }).l > 0.45;

  // Legs: trouser, knee patch, and a boot with a toe and a turned-down cuff.
  const legL = limb([0.22, 0.55, 0.24], colors.pants, [-0.13, 0.6, 0]);
  const legR = limb([0.22, 0.55, 0.24], colors.pants, [0.13, 0.6, 0]);
  for (const leg of [legL, legR]) {
    leg.add(
      voxelBox([0.24, 0.16, 0.27], colors.boots, [0, -0.49, 0.015]),
      voxelBox([0.22, 0.07, 0.1], colors.boots, [0, -0.53, 0.17]),
      voxelBox([0.255, 0.05, 0.275], shade(colors.boots, 1.35), [0, -0.4, 0.015]),
    );
  }

  // Torso: shirt, collar, belt with a buckle, and a darker hem.
  const torso = voxelBox([0.5, 0.55, 0.3], colors.shirt, [0, 0.88, 0]);
  const details = [
    voxelBox([0.3, 0.06, 0.31], shade(colors.shirt, 0.75), [0, 1.13, 0]),
    voxelBox([0.52, 0.08, 0.32], belt, [0, 0.66, 0]),
    voxelBox([0.1, 0.07, 0.04], 0xc9a44a, [0, 0.66, 0.16]),
    voxelBox([0.51, 0.06, 0.31], shade(colors.shirt, 0.8), [0, 0.6, 0]),
  ];

  // Arms: sleeve, cuff, then a hand.
  const armL = limb([0.18, 0.52, 0.2], colors.shirt, [-0.35, 1.12, 0]);
  const armR = limb([0.18, 0.52, 0.2], colors.shirt, [0.35, 1.12, 0]);
  for (const arm of [armL, armR]) {
    arm.add(voxelBox([0.2, 0.06, 0.22], shade(colors.shirt, 0.7), [0, -0.4, 0]), voxelBox([0.16, 0.12, 0.18], colors.skin, [0, -0.5, 0]));
  }

  // Head: face features and hair, all placed in body units.
  const head = voxelBox([0.42, 0.42, 0.42], colors.skin, [0, 1.38, 0]);
  const style = colors.hairStyle ?? 'short';
  // Hair lives in its own group, in body units (the group undoes the head's scale).
  const hair = new THREE.Group();
  hair.scale.set(1 / 0.42, 1 / 0.42, 1 / 0.42);
  const h = (size: [number, number, number], pos: [number, number, number]) => hair.add(voxelBox(size, colors.hair, pos));
  if (style === 'mohawk') {
    h([0.1, 0.16, 0.44], [0, 0.27, -0.02]);
    h([0.1, 0.1, 0.08], [0, 0.22, 0.22]);
  } else if (style !== 'bald') {
    h([0.46, 0.12, 0.46], [0, 0.21, -0.01]);
    h([0.46, 0.3, 0.08], [0, 0.06, -0.2]);
    h([0.06, 0.16, 0.36], [-0.215, 0.1, -0.03]);
    h([0.06, 0.16, 0.36], [0.215, 0.1, -0.03]);
    // Fringe across the forehead.
    h([0.36, 0.06, 0.04], [0.03, 0.15, 0.21]);
    if (style === 'long') h([0.44, 0.36, 0.08], [0, -0.2, -0.2]);
    if (style === 'ponytail') {
      h([0.14, 0.12, 0.1], [0, 0.12, -0.27]);
      h([0.1, 0.3, 0.09], [0, -0.08, -0.29]);
    }
  }
  if (hair.children.length) head.add(hair);
  if (colors.beard !== undefined) {
    // Chin beard, sideburns and a moustache, clear of the mouth.
    onHead(head, [0.4, 0.1, 0.06], colors.beard, [0, -0.17, 0.2]);
    onHead(head, [0.05, 0.2, 0.1], colors.beard, [-0.205, -0.08, 0.15]);
    onHead(head, [0.05, 0.2, 0.1], colors.beard, [0.205, -0.08, 0.15]);
    onHead(head, [0.2, 0.04, 0.03], colors.beard, [0, -0.085, 0.225]);
  }
  for (const ex of [-0.095, 0.095]) {
    if (glowEyes) {
      const eye = new THREE.Mesh(unitCube, new THREE.MeshBasicMaterial({ color: colors.eyes }));
      eye.scale.set(0.08, 0.06, 0.02);
      eye.position.set(ex, 0.02, 0.215);
      eye.scale.divide(head.scale);
      eye.position.divide(head.scale);
      head.add(eye);
    } else {
      onHead(head, [0.08, 0.07, 0.02], 0xf2efe8, [ex, 0.02, 0.212]);
      onHead(head, [0.04, 0.06, 0.02], colors.eyes ?? 0x1b1b1b, [ex + (ex < 0 ? 0.015 : -0.015), 0.015, 0.219]);
    }
    // Brows.
    onHead(head, [0.1, 0.03, 0.02], style === 'bald' || style === 'mohawk' ? shade(colors.skin, 0.6) : colors.hair, [ex, 0.085, 0.215]);
  }
  onHead(head, [0.06, 0.07, 0.05], shade(colors.skin, 0.85), [0, -0.04, 0.225]);
  onHead(head, [0.12, 0.025, 0.02], shade(colors.skin, 0.5), [0, -0.12, 0.212]);

  inner.add(legL, legR, torso, ...details, armL, armR, head);
  return { root, body, bodyBaseY, head, hair: hair.children.length ? hair : undefined, armL, armR, legL, legR };
}
