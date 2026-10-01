import { Enemy, type EnemyContext } from './enemy';
import { buildHumanoid, voxelBox } from './voxelModel';
import { inArc } from '../systems/combat';

type State = 'idle' | 'chase' | 'windup' | 'strike' | 'recover';

const SPEED = 3.1;
const AGGRO_RANGE = 11;
const ATTACK_RANGE = 1.35;
const WINDUP = 0.5;
const STRIKE = 0.14;
const RECOVER = 0.65;

/** Melee brute: chases, telegraphs with raised arms, then slams. */
export class Grunt extends Enemy {
  readonly kind = 'grunt';
  readonly xp = 12;
  readonly radius = 0.35;
  private state: State = 'idle';
  private stateTime = 0;

  constructor() {
    super(
      40,
      buildHumanoid({ skin: 0x6f8f52, shirt: 0x6b4a2e, pants: 0x3c3a2c, hair: 0x2d3a22, boots: 0x231a12 }, 1.08),
      1.95,
    );
    // Crude club in the right hand.
    this.model.armR.add(voxelBox([0.16, 0.16, 0.7], 0x5b3b1f, [0, -0.5, 0.35]));
  }

  protected think(dt: number, ctx: EnemyContext): void {
    this.stateTime += dt;
    const dist = this.distanceToPlayer(ctx);
    const playerAlive = ctx.player.alive;

    switch (this.state) {
      case 'idle':
        this.animateWalk(dt, false);
        if (playerAlive && dist < AGGRO_RANGE && ctx.grid.lineOfSight(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z))
          this.enter('chase');
        break;
      case 'chase': {
        if (!playerAlive) {
          this.enter('idle');
          break;
        }
        if (dist < ATTACK_RANGE) {
          this.enter('windup');
          break;
        }
        const moved = this.moveToward(ctx, dt, SPEED);
        this.animateWalk(dt, moved);
        break;
      }
      case 'windup': {
        // Track the player slowly during the telegraph so it can be sidestepped.
        this.turnToward(this.angleToPlayer(ctx), 3, dt);
        const t = Math.min(1, this.stateTime / (WINDUP * 0.6));
        this.model.armL.rotation.x = this.model.armR.rotation.x = -2.7 * t;
        this.model.body.rotation.x = -0.2 * t;
        if (this.stateTime >= WINDUP) this.enter('strike');
        break;
      }
      case 'strike': {
        const t = Math.min(1, this.stateTime / STRIKE);
        this.model.armL.rotation.x = this.model.armR.rotation.x = -2.7 + 2.3 * t;
        this.model.body.rotation.x = 0.25 * t;
        if (this.stateTime >= STRIKE) {
          const p = ctx.player;
          if (inArc(this.pos.x, this.pos.z, this.facing, p.pos.x, p.pos.z, ATTACK_RANGE + 0.35, Math.PI * 0.6, p.radius)) {
            ctx.hitPlayer(this, { base: 10, power: this.damageMult, critChance: 0, critMultiplier: 1 }, 6);
          }
          this.enter('recover');
        }
        break;
      }
      case 'recover': {
        const t = Math.min(1, this.stateTime / RECOVER);
        this.model.armL.rotation.x = this.model.armR.rotation.x = -0.4 * (1 - t);
        this.model.body.rotation.x = 0.25 * (1 - t);
        if (this.stateTime >= RECOVER) this.enter(playerAlive ? 'chase' : 'idle');
        break;
      }
    }
  }

  /** Taking damage always wakes it up. */
  applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    const hit = super.applyDamage(amount, knockX, knockZ);
    if (hit && this.state === 'idle') this.enter('chase');
    return hit;
  }

  private enter(state: State): void {
    this.state = state;
    this.stateTime = 0;
  }
}
