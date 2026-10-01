import * as THREE from 'three';
import { Enemy, type EnemyContext } from './enemy';
import { buildHumanoid, voxelBox } from './voxelModel';

type State = 'dormant' | 'walk' | 'slamWindup' | 'slam' | 'chargeWindup' | 'charge' | 'summon' | 'recover';

const SLAM_WINDUP = 0.9;
const SLAM_RADIUS = 2.7;
const SLAM_REACH = 1.9;
const CHARGE_WINDUP = 0.75;
const CHARGE_SPEED = 11;
const CHARGE_TIME = 0.85;
const CHARGE_LENGTH = CHARGE_SPEED * CHARGE_TIME;
const SUMMON_TIME = 1.0;
const SUMMON_INTERVAL = 11;

const telegraphMaterial = new THREE.MeshBasicMaterial({
  color: 0xff3020,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

/**
 * End-of-floor mini-boss. Telegraphed ground slam, charge, and (below half HP)
 * summons adds and moves faster.
 */
export class Boss extends Enemy {
  readonly kind = 'boss';
  readonly xp = 150;
  readonly radius = 0.8;
  readonly isBoss = true;
  readonly name: string;
  engaged = false;
  private state: State = 'dormant';
  private stateTime = 0;
  private attackCooldown = 1.5;
  private summonTimer = 4;
  private chargeHit = false;
  private recoverTime = 1;
  /** Set when damaged while dormant; engage() runs on the next update (it needs ctx). */
  private wakePending = false;
  private readonly slamRing: THREE.Mesh;
  private readonly chargeLane: THREE.Mesh;

  constructor(depth: number) {
    super(
      380,
      buildHumanoid({ skin: 0x4c4b55, shirt: 0x2c2b33, pants: 0x232229, hair: 0x18171c, boots: 0x141317 }, 2.1),
      4.0,
    );
    this.name = ['The Ashen Colossus', 'The Mossbound Tyrant', 'The Cinder King'][depth % 3];
    this.knockbackTaken = 0.12;
    // Glowing eyes and a stone maul.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), eyeMat);
      eye.position.set(ex, 0.03, 0.22);
      eye.scale.divide(this.model.head.scale);
      eye.position.divide(this.model.head.scale);
      this.model.head.add(eye);
    }
    this.model.armR.add(voxelBox([0.06, 0.06, 0.9], 0x4a3220, [0, -0.5, 0.4]));
    this.model.armR.add(voxelBox([0.32, 0.26, 0.26], 0x77777f, [0, -0.5, 0.85]));
    // Shoulder plates.
    const inner = this.model.body.children[0];
    inner.add(voxelBox([0.22, 0.12, 0.3], 0x6e6a74, [-0.36, 1.18, 0]), voxelBox([0.22, 0.12, 0.3], 0x6e6a74, [0.36, 1.18, 0]));

    this.slamRing = new THREE.Mesh(new THREE.CircleGeometry(1, 32), telegraphMaterial);
    this.slamRing.rotation.x = -Math.PI / 2;
    this.slamRing.position.set(0, 0.03, SLAM_REACH);
    this.slamRing.visible = false;
    this.chargeLane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, CHARGE_LENGTH), telegraphMaterial);
    this.chargeLane.rotation.x = -Math.PI / 2;
    this.chargeLane.position.set(0, 0.03, CHARGE_LENGTH / 2);
    this.chargeLane.visible = false;
    this.model.root.add(this.slamRing, this.chargeLane);
  }

  get enraged(): boolean {
    return this.hp < this.maxHp / 2;
  }

  protected think(dt: number, ctx: EnemyContext): void {
    this.stateTime += dt;
    this.attackCooldown -= dt;
    const dist = this.distanceToPlayer(ctx);
    const pace = this.enraged ? 1.25 : 1;

    if (this.state !== 'dormant' && this.enraged) {
      this.summonTimer -= dt;
    }
    if (!ctx.player.alive && this.state !== 'dormant') {
      this.hideTelegraphs();
      this.enter('walk');
      this.animateWalk(dt, false);
      return;
    }

    switch (this.state) {
      case 'dormant':
        this.animateWalk(dt, false);
        if (this.canSeePlayer(ctx, 11)) this.engage(ctx);
        break;
      case 'walk': {
        const moved = dist > 1.6 ? this.moveToward(ctx, dt, 2.6 * pace) : false;
        if (!moved) this.turnToward(this.angleToPlayer(ctx), 4, dt);
        this.animateWalk(dt, moved, 6);
        if (this.attackCooldown > 0) break;
        if (this.enraged && this.summonTimer <= 0) this.enter('summon');
        else if (dist < 3.6) this.enter('slamWindup');
        else if (dist < 12 && ctx.grid.lineOfSight(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z))
          this.enter('chargeWindup');
        break;
      }
      case 'slamWindup': {
        this.turnToward(this.angleToPlayer(ctx), 2.5, dt);
        const t = Math.min(1, this.stateTime / (SLAM_WINDUP / pace));
        this.model.armL.rotation.x = this.model.armR.rotation.x = -2.9 * Math.min(1, t * 1.5);
        this.model.body.rotation.x = -0.25 * t;
        this.slamRing.visible = true;
        this.slamRing.scale.setScalar(SLAM_RADIUS * (0.3 + 0.7 * t));
        if (t >= 1) {
          const cx = this.pos.x + Math.sin(this.facing) * SLAM_REACH;
          const cz = this.pos.z + Math.cos(this.facing) * SLAM_REACH;
          const p = ctx.player;
          if (Math.hypot(p.pos.x - cx, p.pos.z - cz) < SLAM_RADIUS + p.radius) {
            ctx.hitPlayer(this, { base: 24, power: this.damageMult, critChance: 0, critMultiplier: 1 }, 11);
          }
          ctx.events.emit('slam', { x: cx, z: cz, radius: SLAM_RADIUS });
          this.slamRing.visible = false;
          this.enter('slam');
        }
        break;
      }
      case 'slam': {
        const t = Math.min(1, this.stateTime / 0.12);
        this.model.armL.rotation.x = this.model.armR.rotation.x = -2.9 + 2.6 * t;
        this.model.body.rotation.x = 0.3 * t;
        if (this.stateTime > 0.12) this.recover(1.0 / pace);
        break;
      }
      case 'chargeWindup': {
        this.turnToward(this.angleToPlayer(ctx), 3.5, dt);
        this.chargeLane.visible = true;
        this.model.body.rotation.x = -0.3 * Math.min(1, this.stateTime / CHARGE_WINDUP);
        if (this.stateTime >= CHARGE_WINDUP / pace) {
          this.chargeLane.visible = false;
          this.chargeHit = false;
          this.enter('charge');
        }
        break;
      }
      case 'charge': {
        this.model.body.rotation.x = 0.35;
        const before = { ...this.pos };
        const dx = Math.sin(this.facing) * CHARGE_SPEED * dt;
        const dz = Math.cos(this.facing) * CHARGE_SPEED * dt;
        ctx.grid.moveBox(this.pos, dx, dz, this.radius);
        this.animateWalk(dt, true, 18);
        const blocked = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) < Math.hypot(dx, dz) * 0.3;
        const p = ctx.player;
        if (!this.chargeHit && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.radius + p.radius + 0.25) {
          this.chargeHit = true;
          ctx.hitPlayer(this, { base: 20, power: this.damageMult, critChance: 0, critMultiplier: 1 }, 13);
        }
        if (blocked) ctx.events.emit('slam', { x: this.pos.x, z: this.pos.z, radius: 1.5 });
        if (blocked || this.stateTime >= CHARGE_TIME) this.recover(blocked ? 1.6 : 1.0);
        break;
      }
      case 'summon': {
        const t = Math.min(1, this.stateTime / SUMMON_TIME);
        this.model.armL.rotation.x = this.model.armR.rotation.x = -3.0 * Math.sin(t * Math.PI);
        if (this.stateTime >= SUMMON_TIME) {
          for (const [ox, oz] of [
            [1.8, 0],
            [-1.8, 0],
          ]) {
            const kind = ctx.rng.chance(0.6) ? 'grunt' : 'exploder';
            const x = this.pos.x + ox;
            const z = this.pos.z + oz;
            if (ctx.grid.isWalkableAt(x, z)) ctx.spawnEnemy(kind, x, z);
          }
          this.summonTimer = SUMMON_INTERVAL;
          this.recover(0.6);
        }
        break;
      }
      case 'recover': {
        // Vulnerable window after every attack.
        const t = Math.min(1, this.stateTime / 0.4);
        const ease = Math.max(0, 1 - t);
        this.model.armL.rotation.x = this.model.armR.rotation.x = this.model.armR.rotation.x * ease;
        this.model.body.rotation.x *= ease;
        if (this.stateTime >= this.recoverTime) this.enter('walk');
        break;
      }
    }
  }

  private recover(time: number): void {
    this.recoverTime = time;
    this.attackCooldown = this.enraged ? 0.6 : 1.1;
    this.enter('recover');
  }

  private engage(ctx: EnemyContext): void {
    if (this.engaged) return;
    this.engaged = true;
    ctx.events.emit('bossEngaged', { name: this.name });
    this.enter('walk');
  }

  applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    const hit = super.applyDamage(amount, knockX, knockZ);
    if (hit && this.state === 'dormant') this.wakePending = true;
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

  private hideTelegraphs(): void {
    this.slamRing.visible = false;
    this.chargeLane.visible = false;
  }

  private enter(state: State): void {
    if (state !== 'slamWindup') this.slamRing.visible = false;
    if (state !== 'chargeWindup') this.chargeLane.visible = false;
    this.state = state;
    this.stateTime = 0;
  }
}
