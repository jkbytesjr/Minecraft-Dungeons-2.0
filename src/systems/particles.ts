import * as THREE from 'three';

const MAX_PARTICLES = 800;
const GRAVITY = 18;

export interface BurstOptions {
  count: number;
  color: number;
  /** Optional second color; each particle picks one of the two at random. */
  color2?: number;
  /** Horizontal speed range. */
  speed?: [number, number];
  /** Upward speed range. */
  up?: [number, number];
  size?: [number, number];
  life?: [number, number];
  /** 1 = normal gravity, 0 = floats, negative rises. */
  gravity?: number;
  /** Spawn jitter radius around the origin. */
  spread?: number;
}

/** Pooled voxel debris. Every particle is a cube in one InstancedMesh (one draw call). */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(MAX_PARTICLES);
  private readonly py = new Float32Array(MAX_PARTICLES);
  private readonly pz = new Float32Array(MAX_PARTICLES);
  private readonly vx = new Float32Array(MAX_PARTICLES);
  private readonly vy = new Float32Array(MAX_PARTICLES);
  private readonly vz = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly grav = new Float32Array(MAX_PARTICLES);
  private readonly spin = new Float32Array(MAX_PARTICLES);
  private readonly colors = new Uint32Array(MAX_PARTICLES);
  private live = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    // Particles roam the whole level; skip per-frame bounds work.
    this.mesh.frustumCulled = false;
  }

  get count(): number {
    return this.live;
  }

  burst(x: number, y: number, z: number, o: BurstOptions): void {
    const [s0, s1] = o.speed ?? [1, 4];
    const [u0, u1] = o.up ?? [2, 5];
    const [z0, z1] = o.size ?? [0.06, 0.14];
    const [l0, l1] = o.life ?? [0.4, 0.8];
    const spread = o.spread ?? 0.15;
    for (let n = 0; n < o.count; n++) {
      // When full, overwrite a random slot rather than dropping the burst.
      const i = this.live < MAX_PARTICLES ? this.live++ : Math.floor(Math.random() * MAX_PARTICLES);
      const a = Math.random() * Math.PI * 2;
      const sp = s0 + Math.random() * (s1 - s0);
      this.px[i] = x + (Math.random() - 0.5) * 2 * spread;
      this.py[i] = y + (Math.random() - 0.5) * spread;
      this.pz[i] = z + (Math.random() - 0.5) * 2 * spread;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = u0 + Math.random() * (u1 - u0);
      this.maxLife[i] = this.life[i] = l0 + Math.random() * (l1 - l0);
      this.size[i] = z0 + Math.random() * (z1 - z0);
      this.grav[i] = o.gravity ?? 1;
      this.spin[i] = (Math.random() - 0.5) * 12;
      this.colors[i] = o.color2 !== undefined && Math.random() < 0.5 ? o.color2 : o.color;
    }
  }

  /** Flat expanding ring of debris (slams, explosions). */
  ring(x: number, z: number, radius: number, color: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2;
      this.burst(x + Math.cos(a) * radius * 0.3, 0.15, z + Math.sin(a) * radius * 0.3, {
        count: 1,
        color,
        speed: [radius * 2.2, radius * 2.8],
        up: [1, 3],
        life: [0.3, 0.5],
        size: [0.1, 0.2],
      });
      // burst() picks a random direction; point it outward instead.
      const i = this.live - 1;
      const sp = Math.hypot(this.vx[i], this.vz[i]);
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
    }
  }

  clear(): void {
    this.live = 0;
    this.mesh.count = 0;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.live) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.swapRemove(i);
        continue;
      }
      this.vy[i] -= GRAVITY * this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.size[i] / 2 && this.vy[i] < 0) {
        // Bounce and skid on the floor.
        this.py[i] = this.size[i] / 2;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
      }
      i++;
    }

    for (let k = 0; k < this.live; k++) {
      const t = this.life[k] / this.maxLife[k];
      // Hold full size, then shrink away over the last 40% of life.
      const sc = this.size[k] * Math.min(1, t / 0.4);
      const r = this.spin[k] * (1 - t);
      this.e.set(r, r * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(this.px[k], this.py[k], this.pz[k]), this.q, this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(k, this.m);
      this.mesh.setColorAt(k, this.c.set(this.colors[k]));
    }
    this.mesh.count = this.live;
    if (this.live > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  private swapRemove(i: number): void {
    const j = --this.live;
    if (i === j) return;
    this.px[i] = this.px[j];
    this.py[i] = this.py[j];
    this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.vz[i] = this.vz[j];
    this.life[i] = this.life[j];
    this.maxLife[i] = this.maxLife[j];
    this.size[i] = this.size[j];
    this.grav[i] = this.grav[j];
    this.spin[i] = this.spin[j];
    this.colors[i] = this.colors[j];
  }
}
