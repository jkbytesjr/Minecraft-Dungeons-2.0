import * as THREE from 'three';
import { Enemy, type EnemyContext } from './enemy';
import type { HumanoidParts } from './voxelModel';
import type { BossKind } from '../world/dungeonGen';

/** Shared red ground-warning material for boss attacks. */
export const telegraphMaterial = new THREE.MeshBasicMaterial({
  color: 0xff3020,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

/** Flat circle on the ground, radius 1 (scale it). */
export function groundCircle(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32), telegraphMaterial);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.visible = false;
  return m;
}

/**
 * End-of-floor boss. Sleeps until it sees the player (or is hit), then runs
 * its own fight logic. Below half HP it is "enraged" and subclasses escalate.
 */
export abstract class Boss extends Enemy {
  readonly kind = 'boss';
  readonly xp = 150;
  readonly isBoss = true;
  abstract readonly bossKind: BossKind;
  readonly name: string;
  engaged = false;
  /** Seconds in the current fight state. */
  protected stateTime = 0;
  /** Set when damaged while asleep; engage() runs on the next update (it needs ctx). */
  private wakePending = false;

  protected constructor(name: string, depth: number, maxHp: number, model: HumanoidParts, barHeight: number) {
    super(maxHp, model, barHeight);
    // Floors 5+ bring back earlier bosses.
    this.name = depth >= 4 ? `${name} Reborn` : name;
    this.knockbackTaken = 0.12;
  }

  get enraged(): boolean {
    return this.hp < this.maxHp / 2;
  }

  /** Speed multiplier for timings once enraged. */
  protected get pace(): number {
    return this.enraged ? 1.25 : 1;
  }

  protected think(dt: number, ctx: EnemyContext): void {
    this.stateTime += dt;
    if (!this.engaged) {
      this.animateWalk(dt, false);
      if (this.canSeePlayer(ctx, 11)) this.engage(ctx);
      return;
    }
    if (!ctx.player.alive) {
      this.hideTelegraphs();
      this.idle();
      this.animateWalk(dt, false);
      return;
    }
    this.fight(dt, ctx);
  }

  /** Per-tick fight logic once engaged and the player is alive. */
  protected abstract fight(dt: number, ctx: EnemyContext): void;

  /** Hide every attack warning (death, player death). */
  protected abstract hideTelegraphs(): void;

  /** Return to a neutral state while the player is dead. */
  protected abstract idle(): void;

  private engage(ctx: EnemyContext): void {
    if (this.engaged) return;
    this.engaged = true;
    this.stateTime = 0;
    ctx.events.emit('bossEngaged', { name: this.name });
  }

  applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    const hit = super.applyDamage(amount, knockX, knockZ);
    if (hit && !this.engaged) this.wakePending = true;
    if (!this.alive) this.hideTelegraphs();
    return hit;
  }

  update(dt: number, ctx: EnemyContext, camera: THREE.Camera): void {
    if (this.wakePending) {
      this.wakePending = false;
      this.engage(ctx);
    }
    super.update(dt, ctx, camera);
    // The overhead bar is replaced by the HUD boss bar.
    this.healthBar.group.visible = false;
  }

  /** Eyes on the head's front face. */
  protected addEyes(color: number): void {
    const eyeMat = new THREE.MeshBasicMaterial({ color });
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), eyeMat);
      eye.position.set(ex, 0.03, 0.22);
      eye.scale.divide(this.model.head.scale);
      eye.position.divide(this.model.head.scale);
      this.model.head.add(eye);
    }
  }

  /** Shoot a projectile from the boss toward `angle`. */
  protected shoot(ctx: EnemyContext, angle: number, o: { speed: number; range: number; base: number; color: number; orb?: boolean }): void {
    ctx.fireProjectile({
      x: this.pos.x + Math.sin(angle) * (this.radius + 0.2),
      z: this.pos.z + Math.cos(angle) * (this.radius + 0.2),
      dirX: Math.sin(angle),
      dirZ: Math.cos(angle),
      speed: o.speed,
      range: o.range,
      attack: { base: o.base, power: this.damageMult, critChance: 0, critMultiplier: 1 },
      knockback: 3,
      color: o.color,
      orb: o.orb,
    });
  }

  /** Spawn adds on open floor beside the boss. */
  protected summon(ctx: EnemyContext, kinds: ('grunt' | 'archer' | 'exploder')[]): void {
    kinds.forEach((kind, i) => {
      const a = this.facing + Math.PI / 2 + (i / kinds.length) * Math.PI * 2;
      const x = this.pos.x + Math.sin(a) * 1.8;
      const z = this.pos.z + Math.cos(a) * 1.8;
      if (ctx.grid.isWalkableAt(x, z)) ctx.spawnEnemy(kind, x, z);
    });
  }
}
