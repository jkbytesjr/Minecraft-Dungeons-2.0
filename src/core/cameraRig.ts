import * as THREE from 'three';

/** World units visible from the bottom to the top of the screen at zoom 1. */
const VIEW_HEIGHT = 12.5;

/**
 * Fixed isometric camera: orthographic, looking down at 45° from the
 * south-east, smoothly following a target, with screen shake. Zoom scales the
 * projection (an orthographic camera's distance doesn't change what it sees).
 */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  /**
   * Offset from the target: 45° down and 45° around (x = z, y = horizontal
   * distance). Far enough back that tall scenery never crosses the near plane.
   */
  private readonly offset = new THREE.Vector3(16, 16 * Math.SQRT2, 16);
  private readonly focus = new THREE.Vector3();
  /** Menu background: angle the view circles the target by. Gameplay keeps it at 0. */
  private orbit = 0;
  private zoom = 1;
  private zoomTarget = 1;
  private readonly eye = new THREE.Vector3();
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
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 140);
    this.setAspect(aspect);
  }

  /** Snap directly to a position (e.g. on level load). */
  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.apply();
  }

  update(target: THREE.Vector3, dt: number): void {
    const t = 1 - Math.exp(-8 * dt);
    this.focus.lerp(target, t);
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-4 * dt));
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

  /** Rotate the view around the target (menu only; movement axes assume 0). */
  setOrbit(angle: number): void {
    this.orbit = angle;
  }

  /** Ease toward a zoom factor: below 1 moves the camera closer. */
  setZoom(target: number): void {
    this.zoomTarget = target;
  }

  setAspect(aspect: number): void {
    const h = VIEW_HEIGHT / 2;
    this.camera.left = -h * aspect;
    this.camera.right = h * aspect;
    this.camera.top = h;
    this.camera.bottom = -h;
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
    // Below 1 moves in closer: magnify the projection by the inverse.
    const zoom = 1 / this.zoom;
    if (Math.abs(this.camera.zoom - zoom) > 1e-4) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.eye.copy(this.offset);
    if (this.orbit !== 0) this.eye.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.orbit);
    this.camera.position.copy(this.focus).add(this.eye);
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
