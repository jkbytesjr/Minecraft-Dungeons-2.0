/**
 * Visual themes for the floors. Each floor mixes a biome (materials,
 * architecture, chasm style, props) with a lighting mood, picked from the run
 * seed so back-to-back floors never share a biome and no two floors of a run
 * look the same. Pure data and selection, unit-tested.
 */
import { Rng, hashSeed } from '../core/rng';

export type FloorMat = 'cobble' | 'cracked' | 'slate' | 'terracotta' | 'sandstone' | 'flagstone' | 'path';
export type WallKind = 'brick' | 'cobble' | 'ashlar' | 'basalt' | 'hedge' | 'white';
export type CapKind = 'cornice' | 'crenel' | 'terracotta' | 'hedge' | 'broken';
export type ChasmKind = 'cliff' | 'island' | 'garden' | 'catacomb';
export type PropKind = 'crates' | 'barrel' | 'urn' | 'planter';

export interface Biome {
  id: string;
  name: string;
  /** Floor materials blended across rooms, with weights. */
  floor: [FloorMat, number][];
  /** Materials for corridors. */
  corridor: FloorMat[];
  /** Colours per floor material (only the ones this biome uses). */
  floorColors: Partial<Record<FloorMat, number[]>>;
  wall: WallKind;
  wallColors: number[];
  mortar: number;
  cap: CapKind;
  capColor: number;
  trim: number;
  /** Chiseled pillars and arches. */
  pillar: number;
  chasm: ChasmKind;
  /** How far the chasm drops. */
  chasmDepth: number;
  /** Rock strata colours down the cliffs. */
  strata: number[];
  /** Ground colours at the bottom of the chasm. */
  lower: number[];
  /** 0..1: how much ivy climbs the walls. */
  ivy: number;
  banner: number | null;
  chains: boolean;
  /** Shallow glowing water channels through some rooms. */
  water: boolean;
  /** Wooden beams on walls. */
  beams: boolean;
  /** Railings along the drops: iron or dark oak. */
  railing: 'iron' | 'oak' | null;
  /** Mosaic and glyph colours. */
  mosaic: number[];
  /** Magic circle / rune glow. */
  rune: number;
  /** The two mana crystal colours. */
  crystals: [number, number];
  props: [PropKind, number][];
  /** Covered spaces: violet/indigo ambient shadow and a dark sky. */
  indoor: boolean;
  /** Lighting moods this biome can appear in. */
  moods: Mood[];
}

export type Mood = 'day' | 'dusk' | 'night' | 'mist' | 'torchlit' | 'arcane' | 'ember';

/** Scene-wide light and air for a floor. */
export interface Atmosphere {
  background: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  /** Sun elevation in radians: low sun casts long shadows. */
  sunElevation: number;
  /** Peak brightness of torch lights, and their colour. */
  torchIntensity: number;
  torchColor: number;
  /** Brightness of crystal / rune / water lights. */
  magicIntensity: number;
  bloomStrength: number;
  /** Strength of the soft glow around lights (lower in daylight). */
  haloOpacity: number;
  /** Haze over the chasm depths. */
  haze: number;
  hazeOpacity: number;
}

export const BIOMES: Biome[] = [
  {
    id: 'temple',
    name: 'Ancient Temple',
    floor: [
      ['sandstone', 4],
      ['terracotta', 2],
      ['cracked', 1],
    ],
    corridor: ['sandstone', 'cracked'],
    floorColors: {
      sandstone: [0xd8b884, 0xcaa874, 0xe2c494],
      terracotta: [0xc0663a, 0xb05a32, 0xcc7444],
      cracked: [0xbfa070, 0xb09062],
    },
    wall: 'ashlar',
    wallColors: [0xd6b47a, 0xccaa70, 0xe0be86, 0xc2a066],
    mortar: 0x8a6e44,
    cap: 'terracotta',
    capColor: 0xb8562e,
    trim: 0xa88a5a,
    pillar: 0xe8cc94,
    chasm: 'cliff',
    chasmDepth: 6,
    strata: [0xb89060, 0xa07a4c, 0x8a6840, 0xc49a68],
    lower: [0xc8a46c, 0xbe9a62],
    ivy: 0.15,
    banner: 0x8a1e2a,
    chains: false,
    water: false,
    beams: false,
    railing: null,
    mosaic: [0xc0663a, 0xf0e0b8, 0x2a6a8a],
    rune: 0xffc23a,
    crystals: [0xb070ff, 0xffd23f],
    props: [
      ['urn', 4],
      ['planter', 4],
      ['crates', 1],
    ],
    indoor: false,
    moods: ['day', 'dusk'],
  },
  {
    id: 'ruins',
    name: 'Overgrown Ruins',
    floor: [
      ['flagstone', 4],
      ['cobble', 3],
      ['cracked', 2],
    ],
    corridor: ['cobble', 'path'],
    floorColors: {
      flagstone: [0x6e7468, 0x646a5e, 0x787e70],
      cobble: [0x5e625a, 0x565a52, 0x6a6e64],
      cracked: [0x70746a, 0x666a60],
      path: [0x6a5638, 0x5e4c30],
    },
    wall: 'cobble',
    wallColors: [0x5e6a56, 0x56624e, 0x667260, 0x4e5a48],
    mortar: 0x2e3428,
    cap: 'broken',
    capColor: 0x6a7462,
    trim: 0x4a5244,
    pillar: 0x7a8270,
    chasm: 'garden',
    chasmDepth: 4,
    strata: [0x5a5a4a, 0x4e4a3c, 0x6a6650, 0x46483a],
    lower: [0x3e6a30, 0x467634, 0x36602a],
    ivy: 0.85,
    banner: null,
    chains: false,
    water: false,
    beams: true,
    railing: 'oak',
    mosaic: [0x6a8a5a, 0xd8d0b0, 0x8a6a3a],
    rune: 0x6affc8,
    crystals: [0x9a6bff, 0xffd23f],
    props: [
      ['urn', 3],
      ['crates', 2],
      ['planter', 2],
    ],
    indoor: false,
    moods: ['mist', 'day', 'dusk'],
  },
  {
    id: 'keep',
    name: 'Dark Keep',
    floor: [
      ['slate', 4],
      ['cobble', 2],
      ['cracked', 2],
    ],
    corridor: ['slate', 'cobble'],
    floorColors: {
      slate: [0x3a4050, 0x343a48, 0x424858],
      cobble: [0x3e3e48, 0x383842, 0x44444e],
      cracked: [0x464a56, 0x3e424e],
    },
    wall: 'basalt',
    wallColors: [0x3a3a46, 0x34343e, 0x40404c, 0x2e2e38],
    mortar: 0x16161c,
    cap: 'crenel',
    capColor: 0x4a4a58,
    trim: 0x26262e,
    pillar: 0x50505e,
    chasm: 'cliff',
    chasmDepth: 8,
    strata: [0x2a2a34, 0x22222a, 0x30303a, 0x1c1c24],
    lower: [0x1e2030, 0x181a28],
    ivy: 0.05,
    banner: 0x3a1a5a,
    chains: true,
    water: true,
    beams: true,
    railing: 'oak',
    mosaic: [0x5a3a8a, 0x8a8aa0, 0xc8a050],
    rune: 0xb060ff,
    crystals: [0xb060ff, 0xffc23a],
    props: [
      ['barrel', 3],
      ['crates', 3],
      ['urn', 1],
    ],
    indoor: true,
    moods: ['torchlit', 'arcane', 'ember'],
  },
  {
    id: 'sky',
    name: 'Sky Bastion',
    floor: [
      ['terracotta', 2],
      ['sandstone', 3],
      ['slate', 1],
    ],
    corridor: ['sandstone'],
    floorColors: {
      terracotta: [0xc87048, 0xbc643e, 0xd27c52],
      sandstone: [0xe0d4ba, 0xd4c6aa, 0xeadcc4],
      slate: [0x8a96a8, 0x7e8a9c],
    },
    wall: 'white',
    wallColors: [0xeae2d2, 0xe0d8c6, 0xf2eadc, 0xd6ccb8],
    mortar: 0xb8a88c,
    cap: 'terracotta',
    capColor: 0xc8643a,
    trim: 0xbca88a,
    pillar: 0xf4eee2,
    chasm: 'island',
    chasmDepth: 9,
    strata: [0x8a7a62, 0x6e604c, 0x9a8a70, 0x5a4e40],
    lower: [0xffffff],
    ivy: 0.35,
    banner: 0xb8402a,
    chains: false,
    water: false,
    beams: false,
    railing: 'oak',
    mosaic: [0xc8643a, 0xf4eee2, 0x3a7ac8],
    rune: 0x6ad8ff,
    crystals: [0xc080ff, 0xffd84a],
    props: [
      ['planter', 4],
      ['urn', 2],
      ['crates', 1],
    ],
    indoor: false,
    moods: ['day', 'dusk'],
  },
  {
    id: 'catacombs',
    name: 'Crystal Catacombs',
    floor: [
      ['cracked', 3],
      ['cobble', 3],
      ['slate', 1],
    ],
    corridor: ['cobble', 'cracked'],
    floorColors: {
      cracked: [0x5e5a58, 0x56524f],
      cobble: [0x4e4a48, 0x48443f, 0x55514e],
      slate: [0x44464e, 0x3e4048],
    },
    wall: 'brick',
    wallColors: [0x57545c, 0x4f4c54, 0x5e5a64, 0x4a474e],
    mortar: 0x22202a,
    cap: 'cornice',
    capColor: 0x716d76,
    trim: 0x3a373e,
    pillar: 0x6a6670,
    chasm: 'catacomb',
    chasmDepth: 3.5,
    strata: [0x3a3840, 0x302e36, 0x44424a],
    lower: [0x403d45, 0x37343c],
    ivy: 0.05,
    banner: 0x7a1e22,
    chains: true,
    water: false,
    beams: false,
    railing: 'iron',
    mosaic: [0x4a3a6a, 0x9a90a8, 0xc8a050],
    rune: 0x9a6bff,
    crystals: [0x9a6bff, 0xffd23f],
    props: [
      ['urn', 3],
      ['crates', 2],
      ['barrel', 2],
    ],
    indoor: true,
    moods: ['torchlit', 'arcane'],
  },
  {
    id: 'courtyard',
    name: 'Garden Courtyard',
    floor: [
      ['flagstone', 3],
      ['sandstone', 2],
      ['terracotta', 1],
    ],
    corridor: ['path'],
    floorColors: {
      flagstone: [0x9a9184, 0x8a8174, 0xa49a8c],
      sandstone: [0xb4a488, 0xa89878],
      terracotta: [0xb8603a, 0xa85634],
      path: [0x7a5a3a, 0x6e5034, 0x83613f],
    },
    wall: 'hedge',
    wallColors: [0x3f7a34, 0x46863a, 0x38702f, 0x4c8f40],
    mortar: 0x2a4a22,
    cap: 'hedge',
    capColor: 0x55a046,
    trim: 0x6a665e,
    pillar: 0xb4ac9c,
    chasm: 'garden',
    chasmDepth: 1.6,
    strata: [0x6a5a44, 0x5a4a38, 0x7a6a50],
    lower: [0x4f8a3c, 0x478036, 0x579444],
    ivy: 0.3,
    banner: null,
    chains: false,
    water: true,
    beams: false,
    railing: null,
    mosaic: [0xb8603a, 0xe8e0c8, 0x4a8a6a],
    rune: 0x7dff6a,
    crystals: [0xa070ff, 0xffd84a],
    props: [
      ['planter', 5],
      ['urn', 2],
      ['barrel', 1],
    ],
    indoor: false,
    moods: ['day', 'dusk', 'mist'],
  },
];

/** Outdoor lighting moods. */
const OUTDOOR: Record<'day' | 'dusk' | 'night' | 'mist', Omit<Atmosphere, 'haze' | 'hazeOpacity'>> = {
  day: {
    background: 0x8ec4ec,
    fog: 0xb4d6f2,
    fogNear: 44,
    fogFar: 96,
    hemiSky: 0xeef4ff,
    hemiGround: 0x6a5a6a,
    hemiIntensity: 1.5,
    sunColor: 0xfff0d6,
    sunIntensity: 1.8,
    sunElevation: 0.62,
    torchIntensity: 6,
    torchColor: 0xffa040,
    magicIntensity: 1.6,
    bloomStrength: 0.3,
    haloOpacity: 0.22,
  },
  dusk: {
    background: 0xd88a6a,
    fog: 0xe0a080,
    fogNear: 42,
    fogFar: 90,
    hemiSky: 0xffd0b0,
    hemiGround: 0x4a3a5a,
    hemiIntensity: 1.25,
    sunColor: 0xffa060,
    sunIntensity: 2.0,
    sunElevation: 0.38,
    torchIntensity: 10,
    torchColor: 0xff9a3a,
    magicIntensity: 6,
    bloomStrength: 0.55,
    haloOpacity: 0.4,
  },
  night: {
    background: 0x0c1428,
    fog: 0x121c34,
    fogNear: 40,
    fogFar: 80,
    hemiSky: 0x5a6aa0,
    hemiGround: 0x1a1430,
    hemiIntensity: 0.95,
    sunColor: 0x9ab0ff,
    sunIntensity: 0.8,
    sunElevation: 0.7,
    torchIntensity: 16,
    torchColor: 0xff9a3c,
    magicIntensity: 10,
    bloomStrength: 0.75,
    haloOpacity: 0.6,
  },
  mist: {
    background: 0x5a6a62,
    fog: 0x7a8a80,
    fogNear: 36,
    fogFar: 64,
    hemiSky: 0xc8d8c8,
    hemiGround: 0x3a3a48,
    hemiIntensity: 1.35,
    sunColor: 0xe8f0e0,
    sunIntensity: 1.0,
    sunElevation: 0.8,
    torchIntensity: 10,
    torchColor: 0xffa848,
    magicIntensity: 7,
    bloomStrength: 0.55,
    haloOpacity: 0.45,
  },
};

/** Covered moods: deep violet/indigo shadow, warm torchlight for contrast. */
const INDOOR: Record<'torchlit' | 'arcane' | 'ember', Omit<Atmosphere, 'haze' | 'hazeOpacity'>> = {
  torchlit: {
    background: 0x07060c,
    fog: 0x0e0a18,
    fogNear: 38,
    fogFar: 66,
    hemiSky: 0x6a5aa8,
    hemiGround: 0x1a1030,
    hemiIntensity: 1.25,
    sunColor: 0x8a8aff,
    sunIntensity: 0.55,
    sunElevation: 0.75,
    torchIntensity: 18,
    torchColor: 0xffa040,
    magicIntensity: 9,
    bloomStrength: 0.8,
    haloOpacity: 0.55,
  },
  arcane: {
    background: 0x0a0614,
    fog: 0x140a26,
    fogNear: 38,
    fogFar: 66,
    hemiSky: 0x7a5ac8,
    hemiGround: 0x200c38,
    hemiIntensity: 1.3,
    sunColor: 0xa080ff,
    sunIntensity: 0.6,
    sunElevation: 0.75,
    torchIntensity: 14,
    torchColor: 0xffb060,
    magicIntensity: 15,
    bloomStrength: 0.95,
    haloOpacity: 0.6,
  },
  ember: {
    background: 0x0c0606,
    fog: 0x1a0c0a,
    fogNear: 38,
    fogFar: 66,
    hemiSky: 0x8a5a7a,
    hemiGround: 0x241020,
    hemiIntensity: 1.2,
    sunColor: 0xff9a7a,
    sunIntensity: 0.5,
    sunElevation: 0.7,
    torchIntensity: 20,
    torchColor: 0xff7a2a,
    magicIntensity: 8,
    bloomStrength: 0.85,
    haloOpacity: 0.55,
  },
};

export interface FloorTheme {
  biome: Biome;
  mood: Mood;
  atmosphere: Atmosphere;
  /** Small per-floor colour shift so repeat visits to a biome still look different. */
  tint: number;
  /** Index of the accent palette rotation (mosaic/rune variety). */
  accent: number;
}

/**
 * The look of floor `depth` in the run with `seed`. Biomes come in a seeded
 * order and repeat every six floors, but each repeat shifts to another mood and
 * tint, so no two floors in a run look alike and consecutive floors always
 * differ in biome.
 */
export function floorTheme(seed: number, depth: number): FloorTheme {
  const order = new Rng(hashSeed(`${seed}:biomes`)).shuffle(BIOMES.map((_, i) => i));
  const d = Math.max(0, depth);
  const biome = BIOMES[order[d % order.length]];
  const cycle = Math.floor(d / order.length);
  const rng = new Rng(hashSeed(`${seed}:theme:${d}`));
  // Each biome starts on a seeded mood and moves to the next one every time it comes back.
  const start = new Rng(hashSeed(`${seed}:mood:${biome.id}`)).int(0, biome.moods.length - 1);
  const mood = biome.moods[(start + cycle) % biome.moods.length];
  const base = biome.indoor ? INDOOR[mood as keyof typeof INDOOR] : OUTDOOR[mood as keyof typeof OUTDOOR];
  const haze = biome.chasm === 'island' ? 0xe8f2ff : biome.indoor ? 0x2a2040 : new ColorMix(base.fog).mul(0.8).hex();
  const atmosphere: Atmosphere = {
    ...base,
    haze: mood === 'dusk' && biome.chasm === 'island' ? 0xd88a78 : haze,
    hazeOpacity: biome.chasm === 'island' ? 0.16 : biome.indoor ? 0.26 : 0.18,
  };
  return { biome, mood, atmosphere, tint: rng.range(-0.06, 0.06), accent: cycle + rng.int(0, 2) };
}

/** Tiny colour helper so this module stays free of three.js. */
class ColorMix {
  constructor(private v: number) {}
  mul(f: number): ColorMix {
    const r = Math.min(255, Math.round(((this.v >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((this.v >> 8) & 255) * f));
    const b = Math.min(255, Math.round((this.v & 255) * f));
    this.v = (r << 16) | (g << 8) | b;
    return this;
  }
  hex(): number {
    return this.v;
  }
}
