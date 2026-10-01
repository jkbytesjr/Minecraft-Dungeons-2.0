/** Pure hit-test helpers for melee attacks. */

/** Smallest signed difference between two angles, in [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Is a target circle inside a melee arc?
 * `facing` uses the same convention as the models: atan2(dx, dz).
 */
export function inArc(
  ox: number,
  oz: number,
  facing: number,
  tx: number,
  tz: number,
  range: number,
  arc: number,
  targetRadius: number,
): boolean {
  const dx = tx - ox;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dz);
  if (dist > range + targetRadius) return false;
  // Very close targets are always hit, so enemies hugging the player can't dodge the arc.
  if (dist < targetRadius + 0.3) return true;
  // Widen the arc by the target's angular size.
  const slack = Math.asin(Math.min(1, targetRadius / dist));
  return Math.abs(angleDiff(Math.atan2(dx, dz), facing)) <= arc / 2 + slack;
}
