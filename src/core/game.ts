import * as THREE from 'three';
import { CameraRig } from './cameraRig';
import { Input } from './input';
import { EventBus } from './events';
import { GameWorld } from './gameWorld';
import { generateDungeon, type EnemyKind } from '../world/dungeonGen';
import { cutoutUniforms } from '../world/wallCutout';
import { FpsMeter } from '../ui/fpsMeter';
import { Hud } from '../ui/hud';
import { InventoryPanel } from '../ui/inventoryPanel';
import { RARITY_COLOR, rollItem } from '../systems/loot';
import { Rng } from './rng';
import { createEnemy } from '../entities/enemyFactory';
import { FixedStep } from './fixedStep';
import { Particles } from '../systems/particles';
import { Sfx } from '../systems/audio';
import { DamageNumbers } from '../ui/damageNumbers';
import { Minimap } from '../ui/minimap';

/** Longest real frame we account for; anything longer (tab switch, debugger) is dropped. */
const MAX_FRAME = 0.25;
export const FLOORS = 3;

/** Debris colors per enemy kind. */
const GIBS: Record<string, [number, number]> = {
  grunt: [0x6f8f52, 0x6b4a2e],
  archer: [0x4a3a66, 0xc9b9a6],
  exploder: [0xb4522c, 0xff8a3c],
  boss: [0x2c2b33, 0xa070ff],
};

/** Seed from ?seed=123 in the URL, otherwise random. */
function initialSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  const parsed = param === null ? NaN : Number.parseInt(param, 10);
  return Number.isFinite(parsed) ? parsed >>> 0 : Math.floor(Math.random() * 1e9);
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly input: Input;
  private readonly events = new EventBus();
  private readonly world: GameWorld;
  private readonly hud: Hud;
  private readonly inventory: InventoryPanel;
  private readonly minimap: Minimap;
  private readonly damageNumbers: DamageNumbers;
  readonly particles = new Particles();
  readonly sfx = new Sfx();
  private readonly fps = new FpsMeter();
  private readonly stepper = new FixedStep(1 / 60);
  private lastTime = -1;
  /** Seconds of sustained low frame rate, for adaptive resolution. */
  private slowTime = 0;
  private readonly aim = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  /** Edge-triggered actions pressed since the last simulation tick. */
  private readonly pending = { dodge: false, slam: false, volley: false, potion: false };
  seed = initialSeed();
  depth = 0;
  /** Seconds since the run began (excludes time on end screens). */
  private runTime = 0;
  /** Total simulated seconds (used by automated tests to wait on game time). */
  simTime = 0;
  /** Player shots fired (smoke-test counter). */
  private shotsFired = 0;
  private finished = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.input = new Input(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0d0b10);
    this.scene.fog = new THREE.Fog(0x0d0b10, 16, 34);
    this.scene.add(new THREE.HemisphereLight(0x8a8fb8, 0x2a2018, 1.6));
    const moon = new THREE.DirectionalLight(0x9aa6ff, 0.6);
    moon.position.set(-5, 10, 3);
    this.scene.add(moon, this.particles.mesh);

    const hudRoot = document.getElementById('hud')!;
    this.world = new GameWorld(this.scene, this.events);
    this.hud = new Hud(hudRoot, () => this.restart());
    this.hud.onNewRun = () => this.startRun(Math.floor(Math.random() * 1e9));
    this.hud.setMuted(this.sfx.isMuted);
    this.damageNumbers = new DamageNumbers(hudRoot);
    this.minimap = new Minimap(hudRoot);
    this.inventory = new InventoryPanel(hudRoot, () => {});
    this.wireEffects();

    this.startRun(this.seed);
    window.addEventListener('resize', this.onResize);
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
  }

  /** Toasts, particles, sounds, damage numbers and shake, all driven by game events. */
  private wireEffects(): void {
    const { events, hud, particles: fx, sfx, rig } = this;
    const nums = this.damageNumbers;
    events.on('itemPicked', ({ item }) => {
      hud.toast(`Picked up ${item.name}`, 'loot', RARITY_COLOR[item.rarity]);
      const p = this.world.player.pos;
      fx.burst(p.x, 0.8, p.z, { count: 14, color: Number.parseInt(RARITY_COLOR[item.rarity].slice(1), 16), up: [3, 6], speed: [0.5, 2] });
      sfx.pickup(item.rarity);
    });
    events.on('potionPicked', () => {
      hud.toast('+1 Health potion', 'good');
      sfx.pickup('potion');
    });
    events.on('bagFull', () => {
      hud.toast('Bag is full: salvage something (Tab)', 'danger');
      sfx.denied();
    });
    events.on('levelUp', ({ level }) => {
      hud.toast(`Level up! You are now level ${level}`, 'good');
      const p = this.world.player.pos;
      fx.burst(p.x, 0.2, p.z, { count: 40, color: 0xffd23f, color2: 0xfff2b0, speed: [0.5, 2.5], up: [2, 5], gravity: -0.15, life: [0.8, 1.3], spread: 0.6 });
      sfx.levelUp();
    });
    events.on('heal', (e) => {
      nums.spawn(e.x, 2, e.z, `+${e.amount}`, 'heal');
      fx.burst(e.x, 0.4, e.z, { count: 16, color: 0x6fe07a, color2: 0xc8ffd0, speed: [0.3, 1.2], up: [1, 2.5], gravity: -0.2, life: [0.6, 1] });
      sfx.drink();
    });
    events.on('hit', (e) => {
      if (e.target === 'player') {
        rig.shake(0.35);
        hud.hurt();
        nums.spawn(e.x, 2, e.z, String(e.amount), 'hurt');
        fx.burst(e.x, 1, e.z, { count: 8, color: 0xc0262b, speed: [1, 3] });
      } else {
        if (e.crit) rig.shake(0.15, 0.12);
        nums.spawn(e.x, 1.9, e.z, e.crit ? `${e.amount}!` : String(e.amount), e.crit ? 'crit' : 'hit');
        fx.burst(e.x, 0.9, e.z, { count: e.crit ? 14 : 7, color: 0x9b1d1d, color2: e.crit ? 0xffd23f : 0xd8463c, speed: [1.5, 4] });
      }
      sfx.hit(e.target, e.crit);
    });
    events.on('swing', () => sfx.swing());
    events.on('shoot', (e) => {
      if (e.owner === 'player') this.shotsFired++;
      sfx.shoot(e.owner);
    });
    events.on('enemyDied', (e) => {
      const [a, b] = GIBS[e.kind] ?? [0x888888, 0x555555];
      const boss = e.kind === 'boss';
      fx.burst(e.x, 0.8, e.z, { count: boss ? 90 : 26, color: a, color2: b, speed: [1, boss ? 7 : 4.5], up: [2, 7], size: [0.1, boss ? 0.32 : 0.2], life: [0.7, 1.4], spread: boss ? 0.8 : 0.3 });
      sfx.enemyDied(boss);
    });
    events.on('slam', (e) => {
      rig.shake(e.radius > 2 ? 0.6 : 0.35, 0.35);
      fx.ring(e.x, e.z, e.radius, 0x8a7f6a, 36);
      fx.burst(e.x, 0.1, e.z, { count: 16, color: 0xb8ad94, speed: [0.5, 2], up: [3, 6] });
      sfx.slam();
    });
    events.on('explosion', (e) => {
      rig.shake(0.7, 0.4);
      fx.burst(e.x, 0.6, e.z, { count: 60, color: 0xff8a3c, color2: 0xffd23f, speed: [2, e.radius * 3], up: [2, 8], life: [0.3, 0.7] });
      fx.burst(e.x, 0.6, e.z, { count: 24, color: 0x3a3438, color2: 0x5a5458, speed: [0.5, 2], up: [1, 3], gravity: -0.1, life: [0.8, 1.4], size: [0.2, 0.35] });
      fx.ring(e.x, e.z, e.radius, 0xff6a2c, 30);
      sfx.explosion();
    });
    events.on('dodge', (e) => {
      fx.burst(e.x, 0.1, e.z, { count: 10, color: 0x8a7f6a, speed: [0.5, 1.5], up: [0.5, 1.5], life: [0.3, 0.5] });
      sfx.dodge();
    });
    events.on('chestOpened', (e) => {
      fx.burst(e.x, 0.7, e.z, { count: 30, color: 0xf2c14e, color2: 0xfff2b0, speed: [0.5, 2.5], up: [3, 7] });
      sfx.chest();
    });
    events.on('playerDied', () => {
      hud.showDeath(true);
      sfx.playerDied();
    });
    events.on('bossEngaged', (e) => {
      hud.toast(`${e.name} awakens!`, 'danger');
      sfx.bossEngaged();
    });
    events.on('bossDefeated', () => {
      hud.toast(this.depth + 1 < FLOORS ? 'The portal is open!' : 'The way out is open!', 'good');
      rig.shake(0.8, 0.6);
      sfx.bossDefeated();
    });
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  /** Begin a fresh run from floor 1. */
  startRun(seed: number): void {
    this.seed = seed;
    this.world.player.resetProgress();
    this.runTime = 0;
    this.finished = false;
    this.world.kills = 0;
    this.hud.showVictory(null);
    this.loadFloor(0);
  }

  /** Death restart: same seed, back to floor 1. */
  restart(): void {
    this.startRun(this.seed);
  }

  loadFloor(depth: number): void {
    this.depth = depth;
    const level = generateDungeon(this.seed, depth);
    this.world.load(level);
    this.minimap.load(this.world);
    this.particles.clear();
    this.damageNumbers.clear();
    this.stepper.reset();
    this.hud.showDeath(false);
    this.inventory.setOpen(false, this.world.player);
    this.hud.setFloor(depth + 1, FLOORS, this.seed);
    this.hud.toast(`Floor ${depth + 1}`, 'info');
    this.rig.snapTo(this.focus.set(level.playerStart.x, 0, level.playerStart.z));
  }

  private get paused(): boolean {
    return this.inventory.open || this.hud.controlsOpen;
  }

  private frame = (time: number): void => {
    const dt = this.lastTime < 0 ? 0 : Math.min((time - this.lastTime) / 1000, MAX_FRAME);
    this.lastTime = time;
    this.handleUiKeys();

    if (this.paused) {
      // Frozen: drop queued actions and don't bank time for a catch-up burst on resume.
      this.stepper.reset();
      this.pending.dodge = this.pending.slam = this.pending.volley = this.pending.potion = false;
    } else {
      this.latchActions();
      const steps = this.stepper.advance(dt);
      for (let i = 0; i < steps; i++) this.step(this.stepper.step);
      // Presentation runs at display rate.
      const { player } = this.world;
      this.focus.set(player.pos.x, 0, player.pos.z);
      this.rig.update(this.focus, dt);
      cutoutUniforms.uCutTarget.value.set(player.pos.x, 0.9, player.pos.z);
      this.particles.update(dt);
      this.minimap.update(dt, this.world);
    }
    this.damageNumbers.update(this.paused ? 0 : dt, this.rig.camera, window.innerWidth, window.innerHeight);
    this.hud.update(this.world.player);
    this.hud.updateBoss(this.world.boss);
    this.hud.setRunInfo(this.runTime, this.world.kills);

    this.renderer.render(this.scene, this.rig.camera);
    this.fps.tick(time, this.renderer.info.render.calls);
    this.adaptResolution(dt);
    this.input.endFrame();
  };

  /**
   * On high-DPI screens fill rate dominates. If the frame rate stays low for a
   * few seconds, render at a lower pixel ratio (never below 1).
   */
  private adaptResolution(dt: number): void {
    const ratio = this.renderer.getPixelRatio();
    if (ratio <= 1 || this.fps.fps === 0) return;
    this.slowTime = this.fps.fps < 45 ? this.slowTime + dt : 0;
    if (this.slowTime < 3) return;
    this.slowTime = 0;
    this.renderer.setPixelRatio(Math.max(1, ratio - 0.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Menu and toggle keys: handled once per rendered frame, paused or not. */
  private handleUiKeys(): void {
    const { input, world } = this;
    if (input.wasPressed('F3')) this.fps.toggle();
    if (input.wasPressed('KeyM')) this.hud.setMuted(this.sfx.toggleMute());
    if (input.wasPressed('KeyR') && !world.player.alive) this.restart();
    if (input.wasPressed('KeyH') && !this.inventory.open) this.hud.toggleControls();
    if ((input.wasPressed('Tab') || input.wasPressed('KeyI')) && world.player.alive && !this.finished && !this.hud.controlsOpen)
      this.inventory.toggle(world.player);
    if (input.wasPressed('Escape')) {
      if (this.inventory.open) this.inventory.setOpen(false, world.player);
      this.hud.toggleControls(false);
    }
    if (import.meta.env.DEV && input.wasPressed('BracketRight') && !this.paused) this.loadFloor((this.depth + 1) % FLOORS);
  }

  /**
   * Remember edge-triggered presses until a simulation tick consumes them. On
   * high-refresh displays some frames run no tick, and a press must not be lost.
   */
  private latchActions(): void {
    const { input, pending } = this;
    pending.dodge ||= input.wasPressed('Space');
    pending.slam ||= input.wasPressed('KeyQ');
    pending.volley ||= input.wasPressed('KeyE');
    pending.potion ||= input.wasPressed('Digit1');
  }

  /** One fixed simulation tick. */
  private step(dt: number): void {
    const { input, rig, world, pending } = this;
    this.simTime += dt;
    const f = rig.forward;
    const r = rig.right;
    const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const side = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    rig.mouseToGround(input.mouseNdc.x, input.mouseNdc.y, 0.8, this.aim);
    const live = !this.finished;

    world.update(
      dt,
      {
        moveX: live ? f.x * fwd + r.x * side : 0,
        moveZ: live ? f.z * fwd + r.z * side : 0,
        aimX: this.aim.x,
        aimZ: this.aim.z,
        attack: input.mouseDown && live,
        dodge: pending.dodge && live,
        slam: pending.slam && live,
        volley: pending.volley && live,
        potion: pending.potion && live,
      },
      rig.camera,
    );
    // Each press is used by exactly one tick.
    pending.dodge = pending.slam = pending.volley = pending.potion = false;

    if (world.player.alive && live) this.runTime += dt;
    if (world.portalReached && live) {
      this.sfx.portal();
      this.advanceFloor();
    }
  }

  private advanceFloor(): void {
    if (this.depth + 1 < FLOORS) {
      this.loadFloor(this.depth + 1);
      return;
    }
    this.finished = true;
    this.hud.showVictory({ seed: this.seed, time: this.runTime, kills: this.world.kills });
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rig.setAspect(window.innerWidth / window.innerHeight);
  };

  // ---- Dev-only hooks for the automated smoke test ----

  debugState(): {
    player: {
      x: number;
      z: number;
      facing: number;
      hp: number;
      maxHp: number;
      alive: boolean;
      dodging: boolean;
      level: number;
      xp: number;
      potions: number;
      bag: number;
      weapon: string;
    };
    enemies: { kind: string; x: number; z: number; hp: number; alive: boolean }[];
  } {
    const p = this.world.player;
    return {
      player: {
        ...p.pos,
        facing: p.facing,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        dodging: p.dodging,
        level: p.progress.level,
        xp: p.progress.xp,
        potions: p.inventory.potions,
        bag: p.inventory.bag.length,
        weapon: p.inventory.weapon.weapon,
      },
      enemies: this.world.enemies.map((e) => ({ kind: e.kind, ...e.pos, hp: e.hp, alive: e.alive })),
    };
  }

  get level(): GameWorld['level'] {
    return this.world.level;
  }

  /** Teleport the player next to the boss / portal (smoke-test helper). */
  debugTeleport(x: number, z: number): void {
    this.world.player.setPosition(x, z);
  }

  /** Remove non-boss enemies and spawn one enemy at an offset from the player. */
  debugSpawn(kind: EnemyKind, dx: number, dz: number): void {
    for (const e of this.world.enemies) {
      if (e.isBoss || !e.alive) continue;
      e.rewardsOnDeath = false;
      e.applyDamage(99999, 0, 0);
    }
    const p = this.world.player.pos;
    const grid = this.world.level.grid;
    // Keep the distance but rotate until the spot is on open floor in sight of the player.
    const dist = Math.hypot(dx, dz);
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < 32; i++) {
      const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 16);
      const x = p.x + Math.sin(a) * dist;
      const z = p.z + Math.cos(a) * dist;
      if (grid.isWalkableAt(x, z) && grid.lineOfSight(p.x, p.z, x, z)) {
        this.world.spawn(createEnemy(kind, this.depth), x, z);
        return;
      }
    }
    this.world.spawn(createEnemy(kind, this.depth), p.x + dx, p.z + dz);
  }

  /** Give the player an item (smoke-test helper). */
  debugGive(kind: 'weapon' | 'armor', rarity: 'common' | 'rare' | 'unique'): void {
    const rng = new Rng(Math.floor(Math.random() * 1e9));
    this.world.player.inventory.add(rollItem(rng, this.depth, { kind, minRarity: rarity === 'common' ? 'common' : rarity, uniqueBoost: rarity === 'unique' ? 1e6 : 0 }));
  }

  get worldState(): GameWorld {
    return this.world;
  }

  debugFx(): { particles: number; damageNumbers: number; explored: number; audio: string; muted: boolean } {
    return {
      particles: this.particles.count,
      damageNumbers: this.damageNumbers.activeCount,
      explored: this.minimap.seenCount,
      audio: this.sfx.state,
      muted: this.sfx.isMuted,
    };
  }

  debugKillBoss(): void {
    this.world.boss?.applyDamage(999999, 0, 0);
  }

  debugExtra(): { projectiles: number; shots: number; portalActive: boolean; bossEngaged: boolean; depth: number } {
    return {
      projectiles: this.world.projectiles.mesh.count,
      shots: this.shotsFired,
      portalActive: this.world.portal.active,
      bossEngaged: !!this.world.boss?.engaged,
      depth: this.depth,
    };
  }

  /** Screen-space pixel position of a world point (for aiming the mouse in tests). */
  debugWorldToScreen(x: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, 0.8, z).project(this.rig.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }
}
