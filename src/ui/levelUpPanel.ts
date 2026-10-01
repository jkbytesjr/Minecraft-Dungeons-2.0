import { PERKS, type PerkCounts, type PerkId } from '../systems/perks';

/** Level-up screen: pick one of three attributes. Click a card or press 1/2/3. */
export class LevelUpPanel {
  private readonly el: HTMLDivElement;
  private choices: PerkId[] = [];
  /** Called with the chosen perk. */
  onPick: (id: PerkId) => void = () => {};

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'levelup hidden';
    root.appendChild(this.el);
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /**
   * @param level The level this pick is for.
   * @param remaining Picks still queued after this one.
   */
  show(level: number, remaining: number, choices: PerkId[], owned: PerkCounts): void {
    this.choices = choices;
    const cards = choices
      .map((id, i) => {
        const p = PERKS[id];
        const have = owned[id] ?? 0;
        return `<button type="button" class="perk" data-perk="${i}" style="--perk:${p.color}">
          <span class="perk-key">${i + 1}</span>
          <span class="perk-name">${p.name}</span>
          <span class="perk-desc">${p.description}</span>
          <span class="perk-rank">${have > 0 ? `Rank ${have} → ${have + 1}` : 'New'} · max ${p.max}</span>
        </button>`;
      })
      .join('');
    this.el.innerHTML = `
      <h1>Level ${level}!</h1>
      <p class="levelup-sub">Choose an attribute${remaining > 0 ? ` · ${remaining} more after this` : ''}</p>
      <div class="perk-row">${cards}</div>`;
    this.el.querySelectorAll<HTMLButtonElement>('[data-perk]').forEach((btn) => {
      btn.addEventListener('click', () => this.pick(Number(btn.dataset.perk)));
    });
    this.el.classList.remove('hidden');
  }

  /** Choose by index (0-2). Returns false if there is no such choice. */
  pick(index: number): boolean {
    const id = this.choices[index];
    if (!this.open || !id) return false;
    this.hide();
    this.onPick(id);
    return true;
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
