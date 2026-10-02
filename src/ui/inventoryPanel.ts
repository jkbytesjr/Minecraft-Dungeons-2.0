import type { Player } from '../entities/player';
import { BAG_SIZE, computeStats, type DerivedStats } from '../systems/inventory';
import { RARITY_COLOR, describeModifier, type Item } from '../systems/loot';
import { BASE_WEAPONS } from '../systems/weapons';
import { PERKS, PERK_IDS } from '../systems/perks';
import { POWERS } from '../systems/powers';

/** Minimal inline SVG glyphs, so no image assets are needed. */
const ICONS: Record<string, string> = {
  sword:
    '<svg viewBox="0 0 24 24"><path d="M19 3l2 2-11 11-2-2z" fill="#d7dde3"/><path d="M5 15l4 4-1.5 1.5-1.5-1.5L4 21l-1-1 2.5-2.5L4 16z" fill="#b08a3a"/></svg>',
  spear:
    '<svg viewBox="0 0 24 24"><path d="M4 21l13-13" stroke="#8a5f34" stroke-width="2"/><path d="M21 3l-6 2 4 4z" fill="#d7dde3"/></svg>',
  bow: '<svg viewBox="0 0 24 24"><path d="M6 3c9 3 9 15 0 18" stroke="#a06a33" stroke-width="2.4" fill="none"/><path d="M6 3v18" stroke="#eee" stroke-width="1"/></svg>',
  armor:
    '<svg viewBox="0 0 24 24"><path d="M7 3l5 2 5-2 4 4-2 3v11H5V10L3 7z" fill="#8b8f99"/><path d="M9 9h6v2H9z" fill="#5c606a"/></svg>',
};

export function iconFor(item: Item): string {
  return ICONS[item.kind === 'weapon' ? item.weapon : 'armor'];
}

function baseLines(item: Item): string[] {
  if (item.kind === 'weapon') {
    const def = BASE_WEAPONS[item.weapon];
    const kind = item.weapon[0].toUpperCase() + item.weapon.slice(1);
    return [`${kind} · ${item.damage} damage`, `${(1 / def.cooldown).toFixed(1)} attacks/s · range ${def.range}`];
  }
  return [`Armor · ${item.armor} armor`, `+${item.maxHp} max HP`];
}

const COMPARE: { key: keyof DerivedStats; label: string; pct?: boolean }[] = [
  { key: 'weaponDamage', label: 'weapon damage' },
  { key: 'power', label: 'damage', pct: true },
  { key: 'maxHp', label: 'max HP' },
  { key: 'armor', label: 'armor' },
  { key: 'critChance', label: 'crit', pct: true },
  { key: 'attackSpeed', label: 'attack speed', pct: true },
  { key: 'moveSpeed', label: 'move speed' },
  { key: 'lifeOnHit', label: 'life on hit' },
];

/** Inventory screen: equipped gear, 16-slot bag, stats, hover tooltip with comparison. */
export class InventoryPanel {
  private readonly el: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private readonly onChange: () => void;
  private player: Player | null = null;

  constructor(root: HTMLElement, onChange: () => void) {
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'inventory hidden';
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    root.append(this.el, this.tooltip);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  toggle(player: Player): void {
    this.setOpen(!this.open, player);
  }

  setOpen(open: boolean, player: Player): void {
    this.player = player;
    this.el.classList.toggle('hidden', !open);
    this.tooltip.classList.add('hidden');
    if (open) this.render();
  }

  private render(): void {
    const p = this.player;
    if (!p) return;
    const inv = p.inventory;
    const s = p.stats;
    const slot = (item: Item | null, label: string, attrs = '') =>
      item
        ? `<button type="button" class="slot filled" style="--rarity:${RARITY_COLOR[item.rarity]}" ${attrs}>${iconFor(item)}</button>`
        : `<div class="slot empty" title="${label}"><span>${label}</span></div>`;

    const picked = PERK_IDS.filter((id) => (p.progress.perks[id] ?? 0) > 0);
    const perkList = picked.length
      ? `<h3>Attributes</h3><div class="perk-tags">${picked
          .map((id) => `<span class="perk-tag" style="--perk:${PERKS[id].color}" title="${PERKS[id].description}">${PERKS[id].name} ${p.progress.perks[id]}</span>`)
          .join('')}</div>`
      : '';

    const bag = Array.from({ length: BAG_SIZE }, (_, i) =>
      inv.bag[i] ? slot(inv.bag[i], '', `data-bag="${i}"`) : '<div class="slot empty"></div>',
    ).join('');

    this.el.innerHTML = `
      <div class="inv-header"><h2>Inventory</h2><span class="hint">Click to equip · Right-click to salvage · Tab to close</span></div>
      <div class="inv-body">
        <section class="inv-equipped">
          <h3>Equipped</h3>
          <div class="equip-row">${slot(inv.weapon, 'Weapon', 'data-equipped="weapon"')}<div><div class="equip-name" style="color:${RARITY_COLOR[inv.weapon.rarity]}">${inv.weapon.name}</div><div class="equip-sub">${baseLines(inv.weapon)[0]}</div></div></div>
          <div class="equip-row">${slot(inv.armor, 'Armor', 'data-equipped="armor"')}<div>${
            inv.armor
              ? `<div class="equip-name" style="color:${RARITY_COLOR[inv.armor.rarity]}">${inv.armor.name}</div><div class="equip-sub">${baseLines(inv.armor)[0]}</div>`
              : '<div class="equip-sub">No armor</div>'
          }</div></div>
          <h3>Level ${p.progress.level}</h3>
          <ul class="stats">
            <li><span>Max HP</span><b>${s.maxHp}</b></li>
            <li><span>Weapon damage</span><b>${s.weaponDamage}</b></li>
            <li><span>Damage bonus</span><b>+${Math.round((s.power - 1) * 100)}%</b></li>
            <li><span>Armor</span><b>${s.armor}</b></li>
            <li><span>Crit chance</span><b>${Math.round(s.critChance * 100)}%</b></li>
            <li><span>Attack speed</span><b>+${Math.round((s.attackSpeed - 1) * 100)}%</b></li>
            <li><span>Life on hit</span><b>${s.lifeOnHit}</b></li>
            <li><span>Potions</span><b>${inv.potions}</b></li>
          </ul>
          ${perkList}
        </section>
        <section class="inv-bag"><h3>Bag (${inv.bag.length}/${BAG_SIZE})</h3><div class="bag-grid">${bag}</div></section>
      </div>`;

    this.el.querySelectorAll<HTMLElement>('[data-bag]').forEach((btn) => {
      const index = Number(btn.dataset.bag);
      btn.addEventListener('click', () => {
        inv.equip(index);
        p.refreshEquipment();
        this.onChange();
        this.render();
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        inv.salvage(index);
        this.onChange();
        this.render();
      });
      btn.addEventListener('mouseenter', () => this.showTooltip(inv.bag[index], btn, true));
      btn.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
    });
    this.el.querySelectorAll<HTMLElement>('[data-equipped]').forEach((btn) => {
      const item = btn.dataset.equipped === 'weapon' ? inv.weapon : inv.armor;
      if (!item) return;
      btn.addEventListener('mouseenter', () => this.showTooltip(item, btn, false));
      btn.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
    });
    this.tooltip.classList.add('hidden');
  }

  private showTooltip(item: Item, anchor: HTMLElement, compare: boolean): void {
    const p = this.player;
    if (!p) return;
    let diff = '';
    if (compare) {
      // Compare full derived stats with the item swapped in.
      const inv = p.inventory;
      const swapped = {
        weapon: item.kind === 'weapon' ? item : inv.weapon,
        armor: item.kind === 'armor' ? item : inv.armor,
      };
      const now = p.stats;
      const next = computeStats(p.progress.perks, swapped);
      const lines = COMPARE.flatMap(({ key, label, pct }) => {
        const d = next[key] - now[key];
        if (Math.abs(d) < 0.001) return [];
        const v = pct ? `${Math.round(d * 100)}%` : `${Math.round(d * 10) / 10}`;
        return [`<li class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${v} ${label}</li>`];
      });
      diff = lines.length ? `<div class="tt-compare">If equipped:<ul>${lines.join('')}</ul></div>` : '';
    }
    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:${RARITY_COLOR[item.rarity]}">${item.name}</div>
      <div class="tt-rarity">${item.rarity[0].toUpperCase() + item.rarity.slice(1)} · Item level ${item.itemLevel + 1}</div>
      ${baseLines(item)
        .map((l) => `<div class="tt-line">${l}</div>`)
        .join('')}
      ${item.mods.length ? `<ul class="tt-mods">${item.mods.map((m) => `<li>${describeModifier(m)}</li>`).join('')}</ul>` : ''}
      ${
        item.kind === 'weapon' && item.powers?.length
          ? `<div class="tt-powers">${item.powers
              .map(
                (p) =>
                  `<div class="tt-power" style="--power:${POWERS[p.id].color}"><b>${POWERS[p.id].name}${p.tier === 2 ? ' (Mythic)' : ''}</b><span>${POWERS[p.id].describe(p.tier)}</span></div>`,
              )
              .join('')}</div>`
          : ''
      }
      ${diff}`;
    const r = anchor.getBoundingClientRect();
    this.tooltip.classList.remove('hidden');
    const tw = this.tooltip.offsetWidth;
    const left = r.right + 10 + tw > window.innerWidth ? r.left - tw - 10 : r.right + 10;
    this.tooltip.style.left = `${Math.max(8, left)}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - this.tooltip.offsetHeight - 8))}px`;
  }
}
