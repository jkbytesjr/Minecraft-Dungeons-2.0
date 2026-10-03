import * as THREE from 'three';

const WIDTH = 0.9;
const plane = new THREE.PlaneGeometry(1, 1);
const bgMat = new THREE.MeshBasicMaterial({ color: 0x1a0d0d, depthTest: false, transparent: true, opacity: 0.85 });
const fillMat = new THREE.MeshBasicMaterial({ color: 0xd8463c, depthTest: false });
const eliteFillMat = new THREE.MeshBasicMaterial({ color: 0xffc23a, depthTest: false });

/** Camera-facing HP bar floating above an enemy. Hidden at full HP. */
export class HealthBar {
  readonly group = new THREE.Group();
  private readonly fill: THREE.Mesh;

  constructor(private readonly height: number) {
    const bg = new THREE.Mesh(plane, bgMat);
    bg.scale.set(WIDTH + 0.06, 0.16, 1);
    this.fill = new THREE.Mesh(plane, fillMat);
    this.fill.scale.set(WIDTH, 0.1, 1);
    bg.renderOrder = 10;
    this.fill.renderOrder = 11;
    this.group.add(bg, this.fill);
    this.group.visible = false;
  }

  /** Gold bar for elite enemies. */
  setElite(): void {
    this.fill.material = eliteFillMat;
  }

  /** `ground`: floor height under the enemy (raised or sunken floors). */
  update(x: number, z: number, fraction: number, camera: THREE.Camera, ground = 0): void {
    const f = Math.max(0, Math.min(1, fraction));
    this.group.visible = f < 1 && f > 0;
    if (!this.group.visible) return;
    this.group.position.set(x, this.height + ground, z);
    this.group.quaternion.copy(camera.quaternion);
    this.fill.scale.x = WIDTH * f;
    this.fill.position.x = (-WIDTH * (1 - f)) / 2;
  }
}
