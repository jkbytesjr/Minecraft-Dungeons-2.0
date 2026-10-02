import type { Item } from '../systems/loot';
import type { PowerId } from '../systems/powers';

/** Minimal typed event bus so audio, particles and HUD can react without coupling. */
export interface GameEvents {
  swing: { x: number; z: number };
  shoot: { x: number; z: number; owner: 'player' | 'enemy' };
  hit: { x: number; z: number; amount: number; crit: boolean; target: 'enemy' | 'player' };
  enemyDied: { x: number; z: number; kind: string; xp: number };
  explosion: { x: number; z: number; radius: number };
  bossEngaged: { name: string };
  bossDefeated: { x: number; z: number };
  slam: { x: number; z: number; radius: number };
  dodge: { x: number; z: number };
  teleport: { x: number; z: number };
  /** A weapon power went off. `points` is the chain-lightning path. */
  power: { id: PowerId; x: number; z: number; radius?: number; points?: { x: number; z: number }[] };
  /** Damage-over-time tick (burning). */
  burnTick: { x: number; z: number; amount: number };
  /** Periodic cue to draw a status effect on an enemy. */
  status: { x: number; z: number; kind: 'burn' | 'chill' | 'freeze' };
  levelUp: { level: number };
  itemPicked: { item: Item };
  potionPicked: Record<string, never>;
  heal: { x: number; z: number; amount: number };
  bagFull: Record<string, never>;
  chestOpened: { x: number; z: number };
  playerDied: Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Handler<never>[]>();

  on<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): void {
    let list = this.handlers.get(type);
    if (!list) this.handlers.set(type, (list = []));
    list.push(handler as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    for (const h of this.handlers.get(type) ?? []) (h as Handler<GameEvents[K]>)(payload);
  }
}
