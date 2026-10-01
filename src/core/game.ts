import * as THREE from 'three';
import { CameraRig } from './cameraRig';
import { Input } from './input';
import { EventBus } from './events';
import { GameWorld } from './gameWorld';
import { generateDungeon } from '../world/dungeonGen';
import { cutoutUniforms } from '../world/wallCutout';
import { FpsMeter } from '../ui/fpsMeter';
import { Hud } from '../ui/hud';
import { Grunt } from '../entities/grunt';

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
    this.events.on('hit', (e) => {
      if (e.target === 'player') this.rig.shake(0.35);
      else if (e.crit) this.rig.shake(0.15, 0.12);
    });
    this.events.on('playerDied', () => this.hud.showDeath(true));

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
        moveX: f.x * fwd + r.x * side,
        moveZ: f.z * fwd + r.z * side,
        aimX: this.aim.x,
        aimZ: this.aim.z,
        attack: input.mouseDown,
        dodge: input.wasPressed('Space'),
      },
      rig.camera,
    );

    this.focus.set(world.player.pos.x, 0, world.player.pos.z);
    rig.update(this.focus, dt);
    cutoutUniforms.uCutTarget.value.set(world.player.pos.x, 0.9, world.player.pos.z);
    this.hud.update(world.player);
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

  /** Remove all enemies and spawn one grunt at an offset from the player. */
  debugSpawnGrunt(dx: number, dz: number): void {
    for (const e of this.world.enemies) e.applyDamage(99999, 0, 0);
    const p = this.world.player.pos;
    this.world.spawn(new Grunt(), p.x + dx, p.z + dz);
  }

  /** Screen-space pixel position of a world point (for aiming the mouse in tests). */
  debugWorldToScreen(x: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, 0.8, z).project(this.rig.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }
}
