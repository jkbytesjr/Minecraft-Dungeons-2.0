import * as THREE from 'three';
import { voxelBox, type HumanoidParts } from './voxelModel';
import type { ArmorItem, Rarity, WeaponItem } from '../systems/loot';

/** Blade/tip colour per rarity, so better weapons read at a glance. */
const BLADE: Record<Rarity, number> = { common: 0xd7dde3, rare: 0x8fc4ff, unique: 0xffb347 };
const TRIM: Record<Rarity, number> = { common: 0x5a4632, rare: 0x3a7bd5, unique: 0xffb02e };

/** Held-weapon mesh. Swords/spears go in the right hand, bows in the left. */
export function buildWeaponMesh(item: WeaponItem): THREE.Group {
  const g = new THREE.Group();
  const blade = BLADE[item.rarity];
  const trim = TRIM[item.rarity];
  if (item.weapon === 'sword') {
    g.add(voxelBox([0.07, 0.07, 0.85], blade, [0, -0.5, 0.5]), voxelBox([0.28, 0.08, 0.08], item.rarity === 'common' ? 0x8a6a2a : trim, [0, -0.5, 0.1]));
    if (item.rarity === 'unique') g.add(voxelBox([0.1, 0.1, 0.1], 0xfff2b0, [0, -0.5, 0.0]));
  } else if (item.weapon === 'spear') {
    g.add(voxelBox([0.06, 0.06, 1.7], 0x7a5530, [0, -0.5, 0.45]), voxelBox([0.12, 0.12, 0.3], blade, [0, -0.5, 1.4]));
    if (item.rarity !== 'common') g.add(voxelBox([0.1, 0.1, 0.06], trim, [0, -0.5, 1.22]));
  } else {
    const wood = item.rarity === 'unique' ? 0x5a2e1a : 0x8a5a2b;
    g.add(
      voxelBox([0.06, 0.06, 0.95], wood, [0, -0.5, 0.06]),
      voxelBox([0.06, 0.12, 0.08], item.rarity === 'common' ? wood : trim, [0, -0.44, 0.5]),
      voxelBox([0.06, 0.12, 0.08], item.rarity === 'common' ? wood : trim, [0, -0.44, -0.38]),
      voxelBox([0.015, 0.015, 0.9], item.rarity === 'common' ? 0xeeeeee : blade, [0, -0.38, 0.06]),
    );
  }
  return g;
}

type ArmorStyle = 'leather' | 'scale' | 'chain' | 'plate';

const STYLE_COLOR: Record<ArmorStyle, number> = { leather: 0x7a4e2a, scale: 0x8a7a4a, chain: 0x9aa0a8, plate: 0xb8c0cc };

function armorStyle(item: ArmorItem): ArmorStyle {
  if (item.rarity === 'unique') return 'plate';
  if (item.name.includes('Leather')) return 'leather';
  if (item.name.includes('Scale')) return 'scale';
  if (item.name.includes('Chain')) return 'chain';
  return 'plate';
}

/**
 * Attach armour pieces to a humanoid. Returns the added objects so they can be
 * removed when the armour changes.
 */
export function attachArmor(parts: HumanoidParts, item: ArmorItem): THREE.Object3D[] {
  const inner = parts.body.children[0];
  const style = armorStyle(item);
  const base = STYLE_COLOR[style];
  const trim = TRIM[item.rarity];
  const added: THREE.Object3D[] = [];
  const add = (parent: THREE.Object3D, ...objs: THREE.Object3D[]) => {
    parent.add(...objs);
    added.push(...objs);
  };

  // Chest piece over the shirt, belt, and shoulder pads on every armour.
  add(inner, voxelBox([0.54, 0.42, 0.34], base, [0, 0.95, 0]), voxelBox([0.55, 0.08, 0.35], trim, [0, 0.68, 0]));
  for (const arm of [parts.armL, parts.armR]) add(arm, voxelBox([0.26, 0.13, 0.28], style === 'leather' ? base : trim, [0, -0.03, 0]));

  if (style === 'chain' || style === 'plate') {
    // Helmet: cap plus cheek guards, leaving the face open.
    add(
      inner,
      voxelBox([0.47, 0.18, 0.47], base, [0, 1.56, 0]),
      voxelBox([0.05, 0.24, 0.32], base, [-0.235, 1.4, -0.05]),
      voxelBox([0.05, 0.24, 0.32], base, [0.235, 1.4, -0.05]),
    );
  }
  if (style === 'plate') add(inner, voxelBox([0.3, 0.08, 0.36], trim, [0, 1.06, 0.01]));
  if (item.rarity !== 'common') {
    // Cape in the rarity colour.
    add(inner, voxelBox([0.46, 0.66, 0.04], trim, [0, 0.8, -0.2]));
  }
  if (item.rarity === 'unique') add(inner, voxelBox([0.06, 0.14, 0.38], trim, [0, 1.71, 0]));
  return added;
}
