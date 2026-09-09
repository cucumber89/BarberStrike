import { WEAPON_ORDER } from "./weapons";
import type { WeaponId } from "./weapons";
import { DEFAULT_BUILD, isBuildId } from "./builds";

const validId = /^[a-z0-9-]{1,64}$/;
const weapons = new Set<string>(WEAPON_ORDER);
const MAX_LENGTH = 400;
/**
 * The body build rides in the SAME field as the weapon finishes, under a key that is not a weapon.
 *
 * The alternative was a second `PlayerState` field, and it was not worth one: this field is written
 * on join and on nothing else, it is already bounded and already sanitised on the way in, and one
 * more entry in it costs about ten bytes ONCE per player per match against a 20 Hz patch stream. A
 * new schema field would have cost a wire key on every player forever, for a string that changes as
 * often as a nickname does.
 *
 * Old clients are unaffected: `decodeSkins` has always dropped entries whose key is not a weapon, so
 * a build entry read by a build that predates builds is simply not there.
 */
const BUILD_KEY = "body";
/** Eleven weapons plus the build. Whole entries beyond this are dropped rather than truncated. */
const MAX_ENTRIES = WEAPON_ORDER.length + 1;

/** What one player's cosmetic field says: a finish per weapon, and the body they picked. */
export interface Cosmetics {
  skins: Partial<Record<WeaponId, string>>;
  build: string;
}

/**
 * Canonical order and whole-entry truncation keep the single cosmetic field bounded and stable.
 *
 * The build goes FIRST, so a field that ever did run up against `MAX_LENGTH` would lose a weapon
 * finish rather than the body — a player missing one gun's paint reads as a bug in the paint; a
 * player whose body changed shape reads as a different person.
 */
export function encodeCosmetics(map: Partial<Record<WeaponId, string>>, build = DEFAULT_BUILD): string {
  const entries: string[] = [];
  if (isBuildId(build) && build !== DEFAULT_BUILD) entries.push(`${BUILD_KEY}=${build}`);
  for (const weapon of WEAPON_ORDER) {
    const id = map[weapon]; if (typeof id !== "string" || !validId.test(id)) continue;
    const entry = `${weapon}=${id}`;
    if ([...entries, entry].join(",").length > MAX_LENGTH) continue;
    entries.push(entry);
  }
  return entries.join(",");
}

export function decodeCosmetics(raw: unknown): Cosmetics {
  const skins: Partial<Record<WeaponId, string>> = {};
  let build = DEFAULT_BUILD;
  if (typeof raw !== "string") return { skins, build };
  let bounded = raw.slice(0, MAX_LENGTH);
  if (raw.length > MAX_LENGTH && raw[MAX_LENGTH] !== ",") bounded = bounded.slice(0, Math.max(0, bounded.lastIndexOf(",")));
  for (const entry of bounded.split(",").slice(0, MAX_ENTRIES)) {
    const pair = entry.split("=");
    if (pair.length !== 2 || !validId.test(pair[1])) continue;
    if (pair[0] === BUILD_KEY) { if (isBuildId(pair[1])) build = pair[1]; continue; }
    if (weapons.has(pair[0])) skins[pair[0] as WeaponId] = pair[1];
  }
  return { skins, build };
}

export const encodeSkins = (map: Partial<Record<WeaponId, string>>): string => encodeCosmetics(map);
export const decodeSkins = (raw: unknown): Partial<Record<WeaponId, string>> => decodeCosmetics(raw).skins;
export const decodeBuild = (raw: unknown): string => decodeCosmetics(raw).build;
/** Re-encoding is the validation: an unknown build id or a forged entry cannot survive the round trip. */
export const sanitizeSkins = (raw: unknown): string => {
  const { skins, build } = decodeCosmetics(raw);
  return encodeCosmetics(skins, build);
};
