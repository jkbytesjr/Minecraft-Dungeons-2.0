import * as THREE from 'three';

/** Angled top-down camera that smoothly follows a target, with screen shake. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Offset from the target: viewed from the south-east at a steep angle. */
  private readonly offset = new THREE.Vector3(7.5, 12.5, 7.5);
  private readonly focus = new THREE.Vector3();
  private shakeTime = 0;
  private shakeDuration = 0.25;
  private shakeStrength = 0;
  /** Camera-relative ground axes for WASD movement (unit vectors on XZ). Fixed, since the camera never rotates. */
  readonly forward = new THREE.Vector3(-this.offset.x, 0, -this.offset.z).normalize();
  readonly right = new THREE.Vector3(-this.forward.z, 0, this.forward.x);
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.5, 80);
  }

  /** Snap directly to a position (e.g. on level load). */
  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.apply();
  }

  update(target: THREE.Vector3, dt: number): void {
    const t = 1 - Math.exp(-8 * dt);
    this.focus.lerp(target, t);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.apply();
  }

  shake(strength: number, duration = 0.25): void {
    // Keep whichever shake is currently stronger rather than stacking them.
    const current = this.shakeTime > 0 ? this.shakeStrength * (this.shakeTime / this.shakeDuration) : 0;
    if (strength < current) return;
    this.shakeStrength = strength;
    this.shakeTime = this.shakeDuration = duration;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Project mouse NDC onto the ground plane at height y. */
  mouseToGround(mx: number, my: number, y: number, out: THREE.Vector3): boolean {
    this.ndc.set(mx, my);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.groundPlane.constant = -y;
    return this.raycaster.ray.intersectPlane(this.groundPlane, out) !== null;
  }

  private apply(): void {
    this.camera.position.copy(this.focus).add(this.offset);
    if (this.shakeTime > 0) {
      const f = this.shakeTime / this.shakeDuration;
      const s = this.shakeStrength * f * f;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.focus);
  }
}
