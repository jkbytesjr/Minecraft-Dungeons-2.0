/** Procedural sound effects on Web Audio. No assets: everything is oscillators and filtered noise. */

const MUTE_KEY = 'voxel-dungeon:muted';
/** The same sound can't restart more often than this (e.g. a 7-arrow volley in one tick). */
const MIN_GAP = 0.035;

type Wave = OscillatorType;

function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private muted = loadMuted();
  private readonly lastPlayed = new Map<string, number>();

  constructor() {
    // Browsers only allow audio after a user gesture; create the context then.
    const unlock = (): void => {
      this.ensure();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('keydown', unlock, true);
        window.removeEventListener('pointerdown', unlock, true);
      }
    };
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('pointerdown', unlock, true);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** 'running' once unlocked, 'none' before the first gesture. */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      window.localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Storage unavailable (private mode); the setting just won't persist.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      // Gentle limiter so stacked hits don't clip.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Returns the context if `name` may play now. */
  private gate(name: string): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return null;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < MIN_GAP) return null;
    this.lastPlayed.set(name, now);
    return this.ctx;
  }

  private tone(wave: Wave, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hiss(type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private notes(freqs: number[], gap: number, wave: Wave, dur: number, vol: number): void {
    freqs.forEach((f, i) => this.tone(wave, f, f * 1.002, dur, vol, i * gap));
  }

  swing(): void {
    if (this.gate('swing')) this.hiss('bandpass', 2400, 500, 0.13, 0.35);
  }

  shoot(owner: 'player' | 'enemy'): void {
    if (!this.gate(`shoot-${owner}`)) return;
    if (owner === 'player') {
      this.tone('triangle', 520, 180, 0.12, 0.3);
      this.hiss('highpass', 3000, 6000, 0.08, 0.12);
    } else {
      this.tone('triangle', 380, 140, 0.12, 0.14);
    }
  }

  hit(target: 'enemy' | 'player', crit: boolean): void {
    if (!this.gate(`hit-${target}`)) return;
    if (target === 'player') {
      this.tone('sawtooth', 220, 70, 0.22, 0.3);
      this.hiss('lowpass', 1200, 200, 0.18, 0.3);
    } else {
      this.tone('square', crit ? 320 : 170, crit ? 120 : 60, crit ? 0.16 : 0.1, crit ? 0.26 : 0.2);
      this.hiss('bandpass', crit ? 3500 : 1800, 400, 0.08, 0.25);
    }
  }

  enemyDied(boss: boolean): void {
    if (!this.gate('died')) return;
    this.tone('sawtooth', boss ? 200 : 300, 40, boss ? 0.9 : 0.35, 0.22);
    this.hiss('lowpass', 2000, 100, boss ? 0.8 : 0.3, 0.25);
  }

  explosion(): void {
    if (!this.gate('explosion')) return;
    this.hiss('lowpass', 1600, 60, 0.7, 0.7);
    this.tone('sine', 110, 30, 0.6, 0.6);
  }

  slam(): void {
    if (!this.gate('slam')) return;
    this.tone('sine', 140, 35, 0.4, 0.7);
    this.hiss('lowpass', 900, 80, 0.35, 0.5);
  }

  dodge(): void {
    if (this.gate('dodge')) this.hiss('bandpass', 600, 2400, 0.2, 0.22);
  }

  pickup(rarity: 'common' | 'rare' | 'unique' | 'mythic' | 'potion'): void {
    if (!this.gate('pickup')) return;
    if (rarity === 'potion') {
      this.notes([660, 880], 0.05, 'sine', 0.12, 0.2);
      return;
    }
    const chord = {
      common: [523, 659],
      rare: [523, 659, 784],
      unique: [523, 659, 784, 1047],
      mythic: [392, 523, 659, 784, 1047, 1319],
    }[rarity];
    this.notes(chord, 0.06, 'triangle', 0.18, 0.2);
  }

  drink(): void {
    if (!this.gate('drink')) return;
    for (let i = 0; i < 4; i++) this.tone('sine', 300 + i * 90, 500 + i * 90, 0.07, 0.15, i * 0.06);
  }

  chest(): void {
    if (!this.gate('chest')) return;
    this.tone('square', 90, 70, 0.18, 0.12);
    this.notes([784, 988, 1175], 0.07, 'triangle', 0.25, 0.16);
  }

  levelUp(): void {
    if (this.gate('levelUp')) this.notes([523, 659, 784, 1047, 1319], 0.08, 'square', 0.22, 0.12);
  }

  bossEngaged(): void {
    if (!this.gate('boss')) return;
    this.tone('sawtooth', 55, 52, 1.4, 0.3);
    this.tone('sawtooth', 82, 78, 1.4, 0.2);
  }

  bossDefeated(): void {
    if (this.gate('bossDown')) this.notes([392, 523, 659, 784, 1047], 0.12, 'triangle', 0.4, 0.22);
  }

  playerDied(): void {
    if (this.gate('playerDied')) this.notes([392, 330, 262, 196], 0.18, 'sawtooth', 0.35, 0.18);
  }

  zap(): void {
    if (!this.gate('zap')) return;
    this.tone('square', 1800, 300, 0.12, 0.12);
    this.hiss('highpass', 4000, 9000, 0.12, 0.2);
  }

  freeze(): void {
    if (!this.gate('freeze')) return;
    this.notes([1568, 2093, 2637], 0.03, 'sine', 0.2, 0.12);
    this.hiss('highpass', 6000, 3000, 0.25, 0.15);
  }

  shockwave(): void {
    if (!this.gate('shockwave')) return;
    this.tone('sine', 220, 50, 0.3, 0.4);
    this.hiss('bandpass', 1200, 200, 0.25, 0.3);
  }

  detonate(): void {
    if (!this.gate('detonate')) return;
    this.hiss('lowpass', 2400, 90, 0.4, 0.5);
    this.tone('sine', 160, 40, 0.3, 0.4);
  }

  denied(): void {
    if (this.gate('denied')) this.tone('square', 140, 120, 0.15, 0.12);
  }

  portal(): void {
    if (this.gate('portal')) this.notes([262, 392, 523, 784], 0.07, 'sine', 0.5, 0.18);
  }
}
