import { hash, verify } from '@node-rs/argon2';

/** argon2id parameters (OWASP-recommended baseline) — PLAN.md §12.4. */
const OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}
