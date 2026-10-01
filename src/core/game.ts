import * as THREE from 'three';
import { CameraRig } from './cameraRig';
import { Input } from './input';
import { Player } from '../entities/player';
import { buildTestLevel, type Level } from '../world/level';
import { buildLevelMeshes } from '../world/voxelBuilder';
import { Torches } from '../world/torches';
import { FpsMeter } from '../ui/fpsMeter';

const MAX_DT = 1 / 30;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly input: Input;
  private readonly player = new Player();
  private readonly fps = new FpsMeter();
  private level!: Level;
  private levelGroup = new THREE.Group();
  private torches!: Torches;
  private lastTime = -1;
  private readonly aim = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();

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
    this.scene.add(this.player.object);

    this.loadLevel(buildTestLevel());
    window.addEventListener('resize', this.onResize);
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
  }

  /** Snapshot for automated smoke tests (dev only). */
  debugState(): { player: { x: number; z: number; facing: number } } {
    return { player: { ...this.player.pos, facing: this.player.facing } };
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  private loadLevel(level: Level): void {
    this.scene.remove(this.levelGroup);
    this.level = level;
    this.levelGroup = buildLevelMeshes(level, 1);
    this.torches = new Torches(level.torches);
    this.levelGroup.add(this.torches.group);
    this.scene.add(this.levelGroup);
    this.player.setPosition(level.playerStart.x, level.playerStart.z);
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
    const { input, rig } = this;
    if (input.wasPressed('F3')) this.fps.toggle();

    const f = rig.forward;
    const r = rig.right;
    const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const side = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    rig.mouseToGround(input.mouseNdc.x, input.mouseNdc.y, 0.8, this.aim);

    this.player.update(
      dt,
      {
        moveX: f.x * fwd + r.x * side,
        moveZ: f.z * fwd + r.z * side,
        aimX: this.aim.x,
        aimZ: this.aim.z,
      },
      this.level.grid,
    );

    this.focus.set(this.player.pos.x, 0, this.player.pos.z);
    rig.update(this.focus, dt);
    this.torches.update(dt, this.focus);
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rig.setAspect(window.innerWidth / window.innerHeight);
  };
}
