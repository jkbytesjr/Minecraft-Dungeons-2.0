import * as THREE from 'three';
import type { TileGrid } from '../world/grid';
import type { AttackStats } from './damage';

export type ProjectileOwner = 'player' | 'enemy';

export interface ProjectileSpec {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  range: number;
  attack: AttackStats;
  knockback: number;
  owner: ProjectileOwner;
  /** Override the owner's default colour. */
  color?: number;
  /** Render as a chunky magic bolt instead of an arrow. */
  orb?: boolean;
  /** Player weapon shot: hits can trigger weapon powers. */
  proc?: boolean;
}

interface Projectile extends ProjectileSpec {
  life: number;
  alive: boolean;
}

/** Something a projectile can hit. */
export interface ProjectileTarget {
  pos: { x: number; z: number };
  radius: number;
  alive: boolean;
}

const MAX = 192;
const HEIGHT = 1.0;

/** Pooled arrows rendered with a single InstancedMesh. */
export class Projectiles {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: Projectile[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly orbScale = new THREE.Vector3(3.4, 3.4, 0.42);
  private readonly c = new THREE.Color();
  private readonly playerColor = new THREE.Color(0xf2e6c8);
  private readonly enemyColor = new THREE.Color(0xff5a3c);

  constructor() {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.65);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    // Allocate the colour buffer up front so the shader never recompiles.
    this.mesh.setColorAt(0, this.playerColor);
  }

  fire(spec: ProjectileSpec): void {
    if (this.list.length >= MAX) return;
    const len = Math.hypot(spec.dirX, spec.dirZ) || 1;
    this.list.push({ ...spec, dirX: spec.dirX / len, dirZ: spec.dirZ / len, life: spec.range / spec.speed, alive: true });
  }

  clear(): void {
    this.list.length = 0;
    this.mesh.count = 0;
  }

  /**
   * Advance all projectiles. `onHit` is called for the first target struck;
   * returning true consumes the projectile.
   */
  update(
    dt: number,
    grid: TileGrid,
    targetsFor: (owner: ProjectileOwner) => readonly ProjectileTarget[],
    onHit: (p: ProjectileSpec, target: ProjectileTarget) => boolean,
  ): void {
    for (const p of this.list) {
      // Sub-step so fast arrows can't skip past a target.
      const steps = Math.max(1, Math.ceil((p.speed * dt) / 0.3));
      for (let s = 0; s < steps && p.alive; s++) {
        p.x += (p.dirX * p.speed * dt) / steps;
        p.z += (p.dirZ * p.speed * dt) / steps;
        if (!grid.isWalkableAt(p.x, p.z)) {
          p.alive = false;
          break;
        }
        for (const t of targetsFor(p.owner)) {
          if (!t.alive) continue;
          const r = t.radius + 0.12;
          if ((t.pos.x - p.x) ** 2 + (t.pos.z - p.z) ** 2 < r * r && onHit(p, t)) {
            p.alive = false;
            break;
          }
        }
      }
      p.life -= dt;
      if (p.life <= 0) p.alive = false;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (!this.list[i].alive) this.list.splice(i, 1);

    this.list.forEach((p, i) => {
      this.q.setFromAxisAngle(this.up, Math.atan2(p.dirX, p.dirZ));
      this.m.compose(this.p.set(p.x, HEIGHT, p.z), this.q, p.orb ? this.orbScale : this.s);
      this.mesh.setMatrixAt(i, this.m);
      if (p.color !== undefined) this.mesh.setColorAt(i, this.c.setHex(p.color));
      else this.mesh.setColorAt(i, p.owner === 'player' ? this.playerColor : this.enemyColor);
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
