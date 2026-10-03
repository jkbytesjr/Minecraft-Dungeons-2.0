import * as THREE from 'three';
import { Enemy, type EnemyContext } from './enemy';
import { buildHumanoid, onHead, setFlash, voxelBox } from './voxelModel';
import { ease } from './animation';

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
  protected moveSpeed = SPEED;
  /** Model scale before the fuse starts swelling it (elites are bigger). */
  private baseScale = 0;
  private state: State = 'idle';
  private stateTime = 0;

  constructor() {
    super(20, buildHumanoid({ skin: 0x7f9a5a, shirt: 0xb4522c, pants: 0x4b2a1e, hair: 0x33302c, boots: 0x241c16, hairStyle: 'bald' }, 0.85), 1.5);
    const { head } = this.model;
    // Goblin sapper: big ears, brass goggles pushed up on the forehead.
    onHead(head, [0.16, 0.08, 0.06], 0x7f9a5a, [-0.27, 0.04, 0]);
    onHead(head, [0.16, 0.08, 0.06], 0x7f9a5a, [0.27, 0.04, 0]);
    onHead(head, [0.46, 0.06, 0.46], 0x5a3a1e, [0, 0.12, 0]);
    onHead(head, [0.12, 0.1, 0.04], 0xc9a44a, [-0.1, 0.13, 0.23]);
    onHead(head, [0.12, 0.1, 0.04], 0xc9a44a, [0.1, 0.13, 0.23]);
    // Powder keg strapped to its back (added to the inner, unscaled body frame),
    // with a lit fuse, and a bandolier of little bombs.
    const inner = this.model.body.children[0];
    inner.add(
      voxelBox([0.42, 0.5, 0.32], 0x6b4524, [0, 0.9, -0.3]),
      voxelBox([0.44, 0.07, 0.34], 0xd8a33a, [0, 1.0, -0.3]),
      voxelBox([0.44, 0.07, 0.34], 0xd8a33a, [0, 0.76, -0.3]),
      voxelBox([0.04, 0.16, 0.04], 0x3a2a1a, [0.08, 1.22, -0.3]),
      voxelBox([0.52, 0.06, 0.32], 0x3a2a1a, [0, 0.95, 0.01]).rotateZ(0.5),
      voxelBox([0.1, 0.1, 0.1], 0x2a2a2a, [-0.12, 1.02, 0.17]),
      voxelBox([0.1, 0.1, 0.1], 0x2a2a2a, [0.1, 0.88, 0.17]),
    );
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    spark.position.set(0.08, 1.32, -0.3);
    inner.add(spark);
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
        // Reckless sprint: arms flung back, leaning hard into the run.
        if (moved) {
          this.model.armL.rotation.x = 1.1 + Math.sin(this.walkPhase) * 0.25;
          this.model.armR.rotation.x = 1.1 - Math.sin(this.walkPhase) * 0.25;
          this.attackLean = 0.3;
        }
        if (this.distanceToPlayer(ctx) < TRIGGER_RANGE) this.enter('fuse');
        break;
      }
      case 'fuse': {
        // Telegraph: plant feet, flail, shake harder and swell up while strobing red.
        const t = this.stateTime / FUSE;
        if (!this.baseScale) this.baseScale = this.model.body.scale.x;
        this.model.body.scale.setScalar(this.baseScale * (1 + 0.35 * ease.inCubic(t)));
        const shake = 0.02 + 0.06 * t;
        this.model.body.position.x = (Math.random() - 0.5) * shake;
        this.model.body.position.z = (Math.random() - 0.5) * shake;
        const flail = Math.sin(this.stateTime * (14 + 20 * t));
        this.model.armL.rotation.x = -2.6 + flail * 0.6;
        this.model.armR.rotation.x = -2.6 - flail * 0.6;
        this.model.legL.rotation.x = this.model.legR.rotation.x = 0;
        this.attackLean = -0.15;
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
