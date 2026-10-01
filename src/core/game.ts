import * as THREE from 'three';
import { CameraRig } from './cameraRig';
import { Input } from './input';
import { EventBus } from './events';
import { GameWorld } from './gameWorld';
import { generateDungeon, type EnemyKind } from '../world/dungeonGen';
import { cutoutUniforms } from '../world/wallCutout';
import { FpsMeter } from '../ui/fpsMeter';
import { Hud } from '../ui/hud';
import { createEnemy } from '../entities/enemyFactory';

const MAX_DT = 1 / 30;
export const FLOORS = 3;

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
  private readonly fps = new FpsMeter();
  private lastTime = -1;
  private readonly aim = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  seed = initialSeed();
  depth = 0;
  /** Seconds since the run began (excludes time on end screens). */
  private runTime = 0;
  /** Total simulated seconds (used by automated tests to wait on game time). */
  simTime = 0;
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
    this.scene.add(moon);

    this.world = new GameWorld(this.scene, this.events);
    this.hud = new Hud(document.getElementById('hud')!, () => this.restart());
    this.hud.onNewRun = () => this.startRun(Math.floor(Math.random() * 1e9));
    this.events.on('hit', (e) => {
      if (e.target === 'player') this.rig.shake(0.35);
      else if (e.crit) this.rig.shake(0.15, 0.12);
    });
    this.events.on('slam', (e) => this.rig.shake(e.radius > 2 ? 0.6 : 0.35, 0.35));
    this.events.on('explosion', () => this.rig.shake(0.7, 0.4));
    this.events.on('playerDied', () => this.hud.showDeath(true));
    this.events.on('bossEngaged', (e) => this.hud.toast(`${e.name} awakens!`, 'danger'));
    this.events.on('bossDefeated', () =>
      this.hud.toast(this.depth + 1 < FLOORS ? 'The portal is open!' : 'The way out is open!', 'good'),
    );

    this.startRun(this.seed);
    window.addEventListener('resize', this.onResize);
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  /** Begin a fresh run from floor 1. */
  startRun(seed: number): void {
    this.seed = seed;
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
    this.hud.showDeath(false);
    this.hud.setFloor(depth + 1, FLOORS, this.seed);
    this.hud.toast(`Floor ${depth + 1}`, 'info');
    this.rig.snapTo(this.focus.set(level.playerStart.x, 0, level.playerStart.z));
  }

  private frame = (time: number): void => {
    const dt = this.lastTime < 0 ? 0 : Math.min((time - this.lastTime) / 1000, MAX_DT);
    this.lastTime = time;
    this.update(dt);
    this.renderer.render(this.scene, this.rig.camera);
    this.fps.tick(time, this.renderer.info.render.calls);
    this.input.endFrame();
  };

  private update(dt: number): void {
    const { input, rig, world } = this;
    this.simTime += dt;
    if (input.wasPressed('F3')) this.fps.toggle();
    if (input.wasPressed('KeyR') && !world.player.alive) this.restart();
    if (import.meta.env.DEV && input.wasPressed('BracketRight')) this.loadFloor((this.depth + 1) % FLOORS);

    const f = rig.forward;
    const r = rig.right;
    const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const side = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    rig.mouseToGround(input.mouseNdc.x, input.mouseNdc.y, 0.8, this.aim);

    world.update(
      dt,
      {
        moveX: this.finished ? 0 : f.x * fwd + r.x * side,
        moveZ: this.finished ? 0 : f.z * fwd + r.z * side,
        aimX: this.aim.x,
        aimZ: this.aim.z,
        attack: input.mouseDown && !this.finished,
        dodge: input.wasPressed('Space') && !this.finished,
      },
      rig.camera,
    );

    if (world.player.alive && !this.finished) this.runTime += dt;
    if (world.portalReached && !this.finished) this.advanceFloor();

    this.focus.set(world.player.pos.x, 0, world.player.pos.z);
    rig.update(this.focus, dt);
    cutoutUniforms.uCutTarget.value.set(world.player.pos.x, 0.9, world.player.pos.z);
    this.hud.update(world.player);
    this.hud.updateBoss(world.boss);
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
    player: { x: number; z: number; facing: number; hp: number; alive: boolean; dodging: boolean };
    enemies: { kind: string; x: number; z: number; hp: number; alive: boolean }[];
  } {
    const p = this.world.player;
    return {
      player: { ...p.pos, facing: p.facing, hp: p.hp, alive: p.alive, dodging: p.dodging },
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
    for (const e of this.world.enemies) if (!e.isBoss) e.applyDamage(99999, 0, 0);
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

  debugKillBoss(): void {
    this.world.boss?.applyDamage(999999, 0, 0);
  }

  debugExtra(): { projectiles: number; portalActive: boolean; bossEngaged: boolean; depth: number } {
    return {
      projectiles: this.world.projectiles.mesh.count,
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
