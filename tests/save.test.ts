import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { STARTER_WEAPON, rollItem } from '../src/systems/loot';
import { SAVE_VERSION, parseSave, serializeSave, validateSave, type RunSave } from '../src/systems/save';

function sample(): RunSave {
  const rng = new Rng(5);
  return {
    version: SAVE_VERSION,
    seed: 777,
    depth: 6,
    runTime: 812.5,
    kills: 143,
    progress: { level: 9, xp: 120, perks: { might: 3, vitality: 2 }, pendingPicks: 1 },
    weapon: rollItem(rng, 6, { kind: 'weapon', minRarity: 'unique' }) as RunSave['weapon'],
    armor: rollItem(rng, 5, { kind: 'armor' }) as RunSave['armor'],
    bag: [rollItem(rng, 4), rollItem(rng, 5)],
    potions: 3,
    savedAt: 1_700_000_000_000,
  };
}

describe('run saves', () => {
  it('round-trips through JSON unchanged', () => {
    const s = sample();
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it('accepts a save with no armor and the starter sword', () => {
    const s = { ...sample(), armor: null, weapon: STARTER_WEAPON };
    expect(validateSave(JSON.parse(serializeSave(s)))).not.toBeNull();
  });

  it('rejects missing, corrupt or foreign data', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('')).toBeNull();
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave('[]')).toBeNull();
    expect(validateSave({ ...sample(), version: 99 })).toBeNull();
    expect(validateSave({ ...sample(), depth: 'six' })).toBeNull();
    expect(validateSave({ ...sample(), weapon: sample().armor })).toBeNull();
    expect(validateSave({ ...sample(), bag: [{ kind: 'potion' }] })).toBeNull();
    expect(validateSave({ ...sample(), progress: { level: 2 } })).toBeNull();
  });
});
