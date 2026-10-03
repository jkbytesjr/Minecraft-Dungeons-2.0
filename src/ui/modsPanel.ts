import type { ModManager } from '../systems/modLoader';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Title-screen mod list: switch mods on and off, import a mod file, see what's wrong with a broken one. */
export class ModsPanel {
  onClose: () => void = () => {};
  private readonly el: HTMLDivElement;
  private message = '';
  private messageOk = true;

  constructor(
    root: HTMLElement,
    private readonly manager: ModManager,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'pause-menu mods-panel hidden';
    root.appendChild(this.el);
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  show(): void {
    this.message = '';
    this.render();
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  private render(): void {
    const rows = this.manager.list
      .map((m, i) => {
        const mod = m.mod;
        const title = mod ? `${esc(mod.name)} <span class="mod-ver">v${esc(mod.version)} · ${esc(mod.author)}</span>` : `<b>${esc(m.source)}</b>`;
        const what = mod
          ? [
              Object.keys(mod.tweaks).length ? `${Object.keys(mod.tweaks).length} rule tweak(s)` : '',
              mod.items.length ? `${mod.items.length} item(s)` : '',
              mod.enemies.length ? `${mod.enemies.length} enemy variant(s)` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : '';
        const problems = [...m.errors.map((e) => `<li class="err">${esc(e)}</li>`), ...m.warnings.map((w) => `<li>${esc(w)}</li>`)].join('');
        return `<div class="mod-row${m.enabled && mod ? ' on' : ''}">
          <div class="mod-info">
            <div class="mod-name">${title}</div>
            ${mod?.description ? `<div class="mod-desc">${esc(mod.description)}</div>` : ''}
            <div class="mod-what">${what || (mod ? 'Does nothing yet' : 'Could not be loaded')} · ${m.imported ? 'imported' : `mods/${esc(m.source)}`}</div>
            ${problems ? `<ul class="mod-problems">${problems}</ul>` : ''}
          </div>
          <div class="mod-btns">
            ${mod ? `<button type="button" class="menu-btn small${m.enabled ? ' menu-primary' : ''}" data-toggle="${i}">${m.enabled ? 'On' : 'Off'}</button>` : ''}
            ${m.imported ? `<button type="button" class="link" data-remove="${i}">Remove</button>` : ''}
          </div>
        </div>`;
      })
      .join('');
    this.el.innerHTML = `
      <div class="menu-panel mods-box">
        <h2>Mods</h2>
        <p class="mods-help">Mods are JSON files. Put them in the <code>public/mods/</code> folder and list them in <code>public/mods/index.json</code>, or import one here. See <code>public/mods/README.md</code> for the format. Changes apply from the next floor you enter.</p>
        <div class="mod-list">${rows || '<p class="mods-empty">No mods found.</p>'}</div>
        ${this.message ? `<p class="mods-msg ${this.messageOk ? 'ok' : 'err'}">${esc(this.message)}</p>` : ''}
        <div class="char-actions">
          <label class="menu-btn small file-btn">Import mod file…<input type="file" accept=".json,application/json" hidden /></label>
          <button type="button" class="menu-btn small menu-primary" data-act="done">Done</button>
        </div>
      </div>`;
    this.el.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.toggle);
        this.manager.setEnabled(i, !this.manager.list[i].enabled);
        this.render();
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) =>
      b.addEventListener('click', () => {
        this.manager.removeImported(Number(b.dataset.remove));
        this.render();
      }),
    );
    const file = this.el.querySelector<HTMLInputElement>('input[type="file"]')!;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      const result = f.size > 512_000 ? { ok: false, message: 'That file is too big for a mod (512 KB max).' } : this.manager.importText(await f.text());
      this.message = result.message;
      this.messageOk = result.ok;
      this.render();
    });
    this.el.querySelector('[data-act="done"]')!.addEventListener('click', () => this.onClose());
  }
}
