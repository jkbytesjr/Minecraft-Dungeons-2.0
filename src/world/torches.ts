import * as THREE from 'three';
import type { TorchSpot } from './level';

/** Max simultaneous point lights. A fixed count avoids shader recompiles. */
const LIGHT_POOL = 6;
const REASSIGN_INTERVAL = 0.2;

/**
 * Renders all torches as instanced meshes and drives a small pool of point
 * lights that are assigned to the torches nearest the player.
 */
export class Torches {
  readonly group = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private readonly assigned: number[] = [];
  private readonly flames: THREE.InstancedMesh;
  private reassignTimer = 0;
  private time = 0;

  constructor(private readonly spots: TorchSpot[]) {
    const stickGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
    const flameGeo = new THREE.BoxGeometry(0.2, 0.22, 0.2);
    const sticks = new THREE.InstancedMesh(stickGeo, new THREE.MeshLambertMaterial({ color: 0x5a3b22 }), Math.max(1, spots.length));
    this.flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffb347 }), Math.max(1, spots.length));
    const m = new THREE.Matrix4();
    spots.forEach((s, i) => {
      sticks.setMatrixAt(i, m.makeTranslation(s.x, s.y - 0.3, s.z));
      this.flames.setMatrixAt(i, m.makeTranslation(s.x, s.y, s.z));
    });
    sticks.count = spots.length;
    this.flames.count = spots.length;
    sticks.computeBoundingSphere();
    this.flames.computeBoundingSphere();
    this.group.add(sticks, this.flames);

    for (let i = 0; i < LIGHT_POOL; i++) {
      const light = new THREE.PointLight(0xff9a3c, 0, 9, 1.6);
      this.lights.push(light);
      this.assigned.push(-1);
      this.group.add(light);
    }
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    this.reassignTimer -= dt;
    if (this.reassignTimer <= 0) {
      this.reassignTimer = REASSIGN_INTERVAL;
      this.assignNearest(focus);
    }
    for (let i = 0; i < LIGHT_POOL; i++) {
      const idx = this.assigned[i];
      const light = this.lights[i];
      if (idx < 0) {
        light.intensity = 0;
        continue;
      }
      const flicker = 0.85 + 0.15 * Math.sin(this.time * 11 + idx * 3.1) * Math.sin(this.time * 7.3 + idx);
      light.intensity = 9 * flicker;
    }
  }

  private assignNearest(focus: THREE.Vector3): void {
    const order = this.spots
      .map((s, i) => ({ i, d: (s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < LIGHT_POOL; i++) {
      const pick = order[i];
      this.assigned[i] = pick ? pick.i : -1;
      if (pick) {
        const s = this.spots[pick.i];
        // Pull the light slightly off the wall so it lights the floor.
        this.lights[i].position.set(s.x, s.y + 0.2, s.z);
      }
    }
  }
}
