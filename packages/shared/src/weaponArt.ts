import type { WeaponId } from "./weapons";

/**
 * Metadata for the ONE static three-quarter shop portrait each weapon gets (`apps/client/src/assets/
 * weapons/<id>.png`, rendered by `apps/client/e2e/tools/weapon-icons.mjs` from the same procedural
 * geometry the game builds — `weaponMeshes.ts`). The renderer reads this so the fourteen icons share
 * a look: same 3/4 angle, same light, each framed to its own length so a pistol is not lost in a
 * sniper's canvas.
 *
 * This lives in `shared` (not the client) because it is data about a weapon, keyed by `WeaponId`,
 * with no React or Babylon in it — the same reason the balance table does. The client's `shopArt`
 * component and the render tool both import it; nothing here depends on a browser.
 *
 * Frame: the world the renderer builds has +Z = barrel, +Y up, origin at the grip (the local frame
 * of `buildWeaponModel`). The camera looks at the weapon's centre from front-upper-left, the classic
 * catalogue 3/4 that shows the side profile AND the top rail. `yawDeg`/`pitchDeg` are that camera's
 * orbit; `zoom` scales the fitted distance (1 = exactly framed, >1 pulls back to leave margin).
 */
export interface WeaponArt {
  /** Orbit yaw of the camera around +Y, degrees. 0 looks down −Z (muzzle points left/away). */
  readonly yawDeg: number;
  /** Orbit pitch above the horizon, degrees. A shallow top-down so the rail reads. */
  readonly pitchDeg: number;
  /** Margin factor on the auto-fit distance: >1 leaves air around a short weapon. */
  readonly zoom: number;
  /** The colour behind the silhouette in the icon (kept transparent in the PNG; used by previews). */
  readonly tint: string;
}

/** The shared default: a barbershop-catalogue 3/4 from front-upper-left. */
const CATALOGUE: Omit<WeaponArt, "zoom"> = { yawDeg: 34, pitchDeg: 22, tint: "#c8a24a" };

/**
 * Per-weapon framing. Longs (rifles, LMG, sniper, launcher) sit further back so the whole barrel
 * fits; the pistols and the clippers pull in so they are not a speck in the middle of a wide sheet.
 * The `zoom` numbers were picked so every silhouette fills a comparable share of its own canvas.
 */
export const WEAPON_ART: Record<WeaponId, WeaponArt> = {
  pistol: { ...CATALOGUE, zoom: 1.12 },
  revolver: { ...CATALOGUE, zoom: 1.12 },
  machinepistol: { ...CATALOGUE, zoom: 1.16 },
  smg: { ...CATALOGUE, zoom: 1.2 },
  smg2: { ...CATALOGUE, zoom: 1.2 },
  carbine: { ...CATALOGUE, zoom: 1.24 },
  rifle: { ...CATALOGUE, zoom: 1.28 },
  lmg: { ...CATALOGUE, zoom: 1.3 },
  shotgun: { ...CATALOGUE, zoom: 1.26 },
  autoshotgun: { ...CATALOGUE, zoom: 1.26 },
  dmr: { ...CATALOGUE, zoom: 1.3 },
  sniper: { ...CATALOGUE, zoom: 1.34 },
  launcher: { ...CATALOGUE, zoom: 1.24 },
  clippers: { ...CATALOGUE, zoom: 1.08 },
};

/** The fourteen weapons that get a rendered portrait, in shop order. */
export const WEAPON_ART_IDS = Object.keys(WEAPON_ART) as WeaponId[];

/** The asset path a built icon lives at, relative to the client's `src` (for the bundler's `import`). */
export const weaponArtPath = (id: WeaponId): string => `./assets/weapons/${id}.png`;
