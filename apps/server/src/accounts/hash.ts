/**
 * Password hashing (V / drop H, P4): scrypt from `node:crypto`, zero dependencies (project B).
 *
 * Stored form is `scrypt$<saltHex>$<hashHex>` with a per-account random salt. Verification derives
 * the key from the presented password and the stored salt, then compares in constant time with
 * `timingSafeEqual` so a wrong password and a wrong length both take the same shape of time.
 */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const SALT_BYTES = 16;

/** Hash `password` into the storable `scrypt$salt$hash` string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** True when `password` matches `stored` (a `scrypt$salt$hash` string). Constant-time on the digest. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
