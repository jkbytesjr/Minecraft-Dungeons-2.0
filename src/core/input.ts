/** Keyboard + mouse state. Edge-triggered "pressed" flags are cleared by endFrame(). */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Mouse position in normalized device coordinates (-1..1). */
  mouseNdc = { x: 0, y: 0 };
  mouseDown = false;
  mouseClicked = false;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Mark a press as handled so nothing else this frame sees it. */
  consume(code: string): void {
    this.pressed.delete(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseClicked = false;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
    this.mouseDown = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    const rect = this.target.getBoundingClientRect();
    this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.mouseDown = true;
    this.mouseClicked = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseDown = false;
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
}
