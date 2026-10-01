import type { Player } from '../entities/player';
import type { Boss } from '../entities/boss';

export interface RunSummary {
  seed: number;
  time: number;
  kills: number;
}

/** DOM overlay: HP bar, dodge cooldown, boss bar, toasts, end screens. Full HUD lands in M6. */
export class Hud {
  /** Called when the player picks "New run" on the victory screen. */
  onNewRun: () => void = () => {};
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly dodgeIcon: HTMLDivElement;
  private readonly dodgeShade: HTMLDivElement;
  private readonly deathScreen: HTMLDivElement;
  private readonly victoryScreen: HTMLDivElement;
  private readonly floorLabel: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossName: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private lastHp = -1;
  private lastBossHp = -1;

  constructor(root: HTMLElement, onRestart: () => void) {
    root.innerHTML = `
      <div class="floor-label"></div>
      <div class="boss-bar hidden"><div class="boss-name"></div><div class="boss-track"><div class="boss-fill"></div></div></div>
      <div class="toasts"></div>
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
      </div>
      <div class="screen victory hidden">
        <h1>Victory!</h1>
        <p class="summary"></p>
        <div class="row">
          <button type="button" class="btn new-run">New run</button>
          <button type="button" class="btn secondary replay">Replay this seed</button>
        </div>
      </div>`;
    this.hpFill = root.querySelector('.hp-fill')!;
    this.hpText = root.querySelector('.hp-text')!;
    this.dodgeIcon = root.querySelector('.ability')!;
    this.dodgeShade = root.querySelector('.ability-shade')!;
    this.deathScreen = root.querySelector('.death')!;
    this.victoryScreen = root.querySelector('.victory')!;
    this.floorLabel = root.querySelector('.floor-label')!;
    this.bossBar = root.querySelector('.boss-bar')!;
    this.bossName = root.querySelector('.boss-name')!;
    this.bossFill = root.querySelector('.boss-fill')!;
    this.toasts = root.querySelector('.toasts')!;
    root.querySelector('.restart')!.addEventListener('click', onRestart);
    root.querySelector('.replay')!.addEventListener('click', onRestart);
    root.querySelector('.new-run')!.addEventListener('click', () => this.onNewRun());
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

  updateBoss(boss: Boss | null): void {
    const show = !!boss && boss.engaged && boss.alive;
    this.bossBar.classList.toggle('hidden', !show);
    if (!show || boss.hp === this.lastBossHp) return;
    this.lastBossHp = boss.hp;
    this.bossName.textContent = boss.name;
    this.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }

  setFloor(floor: number, total: number, seed: number): void {
    this.floorLabel.textContent = `Floor ${floor} / ${total} · Seed ${seed}`;
  }

  /** Short message in the upper middle of the screen. */
  toast(text: string, tone: 'info' | 'good' | 'danger' | 'loot' = 'info', color?: string): void {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.textContent = text;
    if (color) el.style.color = color;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    window.setTimeout(() => el.remove(), 2600);
  }

  showDeath(visible: boolean): void {
    this.deathScreen.classList.toggle('hidden', !visible);
  }

  showVictory(summary: RunSummary | null): void {
    this.victoryScreen.classList.toggle('hidden', !summary);
    if (!summary) return;
    const m = Math.floor(summary.time / 60);
    const sec = Math.floor(summary.time % 60)
      .toString()
      .padStart(2, '0');
    this.victoryScreen.querySelector('.summary')!.textContent =
      `All floors cleared in ${m}:${sec} with ${summary.kills} kills · Seed ${summary.seed}`;
  }
}
