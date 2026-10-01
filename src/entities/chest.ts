import * as THREE from 'three';
import { voxelBox } from './voxelModel';

const OPEN_TIME = 0.4;

/** Treasure chest that pops open when the player walks up to it. */
export class Chest {
  readonly group = new THREE.Group();
  opened = false;
  private readonly lid = new THREE.Group();
  private openTimer = 0;

  constructor(
    readonly x: number,
    readonly z: number,
    facing: number,
  ) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = facing;
    this.group.add(
      voxelBox([0.9, 0.5, 0.6], 0x7a4a22, [0, 0.25, 0]),
      voxelBox([0.94, 0.08, 0.64], 0xc9a24a, [0, 0.4, 0]),
      voxelBox([0.14, 0.18, 0.06], 0xe0c060, [0, 0.38, 0.32]),
    );
    // Lid hinged at the back edge.
    this.lid.position.set(0, 0.5, -0.3);
    this.lid.add(voxelBox([0.9, 0.22, 0.6], 0x8a5428, [0, 0.11, 0.3]));
    this.group.add(this.lid);
  }

  open(): void {
    this.opened = true;
  }

  update(dt: number): void {
    if (!this.opened || this.openTimer >= OPEN_TIME) return;
    this.openTimer = Math.min(OPEN_TIME, this.openTimer + dt);
    this.lid.rotation.x = -1.9 * (this.openTimer / OPEN_TIME);
  }
}
