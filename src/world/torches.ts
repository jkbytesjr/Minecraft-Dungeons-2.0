import * as THREE from 'three';
import type { TorchSpot } from './level';
import type { GlowSpot } from './voxelBuilder';
import type { Atmosphere } from './biomes';

/** Max simultaneous warm torch lights and coloured magic lights. Fixed counts avoid shader recompiles. */
const TORCH_LIGHTS = 6;
const MAGIC_LIGHTS = 4;
const REASSIGN_INTERVAL = 0.2;

/** Which way the wall is from a torch spot (spots sit 0.6 out from the wall's centre). */
function wallDir(s: TorchSpot): { x: number; z: number } {
  const ox = s.x - (Math.floor(s.x) + 0.5);
  const oz = s.z - (Math.floor(s.z) + 0.5);
  return { x: Math.abs(ox) > 0.2 ? Math.sign(ox) : 0, z: Math.abs(oz) > 0.2 ? Math.sign(oz) : 0 };
}

/** Assign a small pool of lights to the spots nearest the player. */
class LightPool {
  readonly lights: THREE.PointLight[] = [];
  private readonly assigned: number[] = [];
  private timer = 0;

  constructor(
    group: THREE.Group,
    private readonly spots: { x: number; y: number; z: number; color?: number }[],
    count: number,
    color: number,
    distance: number,
    private readonly lift: number,
  ) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(color, 0, distance, 1.6);
      this.lights.push(light);
      this.assigned.push(-1);
      group.add(light);
    }
  }

  /** Returns the spot index each light is on (-1 for none). */
  update(dt: number, focus: THREE.Vector3): number[] {
    this.timer -= dt;
    if (this.timer > 0) return this.assigned;
    this.timer = REASSIGN_INTERVAL;
    const order = this.spots
      .map((s, i) => ({ i, d: (s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    this.lights.forEach((light, i) => {
      const pick = order[i];
      this.assigned[i] = pick ? pick.i : -1;
      if (!pick) return;
      const s = this.spots[pick.i];
      light.position.set(s.x, s.y + this.lift, s.z);
      if (s.color !== undefined) light.color.setHex(s.color);
    });
    return this.assigned;
  }
}

/** Soft radial gradient for glow halos. */
function haloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Wall sconces with flickering flames and warm lights, coloured magic lights
 * at crystals / runes / water, and soft glow halos around every light source
 * (camera-facing quads, a cheap stand-in for volumetric glow).
 */
export class Torches {
  readonly group = new THREE.Group();
  private readonly flames: THREE.InstancedMesh;
  private readonly torchPool: LightPool;
  private readonly magicPool: LightPool;
  private readonly halos: THREE.InstancedMesh;
  private readonly haloSpots: { x: number; y: number; z: number; size: number; torch: number }[] = [];
  private readonly lastQuat = new THREE.Quaternion(0, 0, 0, 0);
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor(
    private readonly spots: TorchSpot[],
    private readonly atmo: Pick<Atmosphere, 'torchIntensity' | 'torchColor' | 'magicIntensity' | 'haloOpacity'>,
    glowSpots: GlowSpot[] = [],
  ) {
    const n = Math.max(1, spots.length);
    // Iron sconce: back plate, bracket and cup.
    const iron = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x2c2c32 }), n * 3);
    const flameGeo = new THREE.BoxGeometry(0.18, 0.24, 0.18);
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(atmo.torchColor).lerp(new THREE.Color(0xffe0a0), 0.3).multiplyScalar(2.8), fog: false });
    this.flames = new THREE.InstancedMesh(flameGeo, flameMat, n * 2);
    let k = 0;
    spots.forEach((s) => {
      const w = wallDir(s);
      const bx = s.x + w.x * 0.32;
      const bz = s.z + w.z * 0.32;
      iron.setMatrixAt(k++, this.m.compose(this.p.set(bx, s.y - 0.2, bz), this.q.identity(), this.s.set(w.x ? 0.04 : 0.2, 0.36, w.z ? 0.04 : 0.2)));
      iron.setMatrixAt(k++, this.m.compose(this.p.set(s.x + w.x * 0.16, s.y - 0.28, s.z + w.z * 0.16), this.q, this.s.set(w.x ? 0.32 : 0.06, 0.06, w.z ? 0.32 : 0.06)));
      iron.setMatrixAt(k++, this.m.compose(this.p.set(s.x, s.y - 0.18, s.z), this.q, this.s.set(0.2, 0.14, 0.2)));
    });
    iron.count = spots.length * 3;
    iron.castShadow = true;
    iron.computeBoundingSphere();
    this.flames.count = spots.length * 2;
    this.updateFlames();
    this.flames.computeBoundingSphere();
    this.group.add(iron, this.flames);

    this.torchPool = new LightPool(this.group, spots, TORCH_LIGHTS, atmo.torchColor, 10, 0.2);
    this.magicPool = new LightPool(this.group, glowSpots, MAGIC_LIGHTS, 0xffffff, 7, 0.3);

    for (const s of spots) this.haloSpots.push({ x: s.x, y: s.y + 0.05, z: s.z, size: 1.6, torch: 1 });
    for (const g of glowSpots) if (g.halo > 0) this.haloSpots.push({ x: g.x, y: g.y, z: g.z, size: g.halo, torch: 0 });
    this.halos = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: atmo.haloOpacity }),
      Math.max(1, this.haloSpots.length),
    );
    const c = new THREE.Color();
    const torchCol = new THREE.Color(atmo.torchColor).multiplyScalar(0.7);
    let gi = 0;
    this.haloSpots.forEach((h, i) => {
      if (h.torch) this.halos.setColorAt(i, torchCol);
      else {
        while (gi < glowSpots.length && glowSpots[gi].halo <= 0) gi++;
        this.halos.setColorAt(i, c.setHex(glowSpots[gi++].color).multiplyScalar(0.6));
      }
    });
    this.halos.count = this.haloSpots.length;
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 2;
    this.group.add(this.halos);
  }

  update(dt: number, focus: THREE.Vector3, camera?: THREE.Camera): void {
    this.time += dt;
    const torchIdx = this.torchPool.update(dt, focus);
    this.torchPool.lights.forEach((light, i) => {
      const idx = torchIdx[i];
      light.intensity = idx < 0 ? 0 : this.atmo.torchIntensity * (0.85 + 0.15 * Math.sin(this.time * 11 + idx * 3.1) * Math.sin(this.time * 7.3 + idx));
    });
    const magicIdx = this.magicPool.update(dt, focus);
    this.magicPool.lights.forEach((light, i) => {
      const idx = magicIdx[i];
      light.intensity = idx < 0 ? 0 : this.atmo.magicIntensity * (0.8 + 0.2 * Math.sin(this.time * 2 + idx));
    });
    this.updateFlames();
    if (camera && !camera.quaternion.equals(this.lastQuat)) {
      // Halos face the camera; only rebuilt when the view turns (the title screen orbit).
      this.lastQuat.copy(camera.quaternion);
      this.haloSpots.forEach((h, i) => this.halos.setMatrixAt(i, this.m.compose(this.p.set(h.x, h.y, h.z), camera.quaternion, this.s.setScalar(h.size))));
      this.halos.instanceMatrix.needsUpdate = true;
    }
  }

  /** Two flickering flame blocks per sconce: an outer flame and a hot inner core. */
  private updateFlames(): void {
    this.spots.forEach((s, i) => {
      const f = Math.sin(this.time * 13 + i * 1.7) * 0.5 + Math.sin(this.time * 7.1 + i) * 0.5;
      this.flames.setMatrixAt(i * 2, this.m.compose(this.p.set(s.x, s.y + 0.02 + f * 0.02, s.z), this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.time * 2 + i), this.s.set(1 + f * 0.12, 1 + f * 0.25, 1 + f * 0.12)));
      this.flames.setMatrixAt(i * 2 + 1, this.m.compose(this.p.set(s.x, s.y + 0.14 + f * 0.04, s.z), this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -this.time * 3 + i), this.s.set(0.5, 0.7 + f * 0.3, 0.5)));
    });
    this.flames.instanceMatrix.needsUpdate = true;
  }
}
