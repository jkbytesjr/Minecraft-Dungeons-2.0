/**
 * Finds mod files and tracks which are switched on. Mods come from two places:
 * the mods folder (public/mods, listed in public/mods/index.json) and files
 * imported from the title screen (kept in this browser's storage).
 */
import { ModRegistry, setActiveMods, validateMod, type ModDef } from './mods';

export interface LoadedMod {
  /** Where it came from: a file name in the mods folder, or "imported". */
  source: string;
  imported: boolean;
  mod: ModDef | null;
  errors: string[];
  warnings: string[];
  enabled: boolean;
}

const IMPORTED_KEY = 'voxel-dungeon:imported-mods';
const ENABLED_KEY = 'voxel-dungeon:mods-enabled';

function readJson<T>(key: string, fallback: T): T {
  try {
    const text = window.localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** index.json: { "mods": ["file.json", { "file": "other.json", "enabled": false }] } */
interface IndexEntry {
  file: string;
  enabled: boolean;
}

function parseIndex(raw: unknown): IndexEntry[] {
  const list = (raw as { mods?: unknown })?.mods;
  if (!Array.isArray(list)) return [];
  const out: IndexEntry[] = [];
  for (const e of list) {
    if (typeof e === 'string') out.push({ file: e, enabled: true });
    else if (e && typeof e === 'object' && typeof (e as IndexEntry).file === 'string')
      out.push({ file: (e as IndexEntry).file, enabled: (e as IndexEntry).enabled !== false });
  }
  // Only plain file names inside the mods folder.
  return out.filter((e) => /^[\w.-]+\.json$/.test(e.file) && e.file !== 'index.json');
}

export class ModManager {
  list: LoadedMod[] = [];
  /** Called after the set of active mods changes. */
  onChange: () => void = () => {};

  /** Load everything and apply the enabled mods. Never throws: a broken mod is listed with its errors. */
  async load(): Promise<void> {
    const base = `${import.meta.env.BASE_URL}mods/`;
    const found: LoadedMod[] = [];
    const saved = readJson<Record<string, boolean>>(ENABLED_KEY, {});
    let index: IndexEntry[] = [];
    try {
      const res = await fetch(`${base}index.json`, { cache: 'no-store' });
      if (res.ok) index = parseIndex(await res.json());
    } catch {
      // No mods folder: fine.
    }
    for (const entry of index) {
      let raw: unknown = null;
      let fetchError = '';
      try {
        const res = await fetch(base + entry.file, { cache: 'no-store' });
        if (res.ok) raw = await res.json();
        else fetchError = `Could not load ${entry.file} (${res.status}).`;
      } catch (err) {
        fetchError = `${entry.file} is not valid JSON: ${(err as Error).message}`;
      }
      const result = fetchError ? { mod: null, errors: [fetchError], warnings: [] } : validateMod(raw);
      const key = result.mod?.id ?? entry.file;
      found.push({ source: entry.file, imported: false, ...result, enabled: saved[key] ?? entry.enabled });
    }
    for (const raw of readJson<unknown[]>(IMPORTED_KEY, [])) {
      const result = validateMod(raw);
      found.push({ source: 'imported', imported: true, ...result, enabled: saved[result.mod?.id ?? ''] ?? true });
    }
    this.list = found;
    this.apply();
  }

  /** Mods that are on and valid, first one wins for a duplicate id. */
  private apply(): void {
    const seen = new Set<string>();
    const mods: ModDef[] = [];
    for (const m of this.list) {
      if (!m.enabled || !m.mod || seen.has(m.mod.id)) continue;
      seen.add(m.mod.id);
      mods.push(m.mod);
    }
    setActiveMods(new ModRegistry(mods));
    this.onChange();
  }

  get activeCount(): number {
    return this.list.filter((m) => m.enabled && m.mod).length;
  }

  setEnabled(index: number, on: boolean): void {
    const m = this.list[index];
    if (!m?.mod) return;
    m.enabled = on;
    const saved = readJson<Record<string, boolean>>(ENABLED_KEY, {});
    saved[m.mod.id] = on;
    writeJson(ENABLED_KEY, saved);
    this.apply();
  }

  /** Import a mod file's text. Returns the validation result (errors mean nothing was stored). */
  importText(text: string): { ok: boolean; message: string } {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      return { ok: false, message: `Not valid JSON: ${(err as Error).message}` };
    }
    const result = validateMod(raw);
    if (!result.mod) return { ok: false, message: result.errors.join(' ') };
    const stored = readJson<unknown[]>(IMPORTED_KEY, []).filter((r) => validateMod(r).mod?.id !== result.mod!.id);
    stored.push(raw);
    if (!writeJson(IMPORTED_KEY, stored)) return { ok: false, message: 'This browser blocked storage, so the mod could not be kept.' };
    this.list = this.list.filter((m) => !(m.imported && m.mod?.id === result.mod!.id));
    this.list.push({ source: 'imported', imported: true, ...result, enabled: true });
    this.apply();
    const extra = result.errors.length ? ` (${result.errors.length} problem(s) skipped)` : '';
    return { ok: true, message: `Loaded ${result.mod.name}${extra}.` };
  }

  removeImported(index: number): void {
    const m = this.list[index];
    if (!m?.imported) return;
    const id = m.mod?.id;
    writeJson(
      IMPORTED_KEY,
      readJson<unknown[]>(IMPORTED_KEY, []).filter((r) => validateMod(r).mod?.id !== id),
    );
    this.list.splice(index, 1);
    this.apply();
  }
}
