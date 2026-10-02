import type { Player } from '../entities/player';
import type { Boss } from '../entities/boss';
import { xpToNext } from '../systems/progression';
import { RARITY_COLOR, describeModifier, type Item } from '../systems/loot';
import { iconFor } from './inventoryPanel';
import { describePower } from '../systems/powers';

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
  /** Floor reached (1-based). */
  floor: number;
  time: number;
  kills: number;
  /** Deepest floor ever reached on this browser. */
  best: number;
  newBest: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
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
  /** Called when the player picks "New run" on the death screen. */
  onNewRun: () => void = () => {};
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly abilities = new Map<AbilityName, { el: HTMLElement; shade: HTMLElement; last: number }>();
  private readonly potionCount: HTMLSpanElement;
  private readonly xpFill: HTMLDivElement;
  private readonly levelBadge: HTMLSpanElement;
  private readonly deathScreen: HTMLDivElement;
  private readonly floorLabel: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossName: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly runInfo: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private readonly soundHint: HTMLSpanElement;
  private readonly gearWeapon: HTMLDivElement;
  private readonly gearArmor: HTMLDivElement;
  private shownWeapon: Item | null = null;
  private shownArmor: Item | null | undefined = undefined;
  private lastHp = -1;
  private lastRunText = '';
  private lastBossHp = -1;

  constructor(root: HTMLElement, onRestart: () => void) {
    root.innerHTML = `
      <div class="vignette"></div>
      <div class="hurt-flash"></div>
      <div class="floor-label"></div>
      <div class="run-info"></div>
      <div class="boss-bar hidden"><div class="boss-name"></div><div class="boss-track"><div class="boss-fill"></div></div></div>
      <div class="toasts"></div>
      <div class="hud-bottom">
        <div class="gear">
          <div class="gear-slot" data-gear="weapon"></div>
          <div class="gear-slot" data-gear="armor"></div>
        </div>
        ${ability('potion', '1', 'Health potion (1)')}
        <div class="vitals">
          <div class="hp-bar"><div class="hp-fill"></div><span class="hp-text"></span></div>
          <div class="xp-row"><span class="level-badge"></span><div class="xp-bar"><div class="xp-fill"></div></div></div>
        </div>
        ${ability('slam', 'Q', 'Ground slam (Q)')}
        ${ability('volley', 'E', 'Arrow volley (E)')}
        ${ability('dodge', 'SPACE', 'Dodge roll (Space)')}
      </div>
      <div class="key-hint">Tab · Inventory &nbsp; H · Controls &nbsp; M · <span class="sound-hint">Sound on</span></div>
      <div class="controls-panel hidden">
        <h2>Controls</h2>
        <dl>
          <dt>W A S D</dt><dd>Move</dd>
          <dt>Mouse</dt><dd>Aim</dd>
          <dt>Left click</dt><dd>Attack (hold to keep swinging)</dd>
          <dt>Space</dt><dd>Dodge roll (brief invulnerability)</dd>
          <dt>Q</dt><dd>Ground slam</dd>
          <dt>E</dt><dd>Arrow volley</dd>
          <dt>1</dt><dd>Drink a health potion</dd>
          <dt>Tab / I</dt><dd>Inventory (pauses)</dd>
          <dt>M</dt><dd>Mute / unmute</dd>
          <dt>F3</dt><dd>FPS meter</dd>
        </dl>
        <p class="hint">Find the boss on each floor, then step into the portal it leaves behind. Press H to close.</p>
      </div>
      <div class="screen death hidden">
        <h1>You have fallen</h1>
        <p class="summary"></p>
        <p class="best"></p>
        <div class="row">
          <button type="button" class="btn restart">Try again</button>
          <button type="button" class="btn secondary new-run">New run</button>
        </div>
        <p class="hint">Try again replays this seed (or press R). New run rolls a new dungeon.</p>
      </div>`;
    this.hpFill = root.querySelector('.hp-fill')!;
    this.hpText = root.querySelector('.hp-text')!;
    root.querySelectorAll<HTMLElement>('[data-ability]').forEach((el) => {
      this.abilities.set(el.dataset.ability as AbilityName, { el, shade: el.querySelector('.ability-shade')!, last: -1 });
    });
    this.potionCount = root.querySelector('.potion-count')!;
    this.xpFill = root.querySelector('.xp-fill')!;
    this.levelBadge = root.querySelector('.level-badge')!;
    this.deathScreen = root.querySelector('.death')!;
    this.floorLabel = root.querySelector('.floor-label')!;
    this.bossBar = root.querySelector('.boss-bar')!;
    this.bossName = root.querySelector('.boss-name')!;
    this.bossFill = root.querySelector('.boss-fill')!;
    this.toasts = root.querySelector('.toasts')!;
    this.runInfo = root.querySelector('.run-info')!;
    this.gearWeapon = root.querySelector('[data-gear="weapon"]')!;
    this.gearArmor = root.querySelector('[data-gear="armor"]')!;
    this.vignette = root.querySelector('.vignette')!;
    this.flash = root.querySelector('.hurt-flash')!;
    this.controls = root.querySelector('.controls-panel')!;
    this.soundHint = root.querySelector('.sound-hint')!;
    root.querySelector('.restart')!.addEventListener('click', onRestart);
    root.querySelector('.new-run')!.addEventListener('click', () => this.onNewRun());
  }

  update(player: Player): void {
    if (player.hp !== this.lastHp) {
      this.lastHp = player.hp;
      this.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
      this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
      const low = player.alive && player.hp / player.maxHp < 0.3;
      this.vignette.classList.toggle('low', low);
    }
    this.setAbility('dodge', player.dodgeCooldown / player.dodgeCooldownMax);
    this.setAbility('slam', player.slamCooldown / player.slamCooldownMax);
    this.setAbility('volley', player.volleyCooldown / player.volleyCooldownMax);
    const potions = player.inventory.potions;
    this.setAbility('potion', potions > 0 ? player.potionCooldown : 1);
    this.potionCount.textContent = String(potions);
    const inv = player.inventory;
    if (inv.weapon !== this.shownWeapon) {
      this.shownWeapon = inv.weapon;
      this.renderGear(this.gearWeapon, inv.weapon, 'Weapon');
    }
    if (inv.armor !== this.shownArmor) {
      this.shownArmor = inv.armor;
      this.renderGear(this.gearArmor, inv.armor, 'Armor');
    }
    const { level, xp } = player.progress;
    this.levelBadge.textContent = `Lv ${level}`;
    this.xpFill.style.width = `${Math.min(100, (xp / xpToNext(level)) * 100)}%`;
  }

  /** Equipped-item slot: icon framed in its rarity colour, details on hover. */
  private renderGear(el: HTMLElement, item: Item | null, label: string): void {
    if (!item) {
      el.className = 'gear-slot empty';
      el.innerHTML = `<span>${label}</span>`;
      el.title = `No ${label.toLowerCase()} equipped`;
      el.style.removeProperty('--rarity');
      return;
    }
    el.className = 'gear-slot';
    el.style.setProperty('--rarity', RARITY_COLOR[item.rarity]);
    el.innerHTML = iconFor(item);
    const base = item.kind === 'weapon' ? `${item.damage} damage` : `${item.armor} armor, +${item.maxHp} max HP`;
    const powers = item.kind === 'weapon' ? (item.powers ?? []).map(describePower) : [];
    el.title = [item.name, base, ...item.mods.map(describeModifier), ...powers].join('\n');
    el.classList.toggle('mythic', item.rarity === 'mythic');
  }

  private setAbility(name: AbilityName, cooldownFraction: number): void {
    const a = this.abilities.get(name)!;
    // Quantize so the DOM is only touched when the shade visibly changes.
    const f = Math.round(Math.max(0, Math.min(1, cooldownFraction)) * 100) / 100;
    if (f === a.last) return;
    a.last = f;
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

  /** Run timer and kill count under the floor label. */
  setRunInfo(seconds: number, kills: number): void {
    const text = `${formatTime(seconds)} · ${kills} kill${kills === 1 ? '' : 's'}`;
    if (text === this.lastRunText) return;
    this.lastRunText = text;
    this.runInfo.textContent = text;
  }

  /** Red edge flash when the player takes damage. */
  hurt(): void {
    this.flash.classList.remove('on');
    // Force a reflow so the animation restarts on rapid hits.
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  toggleControls(show = this.controls.classList.contains('hidden')): void {
    this.controls.classList.toggle('hidden', !show);
  }

  get controlsOpen(): boolean {
    return !this.controls.classList.contains('hidden');
  }

  setMuted(muted: boolean): void {
    this.soundHint.textContent = muted ? 'Sound off' : 'Sound on';
  }

  setFloor(floor: number, seed: number): void {
    this.floorLabel.textContent = `Floor ${floor} · Seed ${seed}`;
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

  /** Death screen with the run's summary; `null` hides it. */
  showDeath(summary: RunSummary | null): void {
    this.deathScreen.classList.toggle('hidden', !summary);
    if (!summary) return;
    this.deathScreen.querySelector('.summary')!.textContent =
      `Reached floor ${summary.floor} in ${formatTime(summary.time)} with ${summary.kills} kills · Seed ${summary.seed}`;
    this.deathScreen.querySelector('.best')!.textContent = summary.newBest
      ? `New best: floor ${summary.best}!`
      : `Best: floor ${summary.best}`;
    this.deathScreen.querySelector('.best')!.classList.toggle('new', summary.newBest);
  }
}
