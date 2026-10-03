import type { HumanoidParts } from './voxelModel';

/** Easing curves, t in [0, 1]. */
export const ease = {
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** Overshoots past 1 and settles: snappy wind-ups. */
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  /** Lands, bounces twice, settles: falling bodies. */
  outBounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Progress of `t` through the window [a, b], clamped to 0..1. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/**
 * Secondary motion layered on top of whatever pose the owner sets: breathing,
 * leaning into movement, step bounce, torso twist, hit flinches and
 * squash-and-stretch. It only touches the inner body frame and the head, so
 * attack poses on the body and limbs still apply on top.
 */
export class BodyMotion {
  private flinch = 0;
  private squash = 0;
  private lean = 0;
  private side = 0;
  private time = Math.random() * 10;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  /** Recoil from a hit; `strength` around 1 for normal enemies, less for heavy ones. */
  hit(strength = 1): void {
    this.flinch = Math.min(1.2, this.flinch + strength);
  }

  /** Positive squashes (landing, heavy impact), negative stretches (leaping). */
  impact(amount: number): void {
    this.squash = amount;
  }

  /**
   * @param maxSpeed Running speed, used to normalise lean and bounce.
   * @param extraLean Extra forward tilt (radians) for attack poses.
   */
  apply(
    parts: HumanoidParts,
    dt: number,
    pos: { x: number; z: number },
    facing: number,
    walkPhase: number,
    maxSpeed: number,
    extraLean = 0,
  ): void {
    if (dt <= 0) return;
    this.time += dt;
    let fwd = 0;
    let right = 0;
    if (!Number.isNaN(this.lastX)) {
      const vx = (pos.x - this.lastX) / dt;
      const vz = (pos.z - this.lastZ) / dt;
      fwd = vx * Math.sin(facing) + vz * Math.cos(facing);
      right = vx * Math.cos(facing) - vz * Math.sin(facing);
    }
    this.lastX = pos.x;
    this.lastZ = pos.z;

    const speed = Math.min(1, Math.hypot(fwd, right) / Math.max(0.1, maxSpeed));
    const k = 1 - Math.exp(-10 * dt);
    this.lean += (Math.max(-1, Math.min(1, fwd / maxSpeed)) * 0.2 - this.lean) * k;
    this.side += (Math.max(-1, Math.min(1, right / maxSpeed)) * -0.12 - this.side) * k;
    this.flinch *= Math.exp(-7 * dt);
    this.squash *= Math.exp(-9 * dt);

    const inner = parts.body.children[0];
    const step = Math.sin(walkPhase);
    const breath = Math.sin(this.time * 2.3) * 0.014 * (1 - speed);
    inner.rotation.x = this.lean + extraLean - this.flinch * 0.38;
    inner.rotation.z = this.side + step * 0.045 * speed;
    inner.rotation.y = step * 0.13 * speed;
    inner.position.y = -0.75 + Math.abs(step) * 0.06 * speed - this.squash * 0.08;
    const sq = this.squash;
    inner.scale.set(1 + sq * 0.12, 1 - sq * 0.2 + breath, 1 + sq * 0.12);
    parts.head.rotation.x = -this.flinch * 0.3 + Math.sin(walkPhase * 2) * 0.035 * speed + Math.sin(this.time * 1.1) * 0.02 * (1 - speed);
  }
}
