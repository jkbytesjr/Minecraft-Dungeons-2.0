import * as THREE from 'three';
import { buildHumanoid, type HumanoidParts } from './voxelModel';
import type { TileGrid } from '../world/grid';

export interface PlayerInput {
  /** Desired move direction on XZ (not necessarily normalized). */
  moveX: number;
  moveZ: number;
  /** World point the mouse is aiming at. */
  aimX: number;
  aimZ: number;
}

export class Player {
  readonly radius = 0.3;
  readonly pos = { x: 0, z: 0 };
  facing = 0;
  moveSpeed = 5;
  readonly model: HumanoidParts;
  private walkPhase = 0;

  constructor() {
    this.model = buildHumanoid({
      skin: 0xe0b48a,
      shirt: 0x2f7f8a,
      pants: 0x3b3550,
      hair: 0x4a2e1a,
      boots: 0x2a1f17,
    });
  }

  get object(): THREE.Object3D {
    return this.model.root;
  }

  setPosition(x: number, z: number): void {
    this.pos.x = x;
    this.pos.z = z;
    this.syncTransform();
  }

  update(dt: number, input: PlayerInput, grid: TileGrid): void {
    let mx = input.moveX;
    let mz = input.moveZ;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    if (moving) {
      mx /= len;
      mz /= len;
      grid.moveBox(this.pos, mx * this.moveSpeed * dt, mz * this.moveSpeed * dt, this.radius);
    }

    const ax = input.aimX - this.pos.x;
    const az = input.aimZ - this.pos.z;
    if (ax * ax + az * az > 0.01) this.facing = Math.atan2(ax, az);

    this.animateWalk(dt, moving);
    this.syncTransform();
  }

  private animateWalk(dt: number, moving: boolean): void {
    const { legL, legR, armL, armR, body } = this.model;
    if (moving) this.walkPhase += dt * 11;
    else this.walkPhase *= Math.pow(0.001, dt);
    const swing = Math.sin(this.walkPhase) * (moving ? 0.7 : 0.7 * Math.min(1, Math.abs(this.walkPhase)));
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;
    body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
  }

  private syncTransform(): void {
    this.model.root.position.set(this.pos.x, 0, this.pos.z);
    this.model.root.rotation.y = this.facing;
  }
}
