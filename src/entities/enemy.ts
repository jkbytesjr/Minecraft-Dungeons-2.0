import * as THREE from 'three';
import { Actor } from './actor';
import { HealthBar } from './healthBar';
import type { HumanoidParts } from './voxelModel';
import type { Player } from './player';
import type { TileGrid } from '../world/grid';
import type { FlowField } from '../systems/flowField';
import type { AttackStats } from '../systems/damage';
import type { Rng } from '../core/rng';
import type { ProjectileSpec } from '../systems/projectiles';
import type { EnemyKind } from '../world/dungeonGen';
import type { EventBus } from '../core/events';

export interface EnemyContext {
  player: Player;
  grid: TileGrid;
  flow: FlowField;
  rng: Rng;
  /** Resolve an enemy attack against the player. */
  hitPlayer(source: Enemy, attack: AttackStats, knockback: number): void;
  fireProjectile(spec: Omit<ProjectileSpec, 'owner'>): void;
  /** Area damage to the player (and, at half strength, other enemies). */
  explode(x: number, z: number, radius: number, base: number, source: Enemy): void;
  spawnEnemy(kind: EnemyKind, x: number, z: number): void;
  events: EventBus;
}

const DEATH_TIME = 0.7;

export abstract class Enemy extends Actor {
  abstract readonly kind: string;
  abstract readonly xp: number;
  readonly healthBar: HealthBar;
  /** World-space effects (ground telegraphs) that must not move or turn with the model. */
  readonly worldFx = new THREE.Group();
  protected readonly model: HumanoidParts;
  /** Multiplies outgoing damage; raised on deeper floors. */
  damageMult = 1;
  /** False for kills that should not reward XP/loot (e.g. self-detonation). */
  rewardsOnDeath = true;
  /** Set by the world once death has been announced. */
  deathReported = false;
  readonly isBoss: boolean = false;
  /** Weapon-power status effects; timed down here, applied by the world. */
  burnTime = 0;
  burnDps = 0;
  burnAcc = 0;
  chillTime = 0;
  /** Speed multiplier while chilled. */
  chillSlow = 1;
  freezeTime = 0;
  statusFxTimer = 0;
  protected walkPhase = 0;
  private deathTimer = 0;

  constructor(maxHp: number, model: HumanoidParts, barHeight: number) {
    super(maxHp);
    this.model = model;
    this.healthBar = new HealthBar(barHeight);
  }

  get object(): THREE.Object3D {
    return this.model.root;
  }

  scaleForDepth(depth: number): void {
    this.maxHp = Math.round(this.maxHp * (1 + 0.4 * depth));
    this.hp = this.maxHp;
    this.damageMult = 1 + 0.3 * depth;
  }

  /** True once the death animation has finished and it can be removed. */
  get removable(): boolean {
    return !this.alive && this.deathTimer >= DEATH_TIME;
  }

  update(dt: number, ctx: EnemyContext, camera: THREE.Camera): void {
    this.tickCommon(dt, ctx.grid);
    if (this.alive) {
      this.chillTime = Math.max(0, this.chillTime - dt);
      this.freezeTime = Math.max(0, this.freezeTime - dt);
      // Frozen enemies stop entirely; chilled ones move and attack in slow motion.
      const timeScale = this.freezeTime > 0 ? 0 : this.chillTime > 0 ? this.chillSlow : 1;
      if (timeScale > 0) this.think(dt * timeScale, ctx);
    } else {
      this.deathTimer += dt;
      const t = Math.min(1, this.deathTimer / (DEATH_TIME * 0.6));
      this.model.body.rotation.x = -(Math.PI / 2) * t;
      this.model.body.position.y = this.model.bodyBaseY * (1 - 0.6 * t);
      const sink = Math.max(0, (this.deathTimer - DEATH_TIME * 0.6) / (DEATH_TIME * 0.4));
      this.model.root.scale.setScalar(1 - 0.8 * sink);
    }
    this.model.root.position.set(this.pos.x, 0, this.pos.z);
    this.model.root.rotation.y = this.facing;
    this.healthBar.update(this.pos.x, this.pos.z, this.hp / this.maxHp, camera);
  }

  protected abstract think(dt: number, ctx: EnemyContext): void;

  protected distanceToPlayer(ctx: EnemyContext): number {
    return Math.hypot(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z);
  }

  protected angleToPlayer(ctx: EnemyContext): number {
    return Math.atan2(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z);
  }

  /** Is the player visible and within `range`? */
  protected canSeePlayer(ctx: EnemyContext, range: number): boolean {
    const p = ctx.player;
    return p.alive && this.distanceToPlayer(ctx) < range && ctx.grid.lineOfSight(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
  }

  /** Sidestep perpendicular to the player (kiting). */
  protected strafe(ctx: EnemyContext, dt: number, speed: number, dir: number): void {
    const a = this.angleToPlayer(ctx) + (Math.PI / 2) * dir;
    ctx.grid.moveBox(this.pos, Math.sin(a) * speed * dt, Math.cos(a) * speed * dt, this.radius);
  }

  /**
   * Step toward a goal: straight line if visible, otherwise follow the flow
   * field (which always points at the player).
   */
  protected moveToward(ctx: EnemyContext, dt: number, speed: number, away = false): boolean {
    const { player, grid, flow } = ctx;
    let tx = player.pos.x;
    let tz = player.pos.z;
    if (!away && !grid.lineOfSight(this.pos.x, this.pos.z, tx, tz)) {
      const step = flow.nextStep(this.pos.x, this.pos.z);
      if (!step) return false;
      tx = step.x;
      tz = step.z;
    }
    let dx = tx - this.pos.x;
    let dz = tz - this.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return false;
    dx /= len;
    dz /= len;
    if (away) {
      dx = -dx;
      dz = -dz;
    }
    grid.moveBox(this.pos, dx * speed * dt, dz * speed * dt, this.radius);
    this.turnToward(Math.atan2(dx, dz), 10, dt);
    return true;
  }

  protected animateWalk(dt: number, moving: boolean, rate = 10): void {
    const { legL, legR, armL, armR } = this.model;
    if (moving) this.walkPhase += dt * rate;
    else this.walkPhase *= Math.pow(0.001, dt);
    const s = Math.sin(this.walkPhase) * 0.6;
    legL.rotation.x = s;
    legR.rotation.x = -s;
    armL.rotation.x = -s * 0.7;
    armR.rotation.x = s * 0.7;
  }
}
