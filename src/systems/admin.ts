/**
 * Admin (cheat) commands and the credential check guarding them. Pure logic,
 * unit-tested.
 *
 * Only a salted SHA-256 of "salt:user:password" is stored here, never the
 * password. This is a single-player browser game, so this keeps casual players
 * out of the admin console; it can't stop someone editing the code in their
 * own browser.
 */
import { sha256Hex } from './sha256';

const ADMIN_SALT = '3b335731fbf7cbfddcb243120b4d884a';
const ADMIN_HASH = '8f7ffe4a8935fdb091c33f7f323b71c4c57c8bd9fe4c5f74f21c5f5d02fd3e1c';

export function checkAdminLogin(user: string, password: string): boolean {
  return sha256Hex(`${ADMIN_SALT}:${user.trim()}:${password}`) === ADMIN_HASH;
}

/** Proof of a successful login kept for the browser tab (not the password). */
export const ADMIN_SESSION_TOKEN = sha256Hex(`${ADMIN_HASH}:session`);

export interface CommandSpec {
  name: string;
  args: string;
  help: string;
}

export const COMMANDS: CommandSpec[] = [
  { name: 'help', args: '', help: 'List commands' },
  { name: 'god', args: '[on|off]', help: 'Toggle invulnerability' },
  { name: 'heal', args: '', help: 'Restore full HP' },
  { name: 'level', args: '<n>', help: 'Set character level, up to 1000 for admins (queues attribute picks)' },
  { name: 'xp', args: '<n>', help: 'Add XP' },
  { name: 'give', args: '<weapon|armor> [common|rare|unique|mythic] [count]', help: 'Put items in your bag' },
  { name: 'admingear', args: '[sword|spear|bow|armor|all]', help: 'Equip admin gear: every stat maxed, every power (only obtainable here)' },
  { name: 'potions', args: '<n>', help: 'Set potion count' },
  { name: 'spawn', args: '<enemy|mod-variant-id> [count]', help: 'Spawn enemies next to you' },
  { name: 'mods', args: '', help: 'List loaded mods' },
  { name: 'perk', args: '<name> [ranks]', help: 'Add attribute ranks (e.g. perk might 3), or perk ascendance for every attribute at rank 100' },
  { name: 'floor', args: '<n>', help: 'Jump to floor n' },
  { name: 'boss', args: '', help: 'Teleport next to this floor’s boss' },
  { name: 'portal', args: '', help: 'Open the portal and step into it' },
  { name: 'killall', args: '', help: 'Kill every enemy on the floor except the boss' },
  { name: 'speed', args: '<multiplier>', help: 'Movement speed multiplier (1 = normal)' },
  { name: 'reveal', args: '', help: 'Reveal the whole minimap' },
  { name: 'seed', args: '<n>', help: 'Start a new run on seed n' },
  { name: 'save', args: '', help: 'Save the run now' },
  { name: 'logout', args: '', help: 'End the admin session' },
];

export interface ParsedCommand {
  name: string;
  args: string[];
}

/** Split "give weapon mythic 2" into a command name and arguments. */
export function parseCommand(line: string): ParsedCommand | null {
  const parts = line.trim().replace(/^\//, '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return { name: parts[0].toLowerCase(), args: parts.slice(1).map((a) => a.toLowerCase()) };
}

/** Parse a whole number argument within bounds; null if missing or invalid. */
export function intArg(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || !/^-?\d+$/.test(value)) return null;
  const n = Number.parseInt(value, 10);
  return n >= min && n <= max ? n : null;
}
