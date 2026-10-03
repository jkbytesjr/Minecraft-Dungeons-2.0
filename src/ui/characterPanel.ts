import { DEFAULT_APPEARANCE, HAIR_STYLES, PALETTES, randomAppearance, type Appearance, type ColorKey } from '../systems/appearance';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const ROWS: [ColorKey, string][] = [
  ['skin', 'Skin'],
  ['hair', 'Hair colour'],
  ['eyes', 'Eyes'],
  ['shirt', 'Tunic'],
  ['scarf', 'Scarf'],
  ['pants', 'Trousers'],
  ['boots', 'Boots'],
];

const STYLE_LABEL: Record<(typeof HAIR_STYLES)[number], string> = {
  short: 'Short',
  long: 'Long',
  ponytail: 'Ponytail',
  mohawk: 'Mohawk',
  bald: 'Bald',
};

/** Title-screen character creator: every change applies live to the hero on screen. */
export class CharacterPanel {
  /** Called on every change with the new look. */
  onChange: (look: Appearance) => void = () => {};
  onClose: () => void = () => {};
  private readonly el: HTMLDivElement;
  private look: Appearance = { ...DEFAULT_APPEARANCE };

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'char-panel hidden';
    root.appendChild(this.el);
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  show(look: Appearance): void {
    this.look = { ...look };
    this.render();
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  private set(look: Appearance): void {
    this.look = look;
    this.render();
    this.onChange({ ...look });
  }

  private render(): void {
    const l = this.look;
    const swatches = (key: ColorKey) =>
      PALETTES[key]
        .map(
          (c) =>
            `<button type="button" class="swatch${l[key] === c ? ' on' : ''}" style="--c:${hex(c)}" data-key="${key}" data-color="${c}" aria-label="${key} ${hex(c)}"></button>`,
        )
        .join('');
    const row = (label: string, body: string) => `<div class="char-row"><span>${label}</span><div class="char-opts">${body}</div></div>`;
    this.el.innerHTML = `
      <div class="menu-panel char-box">
        <h2>Your hero</h2>
        ${row(
          'Hair style',
          `<div class="seg">${HAIR_STYLES.map((s) => `<button type="button" data-style="${s}" class="${l.hairStyle === s ? 'on' : ''}">${STYLE_LABEL[s]}</button>`).join('')}</div>`,
        )}
        ${ROWS.slice(0, 2).map(([k, label]) => row(label, swatches(k))).join('')}
        ${row(
          'Beard',
          `<div class="seg"><button type="button" data-beard="off" class="${l.beard === null ? 'on' : ''}">None</button><button type="button" data-beard="on" class="${l.beard !== null ? 'on' : ''}">Beard</button></div>`,
        )}
        ${ROWS.slice(2).map(([k, label]) => row(label, swatches(k))).join('')}
        <div class="char-actions">
          <button type="button" class="menu-btn small" data-act="random">Randomize</button>
          <button type="button" class="menu-btn small" data-act="reset">Default</button>
          <button type="button" class="menu-btn small menu-primary" data-act="done">Done</button>
        </div>
      </div>`;
    this.el.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.key as ColorKey;
        const color = Number(b.dataset.color);
        // A beard follows the hair colour.
        const beard = key === 'hair' && l.beard !== null ? color : l.beard;
        this.set({ ...l, [key]: color, beard });
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) =>
      b.addEventListener('click', () => this.set({ ...l, hairStyle: b.dataset.style as Appearance['hairStyle'] })),
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-beard]').forEach((b) =>
      b.addEventListener('click', () => this.set({ ...l, beard: b.dataset.beard === 'on' ? l.hair : null })),
    );
    this.el.querySelector('[data-act="random"]')!.addEventListener('click', () => this.set(randomAppearance(Math.random)));
    this.el.querySelector('[data-act="reset"]')!.addEventListener('click', () => this.set({ ...DEFAULT_APPEARANCE }));
    this.el.querySelector('[data-act="done"]')!.addEventListener('click', () => this.onClose());
  }
}
