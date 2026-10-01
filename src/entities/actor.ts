import type * as THREE from 'three';
import type { TileGrid } from '../world/grid';
import { setFlash } from './voxelModel';

const FLASH_TIME = 0.09;

/** Shared state for anything that has HP, moves on the grid and can be knocked back. */
export abstract class Actor {
  readonly pos = { x: 0, z: 0 };
  /** Knockback velocity, decays quickly. */
  readonly knock = { x: 0, z: 0 };
  facing = 0;
  hp: number;
  maxHp: number;
  armor = 0;
  /** Multiplier on incoming knockback (bosses are heavy). */
  knockbackTaken = 1;
  alive = true;
  abstract readonly radius: number;
  private flashTimer = 0;

  constructor(maxHp: number) {
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  abstract get object(): THREE.Object3D;

  get invulnerable(): boolean {
    return false;
  }

  setPosition(x: number, z: number): void {
    this.pos.x = x;
    this.pos.z = z;
    this.object.position.set(x, 0, z);
  }

  /** Returns false if the hit was ignored (dead or invulnerable). */
  applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    if (!this.alive || this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.knock.x += knockX * this.knockbackTaken;
    this.knock.z += knockZ * this.knockbackTaken;
    this.flashTimer = FLASH_TIME;
    setFlash(this.object, true);
    if (this.hp <= 0) {
      this.alive = false;
      this.onDeath();
    }
    return true;
  }

  protected onDeath(): void {}

  /** Knockback + hit flash; call once per frame from subclasses. */
  protected tickCommon(dt: number, grid: TileGrid): void {
    if (Math.abs(this.knock.x) + Math.abs(this.knock.z) > 0.01) {
      grid.moveBox(this.pos, this.knock.x * dt, this.knock.z * dt, this.radius);
      const decay = Math.exp(-10 * dt);
      this.knock.x *= decay;
      this.knock.z *= decay;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) setFlash(this.object, false);
    }
  }

  /** Turn toward `target` angle at `rate` rad/s. */
  protected turnToward(target: number, rate: number, dt: number): void {
    let d = (target - this.facing) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    const step = rate * dt;
    this.facing += Math.abs(d) <= step ? d : Math.sign(d) * step;
  }
}
