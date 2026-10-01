import * as THREE from 'three';
import { Actor } from './actor';
import { buildHumanoid, voxelBox, type HumanoidParts } from './voxelModel';
import type { TileGrid } from '../world/grid';
import { BASE_WEAPONS, type WeaponDef, type WeaponKind } from '../systems/weapons';
import type { AttackStats } from '../systems/damage';
import { Inventory, computeStats, type DerivedStats } from '../systems/inventory';
import { addXp, type Progress } from '../systems/progression';

export interface PlayerInput {
  /** Desired move direction on XZ (not necessarily normalized). */
  moveX: number;
  moveZ: number;
  /** World point the mouse is aiming at. */
  aimX: number;
  aimZ: number;
  attack: boolean;
  dodge: boolean;
  slam: boolean;
  volley: boolean;
  potion: boolean;
}

const SWING_TIME: Record<WeaponKind, number> = { sword: 0.26, spear: 0.3, bow: 0.3 };
const DODGE_TIME = 0.32;
const DODGE_SPEED = 13;
const DODGE_COOLDOWN = 1.1;
const HURT_IFRAMES = 0.35;
const SLAM_TIME = 0.42;
export const SLAM_COOLDOWN = 6;
export const VOLLEY_COOLDOWN = 8;
const POTION_COOLDOWN = 1;
const POTION_HEAL = 0.4;

/** Build the held-weapon mesh. Swords/spears go in the right hand, bows in the left. */
function buildWeaponMesh(kind: WeaponKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'sword') {
    g.add(voxelBox([0.07, 0.07, 0.85], 0xd7dde3, [0, -0.5, 0.5]), voxelBox([0.28, 0.08, 0.08], 0x8a6a2a, [0, -0.5, 0.1]));
  } else if (kind === 'spear') {
    g.add(voxelBox([0.06, 0.06, 1.7], 0x7a5530, [0, -0.5, 0.45]), voxelBox([0.12, 0.12, 0.3], 0xcfd6dd, [0, -0.5, 1.4]));
  } else {
    g.add(
      voxelBox([0.06, 0.06, 0.95], 0x8a5a2b, [0, -0.5, 0.06]),
      voxelBox([0.06, 0.12, 0.08], 0x8a5a2b, [0, -0.44, 0.5]),
      voxelBox([0.06, 0.12, 0.08], 0x8a5a2b, [0, -0.44, -0.38]),
      voxelBox([0.015, 0.015, 0.9], 0xeeeeee, [0, -0.38, 0.06]),
    );
  }
  return g;
}

export class Player extends Actor {
  readonly radius = 0.3;
  readonly model: HumanoidParts;
  inventory = new Inventory();
  progress: Progress = { level: 1, xp: 0 };
  stats: DerivedStats = computeStats(1, this.inventory);

  /** Single-frame flags consumed by the world. */
  strikeReady = false;
  slamReady = false;
  volleyReady = false;
  attackCooldown = 0;
  dodgeCooldown = 0;
  slamCooldown = 0;
  volleyCooldown = 0;
  potionCooldown = 0;
  readonly dodgeCooldownMax = DODGE_COOLDOWN;
  private swingTimer = 0;
  private struck = true;
  private dodgeTimer = 0;
  private readonly dodgeDir = { x: 0, z: 0 };
  private hurtTimer = 0;
  private slamTimer = 0;
  private walkPhase = 0;
  private deathTimer = 0;
  private heldWeapon: THREE.Group | null = null;
  private heldKind: WeaponKind | null = null;

  constructor() {
    super(100);
    this.model = buildHumanoid({ skin: 0xe0b48a, shirt: 0x2f7f8a, pants: 0x3b3550, hair: 0x4a2e1a, boots: 0x2a1f17 });
    this.refreshEquipment();
  }

  get object(): THREE.Object3D {
    return this.model.root;
  }

  get weapon(): WeaponDef {
    return BASE_WEAPONS[this.inventory.weapon.weapon];
  }

  get dodging(): boolean {
    return this.dodgeTimer > 0;
  }

  get invulnerable(): boolean {
    return this.dodgeTimer > 0 || this.hurtTimer > 0;
  }

  get attackStats(): AttackStats {
    return {
      base: this.stats.weaponDamage,
      power: this.stats.power,
      critChance: this.stats.critChance,
      critMultiplier: this.stats.critMultiplier,
    };
  }

  /** Start a brand-new run: fresh gear and level 1. */
  resetProgress(): void {
    this.inventory = new Inventory();
    this.progress = { level: 1, xp: 0 };
    this.refreshEquipment();
  }

  /** Recompute stats after gear or level changes, keeping the HP fraction. */
  refreshEquipment(): void {
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.stats = computeStats(this.progress.level, this.inventory);
    this.maxHp = this.stats.maxHp;
    this.hp = Math.min(this.maxHp, Math.max(1, Math.round(this.maxHp * ratio)));
    this.armor = this.stats.armor;
    const kind = this.inventory.weapon.weapon;
    if (kind !== this.heldKind) {
      if (this.heldWeapon) this.heldWeapon.removeFromParent();
      this.heldWeapon = buildWeaponMesh(kind);
      (kind === 'bow' ? this.model.armL : this.model.armR).add(this.heldWeapon);
      this.heldKind = kind;
    }
  }

  /** Returns levels gained. Level-ups fully heal. */
  gainXp(amount: number): number {
    const gained = addXp(this.progress, amount);
    if (gained > 0) {
      this.refreshEquipment();
      this.hp = this.maxHp;
    }
    return gained;
  }

  heal(amount: number): void {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Restore to full HP at (x, z) — used on floor load and restart. */
  respawn(x: number, z: number): void {
    this.refreshEquipment();
    this.hp = this.maxHp;
    this.alive = true;
    this.knock.x = this.knock.z = 0;
    this.swingTimer = this.dodgeTimer = this.hurtTimer = this.deathTimer = this.slamTimer = 0;
    this.attackCooldown = this.dodgeCooldown = this.slamCooldown = this.volleyCooldown = this.potionCooldown = 0;
    this.strikeReady = this.slamReady = this.volleyReady = false;
    this.struck = true;
    this.model.body.rotation.set(0, 0, 0);
    this.model.armR.position.z = 0;
    this.setPosition(x, z);
  }

  applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    const hit = super.applyDamage(amount, knockX, knockZ);
    if (hit) this.hurtTimer = HURT_IFRAMES;
    return hit;
  }

  update(dt: number, input: PlayerInput, grid: TileGrid): void {
    this.strikeReady = this.slamReady = this.volleyReady = false;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.slamCooldown = Math.max(0, this.slamCooldown - dt);
    this.volleyCooldown = Math.max(0, this.volleyCooldown - dt);
    this.potionCooldown = Math.max(0, this.potionCooldown - dt);
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

    if (input.potion && this.potionCooldown <= 0 && this.inventory.potions > 0 && this.hp < this.maxHp) {
      this.inventory.potions--;
      this.potionCooldown = POTION_COOLDOWN;
      this.heal(Math.round(this.maxHp * POTION_HEAL));
    }

    // Dodge roll: commit to a direction (movement, else aim), brief i-frames.
    if (input.dodge && this.dodgeCooldown <= 0 && this.dodgeTimer <= 0 && this.slamTimer <= 0) {
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

    const ax = input.aimX - this.pos.x;
    const az = input.aimZ - this.pos.z;
    if (ax * ax + az * az > 0.01) this.facing = Math.atan2(ax, az);

    // Abilities.
    if (input.slam && this.slamCooldown <= 0 && this.slamTimer <= 0) {
      this.slamCooldown = SLAM_COOLDOWN;
      this.slamTimer = SLAM_TIME;
      this.swingTimer = 0;
      this.struck = true;
    }
    if (input.volley && this.volleyCooldown <= 0) {
      this.volleyCooldown = VOLLEY_COOLDOWN;
      this.volleyReady = true;
    }

    // Slower while attacking, so attacks have weight.
    const busy = this.swingTimer > 0 || this.slamTimer > 0;
    const speed = this.stats.moveSpeed * (busy ? 0.45 : 1);
    if (moving) grid.moveBox(this.pos, mx * speed * dt, mz * speed * dt, this.radius);

    if (this.slamTimer > 0) {
      this.slamTimer = Math.max(0, this.slamTimer - dt);
      if (this.slamTimer === 0) this.slamReady = true;
    } else if (input.attack && this.attackCooldown <= 0) {
      this.attackCooldown = this.weapon.cooldown / this.stats.attackSpeed;
      this.swingTimer = SWING_TIME[this.weapon.kind];
      this.struck = false;
    }
    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const progress = 1 - this.swingTimer / SWING_TIME[this.weapon.kind];
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
    body.position.y = bodyBaseY + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0);
    armR.position.z = 0;
    body.rotation.y = 0;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8 - 0.3;

    if (this.slamTimer > 0) {
      // Leap and slam: arms overhead, body rises then crashes down.
      const p = 1 - this.slamTimer / SLAM_TIME;
      body.position.y = bodyBaseY + Math.sin(p * Math.PI) * 0.9;
      armL.rotation.x = armR.rotation.x = p < 0.7 ? -3 : -3 + 2.6 * ((p - 0.7) / 0.3);
      return;
    }
    if (this.swingTimer <= 0) {
      if (this.weapon.kind === 'bow') armL.rotation.x = -0.6;
      return;
    }

    const p = 1 - this.swingTimer / SWING_TIME[this.weapon.kind];
    switch (this.weapon.kind) {
      case 'sword': {
        // Overhead chop: raise fast, then slam down past the impact point.
        armR.rotation.x = p < 0.3 ? -2.5 * (p / 0.3) : -2.5 + 2.3 * Math.min(1, (p - 0.3) / 0.35);
        body.rotation.y = 0.35 * Math.sin(p * Math.PI);
        break;
      }
      case 'spear': {
        // Pull back, then jab forward.
        armR.rotation.x = -0.2;
        armR.position.z = p < 0.4 ? -0.25 * (p / 0.4) : -0.25 + 0.85 * Math.min(1, (p - 0.4) / 0.2);
        body.rotation.y = -0.25 * Math.sin(p * Math.PI);
        break;
      }
      case 'bow': {
        // Bow arm forward, string hand draws back, releases at impact.
        armL.rotation.x = -Math.PI / 2;
        armR.rotation.x = -Math.PI / 2;
        armR.position.z = p < this.weapon.impactAt ? -0.3 * (p / this.weapon.impactAt) : 0;
        break;
      }
    }
  }

  private syncTransform(): void {
    this.model.root.position.set(this.pos.x, 0, this.pos.z);
    this.model.root.rotation.y = this.facing;
  }
}
