import type { Player } from '../entities/player';

/** DOM overlay: HP bar, dodge cooldown, and the death screen. Full HUD lands in M6. */
export class Hud {
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly dodgeIcon: HTMLDivElement;
  private readonly dodgeShade: HTMLDivElement;
  private readonly deathScreen: HTMLDivElement;
  private readonly floorLabel: HTMLDivElement;
  private lastHp = -1;

  constructor(root: HTMLElement, onRestart: () => void) {
    root.innerHTML = `
      <div class="floor-label"></div>
      <div class="hud-bottom">
        <div class="hp-bar"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="ability" title="Dodge roll (Space)">
          <span class="ability-key">SPACE</span>
          <span class="ability-glyph">»</span>
          <div class="ability-shade"></div>
        </div>
      </div>
      <div class="screen death hidden">
        <h1>You have fallen</h1>
        <button type="button" class="btn restart">Try again</button>
        <p class="hint">or press R</p>
      </div>`;
    this.hpFill = root.querySelector('.hp-fill')!;
    this.hpText = root.querySelector('.hp-text')!;
    this.dodgeIcon = root.querySelector('.ability')!;
    this.dodgeShade = root.querySelector('.ability-shade')!;
    this.deathScreen = root.querySelector('.death')!;
    this.floorLabel = root.querySelector('.floor-label')!;
    root.querySelector('.restart')!.addEventListener('click', onRestart);
  }

  update(player: Player): void {
    if (player.hp !== this.lastHp) {
      this.lastHp = player.hp;
      this.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
      this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    }
    const cd = player.dodgeCooldown / player.dodgeCooldownMax;
    this.dodgeShade.style.height = `${cd * 100}%`;
    this.dodgeIcon.classList.toggle('ready', cd <= 0);
  }

  setFloor(floor: number, total: number, seed: number): void {
    this.floorLabel.textContent = `Floor ${floor} / ${total} · Seed ${seed}`;
  }

  showDeath(visible: boolean): void {
    this.deathScreen.classList.toggle('hidden', !visible);
  }
}
