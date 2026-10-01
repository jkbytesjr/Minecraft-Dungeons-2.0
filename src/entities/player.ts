import type * as THREE from 'three';
import { Actor } from './actor';
import { buildHumanoid, voxelBox, type HumanoidParts } from './voxelModel';
import type { TileGrid } from '../world/grid';
import { BASE_WEAPONS, type WeaponDef } from '../systems/weapons';
import type { AttackStats } from '../systems/damage';

export interface PlayerInput {
  /** Desired move direction on XZ (not necessarily normalized). */
  moveX: number;
  moveZ: number;
  /** World point the mouse is aiming at. */
  aimX: number;
  aimZ: number;
  attack: boolean;
  dodge: boolean;
}

export interface PlayerStats {
  maxHp: number;
  power: number;
  critChance: number;
  critMultiplier: number;
  armor: number;
  moveSpeed: number;
}

const SWING_TIME = 0.26;
const DODGE_TIME = 0.32;
const DODGE_SPEED = 13;
const DODGE_COOLDOWN = 1.1;
const HURT_IFRAMES = 0.35;

export class Player extends Actor {
  readonly radius = 0.3;
  readonly model: HumanoidParts;
  readonly stats: PlayerStats = { maxHp: 100, power: 1, critChance: 0.1, critMultiplier: 1.75, armor: 0, moveSpeed: 5 };
  weapon: WeaponDef = BASE_WEAPONS.sword;

  /** Set for exactly one frame when a swing reaches its impact point. */
  strikeReady = false;
  attackCooldown = 0;
  dodgeCooldown = 0;
  readonly dodgeCooldownMax = DODGE_COOLDOWN;
  private swingTimer = 0;
  private struck = true;
  private dodgeTimer = 0;
  private readonly dodgeDir = { x: 0, z: 0 };
  private hurtTimer = 0;
  private walkPhase = 0;
  private deathTimer = 0;

  constructor() {
    super(100);
    this.model = buildHumanoid({ skin: 0xe0b48a, shirt: 0x2f7f8a, pants: 0x3b3550, hair: 0x4a2e1a, boots: 0x2a1f17 });
    // Sword held in the right hand, blade pointing forward when the arm hangs.
    this.model.armR.add(voxelBox([0.07, 0.07, 0.85], 0xd7dde3, [0, -0.5, 0.5]));
    this.model.armR.add(voxelBox([0.28, 0.08, 0.08], 0x8a6a2a, [0, -0.5, 0.1]));
  }

  get object(): THREE.Object3D {
    return this.model.root;
  }

  get dodging(): boolean {
    return this.dodgeTimer > 0;
  }

  get invulnerable(): boolean {
    return this.dodgeTimer > 0 || this.hurtTimer > 0;
  }

  get attackStats(): AttackStats {
    return {
      base: this.weapon.damage,
      power: this.stats.power,
      critChance: this.stats.critChance,
      critMultiplier: this.stats.critMultiplier,
    };
  }

  /** Restore to a fresh state at (x, z). */
  respawn(x: number, z: number): void {
    this.maxHp = this.stats.maxHp;
    this.hp = this.maxHp;
    this.alive = true;
    this.knock.x = this.knock.z = 0;
    this.swingTimer = this.dodgeTimer = this.hurtTimer = this.deathTimer = 0;
    this.attackCooldown = this.dodgeCooldown = 0;
    this.strikeReady = false;
    this.struck = true;
    this.model.body.rotation.set(0, 0, 0);
    this.setPosition(x, z);
  }

  applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    const hit = super.applyDamage(amount, knockX, knockZ);
    if (hit) this.hurtTimer = HURT_IFRAMES;
    return hit;
  }

  update(dt: number, input: PlayerInput, grid: TileGrid): void {
    this.strikeReady = false;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.tickCommon(dt, grid);

    if (!this.alive) {
      this.deathTimer = Math.min(1, this.deathTimer + dt * 2.5);
      this.model.body.rotation.x = -(Math.PI / 2) * this.deathTimer;
      this.model.body.position.y = this.model.bodyBaseY * (1 - 0.6 * this.deathTimer);
      this.syncTransform();
      return;
    }

    let mx = input.moveX;
    let mz = input.moveZ;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    if (moving) {
      mx /= len;
      mz /= len;
    }

    // Dodge roll: commit to a direction (movement, else aim), brief i-frames.
    if (input.dodge && this.dodgeCooldown <= 0 && this.dodgeTimer <= 0) {
      const ax = input.aimX - this.pos.x;
      const az = input.aimZ - this.pos.z;
      const al = Math.hypot(ax, az) || 1;
      this.dodgeDir.x = moving ? mx : ax / al;
      this.dodgeDir.z = moving ? mz : az / al;
      this.dodgeTimer = DODGE_TIME;
      this.dodgeCooldown = DODGE_COOLDOWN;
      this.swingTimer = 0;
      this.struck = true;
    }

    if (this.dodgeTimer > 0) {
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
      const speed = DODGE_SPEED * (0.5 + 0.5 * (this.dodgeTimer / DODGE_TIME));
      grid.moveBox(this.pos, this.dodgeDir.x * speed * dt, this.dodgeDir.z * speed * dt, this.radius);
      this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
      const t = 1 - this.dodgeTimer / DODGE_TIME;
      this.model.body.rotation.x = t * Math.PI * 2;
      this.model.body.position.y = this.model.bodyBaseY * (1 - 0.35 * Math.sin(t * Math.PI));
      this.syncTransform();
      return;
    }
    this.model.body.rotation.x = 0;

    // Slower while swinging, so attacks have weight.
    const speed = this.stats.moveSpeed * (this.swingTimer > 0 ? 0.45 : 1);
    if (moving) grid.moveBox(this.pos, mx * speed * dt, mz * speed * dt, this.radius);

    const ax = input.aimX - this.pos.x;
    const az = input.aimZ - this.pos.z;
    if (ax * ax + az * az > 0.01) this.facing = Math.atan2(ax, az);

    if (input.attack && this.attackCooldown <= 0) {
      this.attackCooldown = this.weapon.cooldown;
      this.swingTimer = SWING_TIME;
      this.struck = false;
    }
    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const progress = 1 - this.swingTimer / SWING_TIME;
      if (!this.struck && progress >= this.weapon.impactAt) {
        this.struck = true;
        this.strikeReady = true;
      }
    }

    this.animate(dt, moving);
    this.syncTransform();
  }

  private animate(dt: number, moving: boolean): void {
    const { legL, legR, armL, armR, body, bodyBaseY } = this.model;
    if (moving) this.walkPhase += dt * 11;
    else this.walkPhase *= Math.pow(0.001, dt);
    const swing = Math.sin(this.walkPhase) * 0.7;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    body.position.y = bodyBaseY + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0);

    if (this.swingTimer > 0) {
      // Overhead chop: raise fast, then slam down past the impact point.
      const p = 1 - this.swingTimer / SWING_TIME;
      const eased = p < 0.3 ? p / 0.3 : 1;
      const chop = p < 0.3 ? -2.5 * eased : -2.5 + 2.3 * Math.min(1, (p - 0.3) / 0.35);
      armR.rotation.x = chop;
      body.rotation.y = 0.35 * Math.sin(p * Math.PI);
    } else {
      armR.rotation.x = swing * 0.8 - 0.3;
      body.rotation.y = 0;
    }
  }

  private syncTransform(): void {
    this.model.root.position.set(this.pos.x, 0, this.pos.z);
    this.model.root.rotation.y = this.facing;
  }
}
