/** Character customisation: the look of the hero. Pure apart from the storage wrappers at the bottom. */
import type { HairStyle } from '../entities/voxelModel';

export interface Appearance {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  /** Beard colour, or null for none. */
  beard: number | null;
  eyes: number;
  shirt: number;
  pants: number;
  boots: number;
  scarf: number;
}

export type ColorKey = 'skin' | 'hair' | 'eyes' | 'shirt' | 'pants' | 'boots' | 'scarf';

export const HAIR_STYLES: readonly HairStyle[] = ['short', 'long', 'ponytail', 'mohawk', 'bald'];

/** Swatches offered for each colour. */
export const PALETTES: Record<ColorKey, readonly number[]> = {
  skin: [0xf5d0b0, 0xe0b48a, 0xc68e62, 0xa86f45, 0x7d4f2f, 0x55341f, 0x9fc28a, 0xa8b8d8],
  hair: [0x1b1b1b, 0x4a2e1a, 0x8a5a2b, 0xd9b45a, 0xe8e2d0, 0xb33a2e, 0x2a6ab0, 0x9b4ad6],
  eyes: [0x1b1b1b, 0x3a6ea8, 0x3a8a4a, 0x7a4e2a, 0x8a8a9a, 0xb33a2e],
  shirt: [0x2f7f8a, 0x8a2f2f, 0x2f5a8a, 0x4f8a2f, 0x6a3a8a, 0xb0802a, 0x3a3a44, 0xd8d0c0],
  pants: [0x3b3550, 0x2a2a2a, 0x4a3a2a, 0x2a3a5a, 0x5a5a4a, 0x6a2a2a],
  boots: [0x2a1f17, 0x111111, 0x5a3a1e, 0x3a3a44, 0x6a4a2a],
  scarf: [0xb33a2e, 0xd4a017, 0x2f7f8a, 0x4a8a3a, 0x7a3a9a, 0xe8e2d0, 0x1b1b1b],
};

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 0xe0b48a,
  hair: 0x4a2e1a,
  hairStyle: 'short',
  beard: null,
  eyes: 0x1b1b1b,
  shirt: 0x2f7f8a,
  pants: 0x3b3550,
  boots: 0x2a1f17,
  scarf: 0xb33a2e,
};

const isColor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff;

/** Accept a stored look field by field, falling back to defaults for anything missing or invalid. */
export function validateAppearance(raw: unknown): Appearance {
  const out: Appearance = { ...DEFAULT_APPEARANCE };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(PALETTES) as ColorKey[]) if (isColor(r[key])) out[key] = r[key];
  if (HAIR_STYLES.includes(r.hairStyle as HairStyle)) out.hairStyle = r.hairStyle as HairStyle;
  if (r.beard === null || isColor(r.beard)) out.beard = r.beard;
  return out;
}

/** A random look from the palettes. `rand` returns floats in [0, 1). */
export function randomAppearance(rand: () => number): Appearance {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const look = { ...DEFAULT_APPEARANCE };
  for (const key of Object.keys(PALETTES) as ColorKey[]) look[key] = pick(PALETTES[key]);
  look.hairStyle = pick(HAIR_STYLES);
  look.beard = rand() < 0.35 ? look.hair : null;
  return look;
}

// ---- localStorage ----

const KEY = 'voxel-dungeon:appearance';

export function loadAppearance(): Appearance {
  try {
    const text = window.localStorage.getItem(KEY);
    return validateAppearance(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function storeAppearance(look: Appearance): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // Not persisted; the look still applies this session.
  }
}
