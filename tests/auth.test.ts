import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/modules/auth/password';
import {
  signAccessToken,
  verifyAccessToken,
  generateOpaqueToken,
  hashToken,
  accessTtlSeconds,
} from '../src/modules/auth/token.service';

describe('password hashing (argon2id)', () => {
  it('hashes and verifies the correct password', async () => {
    const h = await hashPassword('Passw0rd!');
    expect(h).toMatch(/^\$argon2/);
    expect(await verifyPassword(h, 'Passw0rd!')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const h = await hashPassword('Passw0rd!');
    expect(await verifyPassword(h, 'not-it')).toBe(false);
  });

  it('produces distinct hashes for the same input (random salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });
});

describe('access tokens (JWT)', () => {
  it('round-trips the payload including both role dimensions', () => {
    const token = signAccessToken({
      sub: 'user-1',
      email: 'a@b.io',
      accountType: 'Owner',
      orgRole: 'Admin',
    });
    const p = verifyAccessToken(token);
    expect(p.sub).toBe('user-1');
    expect(p.accountType).toBe('Owner');
    expect(p.orgRole).toBe('Admin');
    expect(typeof p.iat).toBe('number');
  });

  it('rejects a malformed/tampered token', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow();
  });

  it('has a positive access TTL', () => {
    expect(accessTtlSeconds()).toBeGreaterThan(0);
  });
});

describe('opaque tokens (refresh/invite/reset)', () => {
  it('hashes deterministically to a 64-char sha256 hex', () => {
    const { raw, hash } = generateOpaqueToken();
    expect(hash).toHaveLength(64);
    expect(hashToken(raw)).toBe(hash);
  });

  it('generates unique raw tokens', () => {
    const a = generateOpaqueToken().raw;
    const b = generateOpaqueToken().raw;
    expect(a).not.toBe(b);
  });
});
