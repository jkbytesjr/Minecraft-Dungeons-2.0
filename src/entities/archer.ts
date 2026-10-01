import { Enemy, type EnemyContext } from './enemy';
import { buildHumanoid, voxelBox } from './voxelModel';

type State = 'idle' | 'move' | 'aim' | 'release';

const SPEED = 3.2;
const AGGRO_RANGE = 12;
const MIN_RANGE = 4.5;
const MAX_RANGE = 9;
const AIM_TIME = 0.65;
const FIRE_INTERVAL = 1.9;

/** Ranged skirmisher: keeps its distance, telegraphs by drawing the bow, fires arrows. */
export class Archer extends Enemy {
  readonly kind = 'archer';
  readonly xp = 14;
  readonly radius = 0.3;
  private state: State = 'idle';
  private stateTime = 0;
  private fireTimer = 1;
  private strafeDir = 1;

  constructor() {
    super(26, buildHumanoid({ skin: 0xc9b9a6, shirt: 0x4a3a66, pants: 0x2a2438, hair: 0x2a2438, boots: 0x1c1826 }), 1.75);
    // Hood and bow.
    this.model.head.add(voxelBox([1.12, 0.5, 1.12], 0x3a2d52, [0, 0.38, -0.05]));
    this.model.armL.add(voxelBox([0.06, 0.9, 0.08], 0x7a5530, [0, -0.5, 0.12]));
  }

  protected think(dt: number, ctx: EnemyContext): void {
    this.stateTime += dt;
    this.fireTimer -= dt;
    const dist = this.distanceToPlayer(ctx);
    const sees = this.canSeePlayer(ctx, AGGRO_RANGE + 4);

    switch (this.state) {
      case 'idle':
        this.animateWalk(dt, false);
        if (this.canSeePlayer(ctx, AGGRO_RANGE)) this.enter('move');
        break;
      case 'move': {
        if (!ctx.player.alive) return this.enter('idle');
        let moved = true;
        if (dist < MIN_RANGE) moved = this.moveToward(ctx, dt, SPEED, true);
        else if (dist > MAX_RANGE || !sees) moved = this.moveToward(ctx, dt, SPEED);
        else {
          if (this.stateTime > 1.2) {
            this.strafeDir = ctx.rng.chance(0.5) ? 1 : -1;
            this.stateTime = 0;
          }
          this.strafe(ctx, dt, SPEED * 0.5, this.strafeDir);
          this.turnToward(this.angleToPlayer(ctx), 8, dt);
        }
        this.animateWalk(dt, moved);
        if (sees && dist <= MAX_RANGE + 1 && this.fireTimer <= 0) this.enter('aim');
        break;
      }
      case 'aim': {
        // Telegraph: bow arm raised and pointed at the player.
        this.turnToward(this.angleToPlayer(ctx), 6, dt);
        const t = Math.min(1, this.stateTime / (AIM_TIME * 0.5));
        this.model.armL.rotation.x = -1.55 * t;
        this.model.armR.rotation.x = -1.4 * t;
        if (this.stateTime >= AIM_TIME) {
          ctx.fireProjectile({
            x: this.pos.x + Math.sin(this.facing) * 0.5,
            z: this.pos.z + Math.cos(this.facing) * 0.5,
            dirX: Math.sin(this.facing),
            dirZ: Math.cos(this.facing),
            speed: 12,
            range: 15,
            attack: { base: 8, power: this.damageMult, critChance: 0, critMultiplier: 1 },
            knockback: 3,
          });
          this.fireTimer = FIRE_INTERVAL + ctx.rng.range(-0.3, 0.4);
          this.enter('release');
        }
        break;
      }
      case 'release':
        this.model.armR.rotation.x = -1.4 + this.stateTime * 4;
        if (this.stateTime > 0.3) this.enter('move');
        break;
    }
  }

  applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    const hit = super.applyDamage(amount, knockX, knockZ);
    if (hit && this.state === 'idle') this.enter('move');
    return hit;
  }

  private enter(state: State): void {
    this.state = state;
    this.stateTime = 0;
  }
}
