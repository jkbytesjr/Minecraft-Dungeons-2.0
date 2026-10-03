import * as THREE from 'three';
import { compactModel, shade, voxelBox, type HumanoidParts } from './voxelModel';
import type { ArmorItem, Rarity, WeaponItem } from '../systems/loot';

/** Blade/tip colour per rarity, so better weapons read at a glance. */
const BLADE: Record<Rarity, number> = { common: 0xd7dde3, rare: 0x8fc4ff, unique: 0xffb347, mythic: 0xff4d6d, admin: 0x29ffe0 };
const TRIM: Record<Rarity, number> = { common: 0x5a4632, rare: 0x3a7bd5, unique: 0xffb02e, mythic: 0xd61f4a, admin: 0xffd23f };
const top = (r: Rarity) => r === 'unique' || r === 'mythic' || r === 'admin';

const glowMats = new Map<number, THREE.MeshBasicMaterial>();

/** Unlit box: reads as glowing, and stays separate when a model is merged. */
function glowBox(size: [number, number, number], color: number, pos: [number, number, number]): THREE.Mesh {
  let mat = glowMats.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color });
    glowMats.set(color, mat);
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  return mesh;
}

/** Held-weapon mesh. Swords/spears go in the right hand, bows in the left. */
export function buildWeaponMesh(item: WeaponItem): THREE.Group {
  const g = new THREE.Group();
  const r = item.rarity;
  const blade = BLADE[r];
  const trim = TRIM[r];
  const metal = r === 'common' ? 0x8a6a2a : trim;
  const y = -0.5;
  if (r === 'admin') return buildAdminWeapon(item, g, y);
  if (item.weapon === 'sword') {
    g.add(
      // Pommel, wrapped grip, crossguard with flared ends.
      voxelBox([0.09, 0.09, 0.09], metal, [0, y, -0.12]),
      voxelBox([0.06, 0.06, 0.16], 0x3a2418, [0, y, -0.02]),
      voxelBox([0.065, 0.065, 0.03], 0x5a3a1e, [0, y, -0.04]),
      voxelBox([0.3, 0.07, 0.07], metal, [0, y, 0.08]),
      voxelBox([0.06, 0.1, 0.07], metal, [-0.16, y + 0.02, 0.08]),
      voxelBox([0.06, 0.1, 0.07], metal, [0.16, y + 0.02, 0.08]),
      // Blade with a darker fuller down the middle and a tapered tip.
      voxelBox([0.1, 0.035, 0.74], blade, [0, y, 0.48]),
      voxelBox([0.03, 0.045, 0.6], shade(blade, 0.75), [0, y, 0.44]),
      voxelBox([0.06, 0.035, 0.1], blade, [0, y, 0.9]),
      voxelBox([0.025, 0.035, 0.06], blade, [0, y, 0.98]),
    );
    if (r === 'unique' || r === 'mythic') g.add(voxelBox([0.08, 0.08, 0.08], r === 'mythic' ? 0xffd0dc : 0xfff2b0, [0, y + 0.05, 0.08]));
    if (r === 'mythic') g.add(voxelBox([0.12, 0.05, 0.2], 0xd61f4a, [0, y, 0.2]));
  } else if (item.weapon === 'spear') {
    g.add(
      voxelBox([0.055, 0.055, 1.75], 0x7a5530, [0, y, 0.45]),
      voxelBox([0.07, 0.07, 0.06], 0x3a2418, [0, y, 0.05]),
      voxelBox([0.07, 0.07, 0.06], 0x3a2418, [0, y, 0.25]),
      voxelBox([0.08, 0.08, 0.08], metal, [0, y, -0.45]),
      // Socket, leaf-shaped head and point.
      voxelBox([0.08, 0.08, 0.12], metal, [0, y, 1.26]),
      voxelBox([0.16, 0.04, 0.22], blade, [0, y, 1.43]),
      voxelBox([0.1, 0.04, 0.12], blade, [0, y, 1.6]),
      voxelBox([0.04, 0.04, 0.08], blade, [0, y, 1.7]),
      // Tassel under the head.
      voxelBox([0.05, 0.14, 0.05], r === 'common' ? 0x8a2a2a : trim, [0, y - 0.1, 1.22]),
    );
  } else {
    const wood = r === 'mythic' ? 0x2a0f18 : r === 'unique' ? 0x5a2e1a : 0x8a5a2b;
    const tip = r === 'common' ? wood : trim;
    // Curved limbs built from angled segments, with a wrapped grip.
    g.add(
      voxelBox([0.07, 0.07, 0.2], 0x3a2418, [0, y, 0.06]),
      voxelBox([0.06, 0.06, 0.24], wood, [0, y, 0.27]).rotateX(-0.25),
      voxelBox([0.06, 0.06, 0.22], wood, [0, y + 0.08, 0.47]).rotateX(-0.55),
      voxelBox([0.06, 0.07, 0.08], tip, [0, y + 0.17, 0.58]),
      voxelBox([0.06, 0.06, 0.24], wood, [0, y, -0.15]).rotateX(0.25),
      voxelBox([0.06, 0.06, 0.22], wood, [0, y + 0.08, -0.35]).rotateX(0.55),
      voxelBox([0.06, 0.07, 0.08], tip, [0, y + 0.17, -0.46]),
      voxelBox([0.015, 0.015, 1.02], r === 'common' ? 0xeeeeee : blade, [0, y + 0.19, 0.06]),
    );
  }
  compactModel(g);
  return g;
}

/** Admin weapons: black and gold, with blades of solid light. */
function buildAdminWeapon(item: WeaponItem, g: THREE.Group, y: number): THREE.Group {
  const gold = TRIM.admin;
  const light = BLADE.admin;
  const solid = new THREE.Group();
  const glow: THREE.Mesh[] = [];
  if (item.weapon === 'sword') {
    // Triple sword: three blades of light fanning out from one wide guard.
    solid.add(
      voxelBox([0.1, 0.1, 0.1], gold, [0, y, -0.13]),
      voxelBox([0.065, 0.065, 0.16], 0x111114, [0, y, -0.02]),
      voxelBox([0.5, 0.08, 0.08], 0x111114, [0, y, 0.08]),
      voxelBox([0.08, 0.14, 0.1], gold, [-0.27, y + 0.03, 0.08]),
      voxelBox([0.08, 0.14, 0.1], gold, [0.27, y + 0.03, 0.08]),
      voxelBox([0.08, 0.1, 0.1], gold, [-0.13, y + 0.02, 0.09]),
      voxelBox([0.08, 0.1, 0.1], gold, [0.13, y + 0.02, 0.09]),
    );
    for (const [x, yaw, len] of [
      [0, 0, 0.86],
      [-0.15, 0.32, 0.72],
      [0.15, -0.32, 0.72],
    ] as const) {
      const bladeGroup = new THREE.Group();
      bladeGroup.position.set(x, y, 0.12);
      bladeGroup.rotation.y = yaw;
      bladeGroup.add(
        glowBox([0.11, 0.03, len], light, [0, 0, len / 2]),
        glowBox([0.035, 0.045, len - 0.06], 0xffffff, [0, 0, len / 2 - 0.02]),
        glowBox([0.06, 0.03, 0.09], light, [0, 0, len + 0.04]),
      );
      g.add(bladeGroup);
    }
    glow.push(glowBox([0.09, 0.09, 0.09], 0xffffff, [0, y + 0.06, 0.08]));
  } else if (item.weapon === 'spear') {
    solid.add(
      voxelBox([0.06, 0.06, 1.8], 0x111114, [0, y, 0.45]),
      voxelBox([0.08, 0.08, 0.06], gold, [0, y, 0.05]),
      voxelBox([0.08, 0.08, 0.06], gold, [0, y, 0.3]),
      voxelBox([0.1, 0.1, 0.12], gold, [0, y, 1.3]),
    );
    glow.push(glowBox([0.2, 0.035, 0.3], light, [0, y, 1.5]), glowBox([0.05, 0.05, 0.16], 0xffffff, [0, y, 1.72]));
  } else {
    solid.add(
      voxelBox([0.08, 0.08, 0.2], gold, [0, y, 0.06]),
      voxelBox([0.06, 0.06, 0.26], 0x111114, [0, y, 0.28]).rotateX(-0.25),
      voxelBox([0.06, 0.06, 0.24], 0x111114, [0, y + 0.09, 0.49]).rotateX(-0.55),
      voxelBox([0.06, 0.06, 0.26], 0x111114, [0, y, -0.16]).rotateX(0.25),
      voxelBox([0.06, 0.06, 0.24], 0x111114, [0, y + 0.09, -0.37]).rotateX(0.55),
    );
    glow.push(
      glowBox([0.07, 0.08, 0.09], light, [0, y + 0.19, 0.61]),
      glowBox([0.07, 0.08, 0.09], light, [0, y + 0.19, -0.49]),
      glowBox([0.02, 0.02, 1.08], 0xffffff, [0, y + 0.21, 0.06]),
    );
  }
  compactModel(solid);
  g.add(solid, ...glow);
  return g;
}

type ArmorStyle = 'leather' | 'scale' | 'chain' | 'plate' | 'admin';

const STYLE_COLOR: Record<ArmorStyle, number> = { leather: 0x7a4e2a, scale: 0x8a7a4a, chain: 0x9aa0a8, plate: 0xb8c0cc, admin: 0x16161c };

function armorStyle(item: ArmorItem): ArmorStyle {
  if (item.rarity === 'admin') return 'admin';
  if (top(item.rarity)) return 'plate';
  if (item.name.includes('Leather')) return 'leather';
  if (item.name.includes('Scale')) return 'scale';
  if (item.name.includes('Chain')) return 'chain';
  return 'plate';
}

export interface WornArmor {
  /** Everything added to the model, removed (with `removeArmor`) when the armour changes. */
  parts: THREE.Object3D[];
  /** Cape pivot (swung by the wearer's animation), if this armour has one. */
  cape: THREE.Group | null;
  /** Admin aura around the wearer's feet (animated by `animateAura`). */
  aura: THREE.Group | null;
}

const CYAN = 0x29ffe0;
const GOLD = 0xffd23f;

/** Draw a canvas texture once and keep it. */
const textures = new Map<string, THREE.CanvasTexture>();
function canvasTexture(key: string, size: [number, number], draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let tex = textures.get(key);
  if (!tex) {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = size;
    draw(canvas.getContext('2d')!, size[0], size[1]);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, tex);
  }
  return tex;
}

/** Soft round glow: bright centre fading to nothing. */
const glowTexture = () =>
  canvasTexture('glow', [128, 128], (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });

/** A ring of blocky runes between two thin circles. */
const runeTexture = () =>
  canvasTexture('runes', [256, 256], (c, w) => {
    const r = w / 2;
    c.translate(r, r);
    c.strokeStyle = '#fff';
    c.fillStyle = '#fff';
    c.lineWidth = 3;
    for (const rad of [r * 0.97, r * 0.72]) {
      c.beginPath();
      c.arc(0, 0, rad, 0, Math.PI * 2);
      c.stroke();
    }
    // Pseudo-random but fixed glyphs, each a few strokes on a 3x3 grid.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 16;
    for (let i = 0; i < n; i++) {
      c.save();
      c.rotate((i / n) * Math.PI * 2);
      c.translate(0, -r * 0.845);
      const s = r * 0.055;
      c.beginPath();
      for (let k = 0; k < 3; k++) {
        const x1 = Math.floor(rand() * 3) - 1;
        const y1 = Math.floor(rand() * 3) - 1;
        const x2 = Math.floor(rand() * 3) - 1;
        const y2 = Math.floor(rand() * 3) - 1;
        c.moveTo(x1 * s, y1 * s);
        c.lineTo(x2 * s, y2 * s);
      }
      c.stroke();
      c.restore();
    }
  });

/** Vertical fade with faint streaks, for the light column (bright at the bottom, gone at the top). */
const columnTexture = () =>
  canvasTexture('column', [128, 128], (c, w, h) => {
    const g = c.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    // Streaks: vary the strength across the width.
    for (let x = 0; x < w; x++) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.21) * Math.sin(x * 0.07 + 1));
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.fillRect(x, 0, 1, h);
    }
  });

const auraMats = new Map<string, THREE.MeshBasicMaterial>();
function auraMat(key: string, color: number, opacity: number, map?: THREE.Texture): THREE.MeshBasicMaterial {
  let m = auraMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      ...(map ? { map } : {}),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    auraMats.set(key, m);
  }
  return m;
}

/**
 * A one-off rune circle flash on the floor (admin Q/E). Each gets its own
 * material so it can fade on its own; the caller grows and fades it.
 */
export function buildRuneBurst(color = CYAN, glow = false): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: glow ? glowTexture() : runeTexture(),
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(runeBurstGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  return mesh;
}
const runeBurstGeo = new THREE.PlaneGeometry(2, 2);

const SPARKS = 18;
const SHOCKWAVE_PERIOD = 1.8;

interface AuraParts {
  glow: THREE.Mesh;
  runes: THREE.Mesh;
  hexA: THREE.Mesh;
  hexB: THREE.Mesh;
  waves: THREE.Mesh[];
  column: THREE.Mesh;
  sparks: THREE.InstancedMesh;
  crystals: THREE.Group;
  halo: THREE.Group;
}

const flat = (mesh: THREE.Mesh, y: number) => {
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
};

/**
 * Admin aura, in layers: a soft glow pooled on the floor, a turning ring of
 * runes and two counter-rotating gold hexagons, shockwaves pulsing outward, a
 * column of light that fades out as it rises, sparks spiralling up in a double
 * helix, three orbiting crystals and a gold halo over the crown. It hangs off
 * the model root, so it stays upright through rolls, and hit flashes skip it.
 */
function buildAura(): THREE.Group {
  const aura = new THREE.Group();
  const glow = flat(new THREE.Mesh(new THREE.PlaneGeometry(3, 3), auraMat('glow', CYAN, 0.55, glowTexture())), 0.02);
  const runes = flat(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), auraMat('runes', CYAN, 0.9, runeTexture())), 0.03);
  const hexA = flat(new THREE.Mesh(new THREE.RingGeometry(0.4, 0.45, 6), auraMat('gold', GOLD, 0.8)), 0.035);
  const hexB = flat(new THREE.Mesh(new THREE.RingGeometry(0.4, 0.45, 6), auraMat('gold', GOLD, 0.8)), 0.036);
  hexB.rotation.z = Math.PI / 6;
  const waves = [0, 1].map((i) => flat(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), auraMat(`wave${i}`, CYAN, 0.6)), 0.04));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, 2.6, 32, 1, true), auraMat('column', CYAN, 0.35, columnTexture()));
  column.position.y = 1.3;

  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), auraMat('spark', 0xffffff, 1), SPARKS);
  for (let i = 0; i < SPARKS; i++) sparks.setColorAt(i, new THREE.Color(i % 3 === 0 ? GOLD : CYAN));
  sparks.frustumCulled = false;

  const crystals = new THREE.Group();
  crystals.position.y = 1.0;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), auraMat('crystal', CYAN, 0.95));
    crystal.scale.set(1, 1.8, 1);
    crystal.position.set(Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85);
    crystals.add(crystal);
  }

  const halo = new THREE.Group();
  halo.position.y = 2.08;
  halo.add(flat(new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 32), auraMat('halo', GOLD, 0.95)), 0));
  halo.add(flat(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), auraMat('haloGlow', GOLD, 0.35, glowTexture())), -0.01));

  aura.add(glow, runes, hexA, hexB, ...waves, column, sparks, crystals, halo);
  aura.userData.parts = { glow, runes, hexA, hexB, waves, column, sparks, crystals, halo } satisfies AuraParts;
  aura.traverse((o) => (o.userData.noFlash = true));
  return aura;
}

const sparkMatrix = new THREE.Matrix4();
const sparkPos = new THREE.Vector3();
const sparkQuat = new THREE.Quaternion();
const sparkScale = new THREE.Vector3();
const sparkEuler = new THREE.Euler();

/** Animate every layer of the aura from a running clock (seconds). */
export function animateAura(aura: THREE.Group, time: number): void {
  const p = aura.userData.parts as AuraParts;
  // The aura hangs off the root, which turns with the hero: cancel that so the effects spin on their own.
  const parentYaw = aura.parent?.rotation.y ?? 0;
  aura.rotation.y = -parentYaw;

  const pulse = 1 + Math.sin(time * 2.4) * 0.06;
  p.glow.scale.setScalar(pulse);
  (p.glow.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(time * 2.4) * 0.1;
  p.runes.rotation.z = time * 0.35;
  p.hexA.rotation.z = -time * 0.9;
  p.hexB.rotation.z = Math.PI / 6 + time * 0.6;
  p.waves.forEach((w, i) => {
    const t = ((time / SHOCKWAVE_PERIOD + i * 0.5) % 1 + 1) % 1;
    w.scale.setScalar(0.35 + t * 1.15);
    (w.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t) * (1 - t);
  });
  p.column.rotation.y = time * 0.25;
  p.column.scale.set(pulse, 1, pulse);

  // Two strands of sparks spiralling upward, shrinking away as they near the top.
  for (let i = 0; i < SPARKS; i++) {
    const strand = i % 2;
    const t = (time * 0.32 + i / SPARKS) % 1;
    const a = t * Math.PI * 4 + strand * Math.PI + time * 0.8;
    const r = 0.62 - t * 0.2;
    sparkPos.set(Math.sin(a) * r, 0.1 + t * 2.3, Math.cos(a) * r);
    sparkQuat.setFromEuler(sparkEuler.set(time * 3 + i, time * 2, 0));
    sparkScale.setScalar(Math.sin(t * Math.PI) * 1.4 + 0.05);
    p.sparks.setMatrixAt(i, sparkMatrix.compose(sparkPos, sparkQuat, sparkScale));
  }
  p.sparks.instanceMatrix.needsUpdate = true;

  p.crystals.rotation.y = time * 0.7;
  p.crystals.children.forEach((c, i) => {
    c.position.y = Math.sin(time * 1.6 + i * 2.1) * 0.18;
    c.rotation.y = time * 2.5;
  });
  p.halo.position.y = 2.08 + Math.sin(time * 1.8) * 0.04;
  p.halo.rotation.y = time * 0.5;
}

/**
 * Attach armour to a humanoid. Each piece rides on the body part it covers
 * (helmet on the head, greaves on the shins, pauldrons on the shoulders) so
 * nothing slides through it when the head bobs or limbs swing, and every
 * shell sits a little outside the surface beneath it so faces never fight.
 * Pieces are merged per body part, so a full suit costs a few draw calls.
 */
export function attachArmor(parts: HumanoidParts, item: ArmorItem): WornArmor {
  const inner = parts.body.children[0];
  const style = armorStyle(item);
  const base = STYLE_COLOR[style];
  const trim = TRIM[item.rarity];
  const heavy = style === 'chain' || style === 'plate' || style === 'admin';
  const added: THREE.Object3D[] = [];

  /** A group on `parent` collecting pieces; merged and attached at the end. */
  const groups: [THREE.Object3D, THREE.Group][] = [];
  const on = (parent: THREE.Object3D): THREE.Group => {
    let entry = groups.find(([p]) => p === parent);
    if (!entry) {
      const g = new THREE.Group();
      // Head pieces are given in body units: undo the head cube's scale.
      if (parent === parts.head) g.scale.set(1 / parts.head.scale.x, 1 / parts.head.scale.y, 1 / parts.head.scale.z);
      entry = [parent, g];
      groups.push(entry);
    }
    return entry[1];
  };

  // Torso shell (clears the shirt, scarf and strap), and a belt over it.
  const chest = on(inner);
  chest.add(voxelBox([0.58, 0.43, 0.42], base, [0, 0.935, 0]), voxelBox([0.6, 0.09, 0.44], trim, [0, 0.68, 0]));
  if (style === 'leather') {
    // Laced front and a shoulder strap.
    chest.add(voxelBox([0.04, 0.3, 0.02], shade(base, 0.6), [0, 0.96, 0.22]));
  } else if (style === 'scale') {
    for (const yy of [0.82, 0.93, 1.04]) chest.add(voxelBox([0.5, 0.025, 0.02], shade(base, 0.7), [0, yy, 0.22]));
  } else {
    // Gorget around the neck.
    chest.add(voxelBox([0.36, 0.07, 0.44], heavy ? shade(base, 0.85) : base, [0, 1.12, 0]));
  }
  if (top(item.rarity)) chest.add(voxelBox([0.14, 0.14, 0.02], trim, [0, 0.98, 0.22]));
  if (item.rarity === 'mythic') chest.add(voxelBox([0.24, 0.26, 0.02], 0x3a0f1c, [0, 0.93, 0.225]), voxelBox([0.1, 0.1, 0.02], 0xffd0dc, [0, 0.98, 0.24]));

  // Shoulder pads ride on the arms; heavier armour adds a second plate and bracers.
  for (const arm of [parts.armL, parts.armR]) {
    const a = on(arm);
    a.add(voxelBox([0.28, 0.15, 0.3], style === 'leather' ? base : trim, [0, -0.04, 0]));
    if (heavy) a.add(voxelBox([0.31, 0.06, 0.33], base, [0, 0.055, 0]), voxelBox([0.22, 0.1, 0.24], base, [0, -0.32, 0]));
  }
  // Greaves on the shins for heavy armour.
  if (heavy) for (const leg of [parts.legL, parts.legR]) on(leg).add(voxelBox([0.25, 0.22, 0.28], base, [0, -0.22, 0.005]));

  // Helmet on the head itself, sized to enclose the hair, face left open.
  if (heavy) {
    const h = on(parts.head);
    h.add(
      voxelBox([0.52, 0.16, 0.52], base, [0, 0.22, -0.01]),
      voxelBox([0.05, 0.26, 0.38], base, [-0.255, 0.02, -0.05]),
      voxelBox([0.05, 0.26, 0.38], base, [0.255, 0.02, -0.05]),
      voxelBox([0.5, 0.3, 0.05], base, [0, 0.02, -0.255]),
    );
    if (style !== 'chain') h.add(voxelBox([0.04, 0.16, 0.03], base, [0, 0.03, 0.265]));
    if (item.rarity === 'unique' || item.rarity === 'mythic') h.add(voxelBox([0.06, 0.14, 0.42], trim, [0, 0.36, -0.02]));
    if (item.rarity === 'mythic') h.add(voxelBox([0.07, 0.22, 0.07], 0xffd0dc, [-0.2, 0.38, 0.05]), voxelBox([0.07, 0.22, 0.07], 0xffd0dc, [0.2, 0.38, 0.05]));
  } else {
    // Hood: crown, sides and back, face left open.
    on(parts.head).add(
      voxelBox([0.5, 0.12, 0.5], base, [0, 0.24, -0.01]),
      voxelBox([0.05, 0.3, 0.36], base, [-0.25, 0.04, -0.06]),
      voxelBox([0.05, 0.3, 0.36], base, [0.25, 0.04, -0.06]),
      voxelBox([0.48, 0.42, 0.05], base, [0, 0.0, -0.25]),
    );
  }
  // Every suit covers the head, so hair (mohawks, ponytails) is hidden rather than poking through.
  if (parts.hair) parts.hair.visible = false;

  // Admin regalia: a gold crown and glowing seams.
  const glow: [THREE.Object3D, THREE.Mesh][] = [];
  if (style === 'admin') {
    const h = on(parts.head);
    for (const x of [-0.2, 0, 0.2]) h.add(voxelBox([0.08, x === 0 ? 0.2 : 0.14, 0.08], trim, [x, x === 0 ? 0.39 : 0.36, 0.18]));
    h.add(voxelBox([0.54, 0.06, 0.54], trim, [0, 0.31, -0.01]));
    glow.push(
      [parts.head, glowBox([0.36, 0.04, 0.03], BLADE.admin, [0, 0.07, 0.27])],
      [inner, glowBox([0.04, 0.34, 0.02], BLADE.admin, [0, 0.93, 0.225])],
      [inner, glowBox([0.44, 0.03, 0.02], BLADE.admin, [0, 1.04, 0.225])],
    );
  }

  for (const [parent, g] of groups) {
    compactModel(g);
    parent.add(g);
    added.push(g);
  }
  for (const [parent, mesh] of glow) {
    if (parent === parts.head) {
      mesh.scale.divide(parts.head.scale);
      mesh.position.divide(parts.head.scale);
    }
    parent.add(mesh);
    added.push(mesh);
  }

  // Cape on a pivot at the shoulders, so it can swing clear of the legs.
  let cape: THREE.Group | null = null;
  if (item.rarity !== 'common') {
    cape = new THREE.Group();
    cape.position.set(0, 1.13, -0.235);
    cape.rotation.x = 0.12;
    const cloth = style === 'admin' ? 0x0c0c10 : trim;
    cape.add(voxelBox([0.48, 0.7, 0.035], cloth, [0, -0.35, 0]));
    if (style === 'admin') cape.add(voxelBox([0.5, 0.05, 0.04], trim, [0, -0.68, 0]));
    compactModel(cape);
    inner.add(cape);
    added.push(cape);
  }
  let aura: THREE.Group | null = null;
  if (style === 'admin') {
    aura = buildAura();
    parts.root.add(aura);
    added.push(aura);
  }
  return { parts: added, cape, aura };
}

/**
 * Swing a cape: it trails back with forward speed and sways with the stride,
 * so the legs never cut through it.
 */
export function animateCape(cape: THREE.Group, speed01: number, walkPhase: number, time: number): void {
  const target = 0.12 + 0.55 * speed01 + Math.sin(walkPhase * 2) * 0.06 * speed01 + Math.sin(time * 1.7) * 0.03;
  cape.rotation.x += (target - cape.rotation.x) * 0.2;
  cape.rotation.z = Math.sin(walkPhase) * 0.05 * speed01;
}

/** Take armour back off, showing the hair again. */
export function removeArmor(parts: HumanoidParts, worn: WornArmor): void {
  for (const o of worn.parts) o.removeFromParent();
  if (parts.hair) parts.hair.visible = true;
}
