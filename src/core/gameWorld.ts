import * as THREE from 'three';
import { Player, type PlayerInput } from '../entities/player';
import type { Enemy, EnemyContext } from '../entities/enemy';
import { Boss } from '../entities/boss';
import { Portal } from '../entities/portal';
import type { Dungeon } from '../world/dungeonGen';
import { createEnemy } from '../entities/enemyFactory';
import { buildLevelMeshes } from '../world/voxelBuilder';
import { Torches } from '../world/torches';
import { FlowField } from '../systems/flowField';
import { inArc } from '../systems/combat';
import { falloffDamage, rollDamage, type AttackStats } from '../systems/damage';
import { Projectiles, type ProjectileOwner, type ProjectileSpec, type ProjectileTarget } from '../systems/projectiles';
import { Pickup } from '../entities/pickup';
import { Chest } from '../entities/chest';
import { rollDrops, type Drop, type DropSource } from '../systems/loot';
import { Rng } from './rng';
import type { EventBus } from './events';

/** Enemies further than this from the player are frozen and hidden. */
const ACTIVE_RANGE = 30;
const PICKUP_RANGE = 1.0;
const CHEST_RANGE = 1.4;
const SLAM_RADIUS = 3.2;
const VOLLEY_ARROWS = 7;
const VOLLEY_SPREAD = (50 * Math.PI) / 180;

/** Owns everything in the simulation: level, player, enemies, and the rules between them. */
export class GameWorld {
  readonly player = new Player();
  readonly enemies: Enemy[] = [];
  readonly projectiles = new Projectiles();
  readonly pickups: Pickup[] = [];
  readonly chests: Chest[] = [];
  level!: Dungeon;
  portal!: Portal;
  boss: Boss | null = null;
  kills = 0;
  /** Set when the player steps into the active portal. */
  portalReached = false;
  private readonly root = new THREE.Group();
  private levelGroup = new THREE.Group();
  private torches!: Torches;
  private flow!: FlowField;
  private rng = new Rng(1);
  private ctx!: EnemyContext;
  private deathAnnounced = false;
  private readonly focus = new THREE.Vector3();
  private readonly playerTargets: ProjectileTarget[] = [this.player];

  constructor(
    scene: THREE.Scene,
    private readonly events: EventBus,
  ) {
    scene.add(this.root);
    this.root.add(this.player.object, this.projectiles.mesh);
  }

  load(level: Dungeon): void {
    for (const e of this.enemies) this.removeEnemyObjects(e);
    this.enemies.length = 0;
    this.projectiles.clear();
    for (const p of this.pickups) this.root.remove(p.group);
    this.pickups.length = 0;
    this.chests.length = 0;
    this.root.remove(this.levelGroup);
    this.level = level;
    this.rng = new Rng(level.seed * 31 + level.depth);
    this.levelGroup = buildLevelMeshes(level, level.seed + level.depth);
    this.torches = new Torches(level.torches);
    this.portal = new Portal(level.exit.x, level.exit.z);
    this.levelGroup.add(this.torches.group, this.portal.group);
    this.root.add(this.levelGroup);
    this.flow = new FlowField(level.grid);
    this.player.respawn(level.playerStart.x, level.playerStart.z);
    this.deathAnnounced = false;
    this.portalReached = false;
    this.boss = null;
    this.ctx = {
      player: this.player,
      grid: level.grid,
      flow: this.flow,
      rng: this.rng,
      events: this.events,
      hitPlayer: (source, attack, knockback) => this.hitPlayer(source, attack, knockback),
      fireProjectile: (spec) => this.fireProjectile({ ...spec, owner: 'enemy' }),
      explode: (x, z, radius, base, source) => this.explode(x, z, radius, base, source),
      spawnEnemy: (kind, x, z) => this.spawn(createEnemy(kind, level.depth), x, z),
    };
    for (const c of level.chests) {
      const chest = new Chest(c.x, c.z, this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
      this.chests.push(chest);
      this.levelGroup.add(chest.group);
    }
    for (const s of level.spawns) {
      const e = this.spawn(createEnemy(s.kind, level.depth), s.x, s.z);
      if (e instanceof Boss) this.boss = e;
    }
  }

  update(dt: number, input: PlayerInput, camera: THREE.Camera): void {
    const { player, level } = this;
    const wasDodging = player.dodging;
    player.update(dt, input, level.grid);
    if (!wasDodging && player.dodging) this.events.emit('dodge', { ...player.pos });
    if (player.strikeReady) this.resolvePlayerStrike();
    if (player.slamReady) this.resolveSlam();
    if (player.volleyReady) this.resolveVolley();
    if (player.potionHealed > 0) this.events.emit('heal', { ...player.pos, amount: player.potionHealed });
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
    this.projectiles.update(
      dt,
      level.grid,
      (owner) => this.targetsFor(owner),
      (p, t) => this.onProjectileHit(p, t),
    );

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive && !e.deathReported) this.onEnemyDeath(e);
      if (e.removable) {
        this.removeEnemyObjects(e);
        this.enemies.splice(i, 1);
      }
    }

    this.updatePickups(dt);
    for (const c of this.chests) {
      if (!c.opened && player.alive && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < CHEST_RANGE) {
        c.open();
        this.events.emit('chestOpened', { x: c.x, z: c.z });
        this.dropLoot(rollDrops(this.rng, 'chest', level.depth), c.x, c.z);
      }
      c.update(dt);
    }
    this.portal.update(dt);
    if (player.alive && this.portal.contains(player.pos.x, player.pos.z)) this.portalReached = true;
    this.torches.update(dt, this.focus.set(player.pos.x, 0, player.pos.z));
  }

  spawn(enemy: Enemy, x: number, z: number): Enemy {
    enemy.setPosition(x, z);
    enemy.facing = this.rng.range(-Math.PI, Math.PI);
    this.enemies.push(enemy);
    this.root.add(enemy.object, enemy.healthBar.group);
    return enemy;
  }

  fireProjectile(spec: ProjectileSpec): void {
    this.projectiles.fire(spec);
    this.events.emit('shoot', { x: spec.x, z: spec.z, owner: spec.owner });
  }

  /** Deal damage to an enemy from the player; emits hit events. */
  damageEnemy(e: Enemy, attack: AttackStats, fromX: number, fromZ: number, knockback: number): void {
    const dmg = rollDamage(attack, e.armor, () => this.rng.next());
    const dx = e.pos.x - fromX;
    const dz = e.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    if (e.applyDamage(dmg.amount, (dx / len) * knockback, (dz / len) * knockback)) {
      this.events.emit('hit', { x: e.pos.x, z: e.pos.z, amount: dmg.amount, crit: dmg.crit, target: 'enemy' });
      if (this.player.stats.lifeOnHit > 0) this.player.heal(this.player.stats.lifeOnHit);
    }
  }

  private onEnemyDeath(e: Enemy): void {
    e.deathReported = true;
    if (e.rewardsOnDeath) {
      this.kills++;
      this.events.emit('enemyDied', { x: e.pos.x, z: e.pos.z, kind: e.kind, xp: e.xp });
      const levels = this.player.gainXp(e.xp * (1 + 0.5 * this.level.depth));
      if (levels > 0) this.events.emit('levelUp', { level: this.player.progress.level });
      this.dropLoot(rollDrops(this.rng, e.kind as DropSource, this.level.depth), e.pos.x, e.pos.z);
    }
    if (e === this.boss) {
      this.portal.activate();
      // Clear the arena so the player can walk out.
      for (const other of this.enemies) {
        if (other === e || !other.alive) continue;
        other.rewardsOnDeath = false;
        other.applyDamage(99999, 0, 0);
      }
      this.events.emit('bossDefeated', { x: e.pos.x, z: e.pos.z });
    }
  }

  private removeEnemyObjects(e: Enemy): void {
    this.root.remove(e.object, e.healthBar.group);
  }

  private targetsFor(owner: ProjectileOwner): readonly ProjectileTarget[] {
    return owner === 'enemy' ? this.playerTargets : this.enemies;
  }

  private onProjectileHit(p: ProjectileSpec, target: ProjectileTarget): boolean {
    if (p.owner === 'enemy') {
      const dmg = rollDamage(p.attack, this.player.armor, () => this.rng.next());
      // Dodging through arrows is allowed: invulnerable players don't consume them.
      if (!this.player.applyDamage(dmg.amount, p.dirX * p.knockback, p.dirZ * p.knockback)) return false;
      this.events.emit('hit', { ...this.player.pos, amount: dmg.amount, crit: dmg.crit, target: 'player' });
      return true;
    }
    this.damageEnemy(target as Enemy, p.attack, target.pos.x - p.dirX, target.pos.z - p.dirZ, p.knockback);
    return true;
  }

  private dropLoot(drops: Drop[], x: number, z: number): void {
    drops.forEach((d, i) => {
      const p = new Pickup(d, x, z, (i / Math.max(1, drops.length)) * Math.PI * 2 + this.rng.range(0, 1));
      this.pickups.push(p);
      this.root.add(p.group);
    });
  }

  private updatePickups(dt: number): void {
    const { player, level } = this;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt, (x, z) => level.grid.isWalkableAt(x, z));
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if (d > 2) p.warned = false;
      if (!player.alive || d > PICKUP_RANGE || !p.collectible) continue;
      let taken = false;
      if (p.drop.type === 'potion') {
        taken = player.inventory.addPotion();
        if (taken) this.events.emit('potionPicked', {});
      } else if (player.inventory.add(p.drop.item)) {
        taken = true;
        this.events.emit('itemPicked', { item: p.drop.item });
      } else if (!p.warned) {
        p.warned = true;
        this.events.emit('bagFull', {});
      }
      if (taken) {
        this.root.remove(p.group);
        this.pickups.splice(i, 1);
      }
    }
  }

  private resolveSlam(): void {
    const { player } = this;
    this.events.emit('slam', { x: player.pos.x, z: player.pos.z, radius: SLAM_RADIUS });
    const attack = { ...player.attackStats, base: 14 + player.stats.weaponDamage };
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) > SLAM_RADIUS + e.radius) continue;
      this.damageEnemy(e, attack, player.pos.x, player.pos.z, 10);
    }
  }

  private resolveVolley(): void {
    const { player } = this;
    const attack = { ...player.attackStats, base: 4 + player.stats.weaponDamage * 0.6 };
    for (let i = 0; i < VOLLEY_ARROWS; i++) {
      const a = player.facing + (i / (VOLLEY_ARROWS - 1) - 0.5) * VOLLEY_SPREAD;
      this.fireProjectile({
        x: player.pos.x,
        z: player.pos.z,
        dirX: Math.sin(a),
        dirZ: Math.cos(a),
        speed: 18,
        range: 14,
        attack,
        knockback: 3,
        owner: 'player',
      });
    }
  }

  private resolvePlayerStrike(): void {
    const { player } = this;
    const w = player.weapon;
    if (w.kind === 'bow') {
      this.fireProjectile({
        x: player.pos.x + Math.sin(player.facing) * 0.4,
        z: player.pos.z + Math.cos(player.facing) * 0.4,
        dirX: Math.sin(player.facing),
        dirZ: Math.cos(player.facing),
        speed: 20,
        range: w.range,
        attack: player.attackStats,
        knockback: w.knockback,
        owner: 'player',
      });
      return;
    }
    this.events.emit('swing', { ...player.pos });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!inArc(player.pos.x, player.pos.z, player.facing, e.pos.x, e.pos.z, w.range, w.arc, e.radius)) continue;
      this.damageEnemy(e, player.attackStats, player.pos.x, player.pos.z, w.knockback);
    }
  }

  private hitPlayer(source: Enemy, attack: AttackStats, knockback: number): void {
    const { player } = this;
    const dmg = rollDamage(attack, player.armor, () => this.rng.next());
    const dx = player.pos.x - source.pos.x;
    const dz = player.pos.z - source.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    if (player.applyDamage(dmg.amount, (dx / len) * knockback, (dz / len) * knockback)) {
      this.events.emit('hit', { x: player.pos.x, z: player.pos.z, amount: dmg.amount, crit: dmg.crit, target: 'player' });
    }
  }

  private explode(x: number, z: number, radius: number, base: number, source: Enemy): void {
    this.events.emit('explosion', { x, z, radius });
    const p = this.player;
    const pd = Math.hypot(p.pos.x - x, p.pos.z - z);
    const playerDmg = falloffDamage(base, pd, radius + p.radius);
    if (playerDmg > 0) {
      const amount = Math.max(1, Math.round(playerDmg * (100 / (100 + p.armor))));
      const len = pd || 1;
      if (p.applyDamage(amount, ((p.pos.x - x) / len) * 12, ((p.pos.z - z) / len) * 12))
        this.events.emit('hit', { ...p.pos, amount, crit: false, target: 'player' });
    }
    for (const e of this.enemies) {
      if (e === source || !e.alive) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      const amount = Math.round(falloffDamage(base, d, radius + e.radius) * 0.5);
      if (amount > 0 && e.applyDamage(amount, ((e.pos.x - x) / (d || 1)) * 10, ((e.pos.z - z) / (d || 1)) * 10))
        this.events.emit('hit', { ...e.pos, amount, crit: false, target: 'enemy' });
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
