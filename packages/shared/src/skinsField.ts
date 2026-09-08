import { WEAPON_ORDER } from "./weapons";
import type { WeaponId } from "./weapons";

const validId = /^[a-z0-9-]{1,64}$/;
const weapons = new Set<string>(WEAPON_ORDER);
const MAX_LENGTH = 400;

/** Canonical order and whole-entry truncation keep the single cosmetic field bounded and stable. */
export function encodeSkins(map: Partial<Record<WeaponId, string>>): string {
  const entries: string[] = [];
  for (const weapon of WEAPON_ORDER) {
    const id = map[weapon]; if (typeof id !== "string" || !validId.test(id)) continue;
    const entry = `${weapon}=${id}`;
    if ([...entries, entry].join(",").length > MAX_LENGTH) continue;
    entries.push(entry);
  }
  return entries.join(",");
}
export function decodeSkins(raw: unknown): Partial<Record<WeaponId, string>> {
  const result: Partial<Record<WeaponId, string>> = {};
  if (typeof raw !== "string") return result;
  let bounded = raw.slice(0, MAX_LENGTH);
  if (raw.length > MAX_LENGTH && raw[MAX_LENGTH] !== ",") bounded = bounded.slice(0, Math.max(0, bounded.lastIndexOf(",")));
  for (const entry of bounded.split(",").slice(0, 11)) {
    const pair = entry.split("=");
    if (pair.length === 2 && weapons.has(pair[0]) && validId.test(pair[1])) result[pair[0] as WeaponId] = pair[1];
  }
  return result;
}
export const sanitizeSkins = (raw: unknown): string => encodeSkins(decodeSkins(raw));
