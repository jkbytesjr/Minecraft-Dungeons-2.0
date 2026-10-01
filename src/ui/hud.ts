import type { Player } from '../entities/player';
import type { Boss } from '../entities/boss';
import { SLAM_COOLDOWN, VOLLEY_COOLDOWN } from '../entities/player';
import { xpToNext } from '../systems/progression';

const GLYPHS = {
  potion:
    '<svg viewBox="0 0 24 24"><path d="M9 2h6v3l3 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9l3-4z" fill="#c8323a"/><path d="M9 2h6v3H9z" fill="#8a6a40"/></svg>',
  slam: '<svg viewBox="0 0 24 24"><path d="M12 2v12M7 9l5 5 5-5" stroke="#f0d08a" stroke-width="2.4" fill="none"/><path d="M3 20h18M5 17l-2-2M19 17l2-2" stroke="#f0d08a" stroke-width="2"/></svg>',
  volley:
    '<svg viewBox="0 0 24 24"><path d="M4 20L20 4M4 20l7-16M4 20l16-7" stroke="#cfe3ff" stroke-width="2"/></svg>',
  dodge: '<svg viewBox="0 0 24 24"><path d="M5 5l7 7-7 7M12 5l7 7-7 7" stroke="#e8e8e8" stroke-width="2.4" fill="none"/></svg>',
};

type AbilityName = keyof typeof GLYPHS;

export interface RunSummary {
  seed: number;
  time: number;
  kills: number;
}

function ability(name: AbilityName, key: string, title: string): string {
  const count = name === 'potion' ? '<span class="potion-count"></span>' : '';
  return `<div class="ability" data-ability="${name}" title="${title}">
    <span class="ability-glyph">${GLYPHS[name]}</span>${count}
    <span class="ability-key">${key}</span>
    <div class="ability-shade"></div>
  </div>`;
}

/** DOM overlay: vitals, XP, ability cooldowns, boss bar, toasts, end screens. */
export class Hud {
  /** Called when the player picks "New run" on the victory screen. */
  onNewRun: () => void = () => {};
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly abilities = new Map<AbilityName, { el: HTMLElement; shade: HTMLElement }>();
  private readonly potionCount: HTMLSpanElement;
  private readonly xpFill: HTMLDivElement;
  private readonly levelBadge: HTMLSpanElement;
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
        ${ability('potion', '1', 'Health potion (1)')}
        <div class="vitals">
          <div class="hp-bar"><div class="hp-fill"></div><span class="hp-text"></span></div>
          <div class="xp-row"><span class="level-badge"></span><div class="xp-bar"><div class="xp-fill"></div></div></div>
        </div>
        ${ability('slam', 'Q', 'Ground slam (Q)')}
        ${ability('volley', 'E', 'Arrow volley (E)')}
        ${ability('dodge', 'SPACE', 'Dodge roll (Space)')}
      </div>
      <div class="key-hint">Tab · Inventory</div>
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
    root.querySelectorAll<HTMLElement>('[data-ability]').forEach((el) => {
      this.abilities.set(el.dataset.ability as AbilityName, { el, shade: el.querySelector('.ability-shade')! });
    });
    this.potionCount = root.querySelector('.potion-count')!;
    this.xpFill = root.querySelector('.xp-fill')!;
    this.levelBadge = root.querySelector('.level-badge')!;
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
    this.setAbility('dodge', player.dodgeCooldown / player.dodgeCooldownMax);
    this.setAbility('slam', player.slamCooldown / SLAM_COOLDOWN);
    this.setAbility('volley', player.volleyCooldown / VOLLEY_COOLDOWN);
    const potions = player.inventory.potions;
    this.setAbility('potion', potions > 0 ? player.potionCooldown : 1);
    this.potionCount.textContent = String(potions);
    const { level, xp } = player.progress;
    this.levelBadge.textContent = `Lv ${level}`;
    this.xpFill.style.width = `${Math.min(100, (xp / xpToNext(level)) * 100)}%`;
  }

  private setAbility(name: AbilityName, cooldownFraction: number): void {
    const a = this.abilities.get(name)!;
    const f = Math.max(0, Math.min(1, cooldownFraction));
    a.shade.style.height = `${f * 100}%`;
    a.el.classList.toggle('ready', f <= 0);
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
