import * as THREE from 'three';
import { voxelBox } from './voxelModel';

/** Stone archway that lights up once the floor's boss is defeated. */
export class Portal {
  readonly group = new THREE.Group();
  active = false;
  private readonly veil: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private time = 0;

  constructor(
    readonly x: number,
    readonly z: number,
  ) {
    this.group.position.set(x, 0, z);
    const stone = 0x55525e;
    this.group.add(
      voxelBox([0.6, 3, 0.6], stone, [-1.5, 1.5, 0]),
      voxelBox([0.6, 3, 0.6], stone, [1.5, 1.5, 0]),
      voxelBox([3.6, 0.6, 0.7], stone, [0, 3.2, 0]),
      voxelBox([3.2, 0.12, 1.4], 0x3a3842, [0, 0.06, 0]),
    );
    this.veil = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.8),
      new THREE.MeshBasicMaterial({ color: 0x9a5cff, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    this.veil.position.y = 1.5;
    this.veil.visible = false;
    this.light = new THREE.PointLight(0xa070ff, 0, 10, 1.5);
    this.light.position.set(0, 1.6, 0.8);
    this.group.add(this.veil, this.light);
  }

  activate(): void {
    this.active = true;
    this.veil.visible = true;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.active) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    (this.veil.material as THREE.MeshBasicMaterial).color.setHSL(0.74 + 0.04 * pulse, 0.9, 0.55 + 0.1 * pulse);
    this.veil.scale.set(1 + 0.03 * pulse, 1 + 0.02 * Math.sin(this.time * 5), 1);
    this.light.intensity = 10 + 4 * pulse;
  }

  /** Is the point standing in the active portal? */
  contains(x: number, z: number): boolean {
    return this.active && Math.abs(x - this.x) < 1.2 && Math.abs(z - this.z) < 0.9;
  }
}
