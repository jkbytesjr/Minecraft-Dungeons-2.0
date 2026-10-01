import * as THREE from 'three';
import { Player, type PlayerInput } from '../entities/player';
import type { Enemy, EnemyContext } from '../entities/enemy';
import type { Dungeon } from '../world/dungeonGen';
import { createEnemy } from '../entities/enemyFactory';
import { buildLevelMeshes } from '../world/voxelBuilder';
import { Torches } from '../world/torches';
import { FlowField } from '../systems/flowField';
import { inArc } from '../systems/combat';
import { rollDamage, type AttackStats } from '../systems/damage';
import { Rng } from './rng';
import type { EventBus } from './events';

/** Enemies further than this from the player are frozen and hidden. */
const ACTIVE_RANGE = 30;

/** Owns everything in the simulation: level, player, enemies, and the rules between them. */
export class GameWorld {
  readonly player = new Player();
  readonly enemies: Enemy[] = [];
  level!: Dungeon;
  private readonly root = new THREE.Group();
  private levelGroup = new THREE.Group();
  private torches!: Torches;
  private flow!: FlowField;
  private rng = new Rng(1);
  private ctx!: EnemyContext;
  private deathAnnounced = false;
  private readonly focus = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly events: EventBus,
  ) {
    scene.add(this.root);
    this.root.add(this.player.object);
  }

  load(level: Dungeon): void {
    for (const e of this.enemies) this.removeEnemyObjects(e);
    this.enemies.length = 0;
    this.root.remove(this.levelGroup);
    this.level = level;
    this.rng = new Rng(level.seed * 31 + level.depth);
    this.levelGroup = buildLevelMeshes(level, level.seed + level.depth);
    this.torches = new Torches(level.torches);
    this.levelGroup.add(this.torches.group);
    this.root.add(this.levelGroup);
    this.flow = new FlowField(level.grid);
    this.player.respawn(level.playerStart.x, level.playerStart.z);
    this.deathAnnounced = false;
    this.ctx = {
      player: this.player,
      grid: level.grid,
      flow: this.flow,
      rng: this.rng,
      hitPlayer: (source, attack, knockback) => this.hitPlayer(source, attack, knockback),
    };
    for (const s of level.spawns) this.spawn(createEnemy(s.kind, level.depth), s.x, s.z);
  }

  update(dt: number, input: PlayerInput, camera: THREE.Camera): void {
    const { player, level } = this;
    const wasDodging = player.dodging;
    player.update(dt, input, level.grid);
    if (!wasDodging && player.dodging) this.events.emit('dodge', { ...player.pos });
    if (player.strikeReady) this.resolvePlayerStrike();
    if (!player.alive && !this.deathAnnounced) {
      this.deathAnnounced = true;
      this.events.emit('playerDied', {});
    }

    this.flow.update(player.pos.x, player.pos.z);
    for (const e of this.enemies) {
      const near = Math.abs(e.pos.x - player.pos.x) < ACTIVE_RANGE && Math.abs(e.pos.z - player.pos.z) < ACTIVE_RANGE;
      e.object.visible = near;
      if (near) e.update(dt, this.ctx, camera);
    }
    this.separate();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removable) {
        this.removeEnemyObjects(this.enemies[i]);
        this.enemies.splice(i, 1);
      }
    }
    this.torches.update(dt, this.focus.set(player.pos.x, 0, player.pos.z));
  }

  spawn(enemy: Enemy, x: number, z: number): Enemy {
    enemy.setPosition(x, z);
    enemy.facing = this.rng.range(-Math.PI, Math.PI);
    this.enemies.push(enemy);
    this.root.add(enemy.object, enemy.healthBar.group);
    return enemy;
  }

  private removeEnemyObjects(e: Enemy): void {
    this.root.remove(e.object, e.healthBar.group);
  }

  private resolvePlayerStrike(): void {
    const { player } = this;
    const w = player.weapon;
    this.events.emit('swing', { ...player.pos });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!inArc(player.pos.x, player.pos.z, player.facing, e.pos.x, e.pos.z, w.range, w.arc, e.radius)) continue;
      const dmg = rollDamage(player.attackStats, e.armor, () => this.rng.next());
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      if (e.applyDamage(dmg.amount, (dx / len) * w.knockback, (dz / len) * w.knockback)) {
        this.events.emit('hit', { x: e.pos.x, z: e.pos.z, amount: dmg.amount, crit: dmg.crit, target: 'enemy' });
        if (!e.alive) this.events.emit('enemyDied', { x: e.pos.x, z: e.pos.z, kind: e.kind });
      }
    }
  }

  private hitPlayer(source: Enemy, attack: AttackStats, knockback: number): void {
    const { player } = this;
    const dmg = rollDamage(attack, player.stats.armor, () => this.rng.next());
    const dx = player.pos.x - source.pos.x;
    const dz = player.pos.z - source.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    if (player.applyDamage(dmg.amount, (dx / len) * knockback, (dz / len) * knockback)) {
      this.events.emit('hit', { x: player.pos.x, z: player.pos.z, amount: dmg.amount, crit: dmg.crit, target: 'player' });
    }
  }

  /** Push overlapping enemies apart and off the player. */
  private separate(): void {
    const { enemies, player, level } = this;
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / 2;
        const nx = d2 > 0 ? dx / d : 1;
        const nz = d2 > 0 ? dz / d : 0;
        level.grid.moveBox(a.pos, -nx * push, -nz * push, a.radius);
        level.grid.moveBox(b.pos, nx * push, nz * push, b.radius);
      }
      if (player.alive && !player.dodging) {
        const dx = a.pos.x - player.pos.x;
        const dz = a.pos.z - player.pos.z;
        const min = a.radius + player.radius;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 0.001) level.grid.moveBox(a.pos, (dx / d) * (min - d), (dz / d) * (min - d), a.radius);
      }
    }
  }
}
