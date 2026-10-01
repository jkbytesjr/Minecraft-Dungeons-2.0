/** Small FPS / draw-call overlay, toggled with F3. Also exposes stats for automated checks. */
export class FpsMeter {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private windowStart = -1;
  fps = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'fps-meter hidden';
    document.body.appendChild(this.el);
  }

  toggle(): void {
    this.el.classList.toggle('hidden');
  }

  tick(time: number, drawCalls: number): void {
    if (this.windowStart < 0) this.windowStart = time;
    this.frames++;
    const elapsed = time - this.windowStart;
    if (elapsed >= 500) {
      this.fps = Math.round((this.frames * 1000) / elapsed);
      this.frames = 0;
      this.windowStart = time;
      this.el.textContent = `${this.fps} FPS · ${drawCalls} draws`;
      (window as unknown as { __stats?: object }).__stats = { fps: this.fps, drawCalls };
    }
  }
}
