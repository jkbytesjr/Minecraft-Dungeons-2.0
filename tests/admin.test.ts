import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/systems/sha256';
import { checkAdminLogin, intArg, parseCommand } from '../src/systems/admin';

describe('sha256Hex', () => {
  it('matches the standard FIPS 180-2 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // Two-block message.
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
});

describe('admin login', () => {
  it('rejects wrong or empty credentials', () => {
    expect(checkAdminLogin('', '')).toBe(false);
    expect(checkAdminLogin('jkbytes', 'password')).toBe(false);
    expect(checkAdminLogin('admin', 'admin')).toBe(false);
  });
});

describe('parseCommand', () => {
  it('splits name and lower-cased args, ignoring a leading slash and extra spaces', () => {
    expect(parseCommand('  /Give  Weapon MYTHIC 2 ')).toEqual({ name: 'give', args: ['weapon', 'mythic', '2'] });
    expect(parseCommand('heal')).toEqual({ name: 'heal', args: [] });
    expect(parseCommand('   ')).toBeNull();
  });

  it('validates integer arguments', () => {
    expect(intArg('5', 1, 10)).toBe(5);
    expect(intArg('0', 1, 10)).toBeNull();
    expect(intArg('2.5', 1, 10)).toBeNull();
    expect(intArg(undefined, 1, 10)).toBeNull();
  });
});
