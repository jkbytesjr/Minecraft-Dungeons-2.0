import * as THREE from 'three';
import type { EnemyContext } from '../enemy';
import { Boss, groundCircle, telegraphMaterial } from '../boss';
import { buildHumanoid, voxelBox } from '../voxelModel';

type State = 'walk' | 'slamWindup' | 'slam' | 'chargeWindup' | 'charge' | 'summon' | 'recover';

const SLAM_WINDUP = 0.9;
const SLAM_RADIUS = 2.7;
const SLAM_REACH = 1.9;
const CHARGE_WINDUP = 0.75;
const CHARGE_SPEED = 11;
const CHARGE_TIME = 0.85;
const CHARGE_LENGTH = CHARGE_SPEED * CHARGE_TIME;
const SUMMON_TIME = 1.0;
const SUMMON_INTERVAL = 11;

/** Stone brute: telegraphed ground slam and charge; below half HP, summons adds and speeds up. */
export class Colossus extends Boss {
  readonly bossKind = 'colossus';
  readonly radius = 0.8;
  private state: State = 'walk';
  private attackCooldown = 1.5;
  private summonTimer = 4;
  private chargeHit = false;
  private recoverTime = 1;
  private readonly slamRing: THREE.Mesh;
  private readonly chargeLane: THREE.Mesh;

  constructor(depth: number) {
    super(
      'The Ashen Colossus',
      depth,
      380,
      buildHumanoid({ skin: 0x4c4b55, shirt: 0x2c2b33, pants: 0x232229, hair: 0x18171c, boots: 0x141317 }, 2.1),
      4.0,
    );
    this.addEyes(0xff8a2a);
    // Stone maul and shoulder plates.
    this.model.armR.add(voxelBox([0.06, 0.06, 0.9], 0x4a3220, [0, -0.5, 0.4]));
    this.model.armR.add(voxelBox([0.32, 0.26, 0.26], 0x77777f, [0, -0.5, 0.85]));
    const inner = this.model.body.children[0];
    inner.add(voxelBox([0.22, 0.12, 0.3], 0x6e6a74, [-0.36, 1.18, 0]), voxelBox([0.22, 0.12, 0.3], 0x6e6a74, [0.36, 1.18, 0]));

    this.slamRing = groundCircle();
    this.slamRing.position.z = SLAM_REACH;
    this.chargeLane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, CHARGE_LENGTH), telegraphMaterial);
    this.chargeLane.rotation.x = -Math.PI / 2;
    this.chargeLane.position.set(0, 0.03, CHARGE_LENGTH / 2);
    this.chargeLane.visible = false;
    this.model.root.add(this.slamRing, this.chargeLane);
  }

  protected fight(dt: number, ctx: EnemyContext): void {
    this.attackCooldown -= dt;
    const dist = this.distanceToPlayer(ctx);
    const pace = this.pace;
    if (this.enraged) this.summonTimer -= dt;

    switch (this.state) {
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
          this.chargeHit = false;
          this.enter('charge');
        }
        break;
      }
      case 'charge': {
        this.model.body.rotation.x = 0.35;
        const bx = this.pos.x;
        const bz = this.pos.z;
        const dx = Math.sin(this.facing) * CHARGE_SPEED * dt;
        const dz = Math.cos(this.facing) * CHARGE_SPEED * dt;
        ctx.grid.moveBox(this.pos, dx, dz, this.radius);
        this.animateWalk(dt, true, 18);
        const blocked = Math.hypot(this.pos.x - bx, this.pos.z - bz) < Math.hypot(dx, dz) * 0.3;
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
          this.summon(ctx, [ctx.rng.chance(0.6) ? 'grunt' : 'exploder', ctx.rng.chance(0.6) ? 'grunt' : 'exploder']);
          this.summonTimer = SUMMON_INTERVAL;
          this.recover(0.6);
        }
        break;
      }
      case 'recover': {
        // Vulnerable window after every attack.
        const ease = Math.max(0, 1 - Math.min(1, this.stateTime / 0.4));
        this.model.armL.rotation.x = this.model.armR.rotation.x = this.model.armR.rotation.x * ease;
        this.model.body.rotation.x *= ease;
        if (this.stateTime >= this.recoverTime) this.enter('walk');
        break;
      }
    }
  }

  protected idle(): void {
    if (this.state !== 'walk') this.enter('walk');
  }

  protected hideTelegraphs(): void {
    this.slamRing.visible = false;
    this.chargeLane.visible = false;
  }

  private recover(time: number): void {
    this.recoverTime = time;
    this.attackCooldown = this.enraged ? 0.6 : 1.1;
    this.enter('recover');
  }

  private enter(state: State): void {
    this.hideTelegraphs();
    this.state = state;
    this.stateTime = 0;
  }
}
