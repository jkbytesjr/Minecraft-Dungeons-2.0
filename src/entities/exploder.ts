import * as THREE from 'three';
import { Enemy, type EnemyContext } from './enemy';
import { buildHumanoid, setFlash, voxelBox } from './voxelModel';

type State = 'idle' | 'chase' | 'fuse';

const SPEED = 4.5;
const AGGRO_RANGE = 11;
const TRIGGER_RANGE = 1.6;
const FUSE = 0.8;
const BLAST_RADIUS = 2.8;
const fuseMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b1f });

/** Rushes the player with a powder keg on its back, then detonates. Kill it first and it fizzles. */
export class Exploder extends Enemy {
  readonly kind = 'exploder';
  readonly xp = 10;
  readonly radius = 0.32;
  private state: State = 'idle';
  private stateTime = 0;

  constructor() {
    super(20, buildHumanoid({ skin: 0x8a8f86, shirt: 0xb4522c, pants: 0x4b2a1e, hair: 0x33302c, boots: 0x241c16 }, 0.85), 1.5);
    // Powder keg strapped to its back (added to the inner, unscaled body frame).
    const inner = this.model.body.children[0];
    inner.add(voxelBox([0.42, 0.5, 0.32], 0x6b4524, [0, 0.9, -0.3]));
    inner.add(voxelBox([0.44, 0.07, 0.34], 0xd8a33a, [0, 1.0, -0.3]));
  }

  protected think(dt: number, ctx: EnemyContext): void {
    this.stateTime += dt;
    switch (this.state) {
      case 'idle':
        this.animateWalk(dt, false);
        if (this.canSeePlayer(ctx, AGGRO_RANGE)) this.enter('chase');
        break;
      case 'chase': {
        if (!ctx.player.alive) return this.enter('idle');
        const moved = this.moveToward(ctx, dt, SPEED);
        this.animateWalk(dt, moved, 15);
        if (this.distanceToPlayer(ctx) < TRIGGER_RANGE) this.enter('fuse');
        break;
      }
      case 'fuse': {
        // Telegraph: swell up and strobe red.
        const t = this.stateTime / FUSE;
        this.model.body.scale.setScalar(0.85 * (1 + 0.35 * t));
        setFlash(this.object, Math.floor(this.stateTime * (8 + 16 * t)) % 2 === 0, fuseMaterial);
        if (this.stateTime >= FUSE) {
          ctx.explode(this.pos.x, this.pos.z, BLAST_RADIUS, 30 * this.damageMult, this);
          this.rewardsOnDeath = false;
          setFlash(this.object, false);
          this.hp = 0;
          this.alive = false;
          this.model.body.visible = false;
        }
        break;
      }
    }
  }

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
