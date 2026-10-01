/** Fixed-timestep accumulator. Pure logic, unit-tested. */
export class FixedStep {
  private acc = 0;

  /**
   * @param step Seconds per simulation tick.
   * @param maxSteps Cap per frame, so a long stall can't trigger a catch-up spiral.
   */
  constructor(
    readonly step = 1 / 60,
    readonly maxSteps = 5,
  ) {}

  /** Add a frame's elapsed time and return how many ticks to simulate now. */
  advance(frameDt: number): number {
    this.acc += Math.max(0, frameDt);
    const steps = Math.min(this.maxSteps, Math.floor(this.acc / this.step + 1e-9));
    this.acc -= steps * this.step;
    // Drop whatever the cap left behind instead of carrying debt forward.
    if (steps === this.maxSteps) this.acc = Math.min(this.acc, this.step);
    return steps;
  }

  reset(): void {
    this.acc = 0;
  }
}
