import { hashString, mulberry32, type WeaponId } from "@frankibarber/shared";
import { catalog, COLLECTIONS, collectionName } from "./catalog";
import { genericFrame } from "./frame";
import { paletteFor } from "./layers";
import { layered } from "./generators/layered";
import type { GeneratorFn, MatRole, SkinCanvas, SkinDef, SkinFrame, SkinPass } from "./types";
export * from "./types";
export * from "./canvas";
export * from "./frame";
export { motifNames, MOTIFS } from "./motifs";
export { PATTERNS } from "./patterns";
export { MATERIALS } from "./materials";
export { catalog, COLLECTIONS, collectionName, paletteFor };
export const GENERATORS: Readonly<Record<string, GeneratorFn>> = { layered };
export const skinById = (id: string): SkinDef | undefined => catalog.find(s => s.id === id);
export const fitsWeapon = (skin: SkinDef, weapon: WeaponId): boolean => skin.weapons === "all" || skin.weapons.includes(weapon);

export interface RenderOptions {
  /** Where the weapon sits on the texture; the generic rifle layout when the caller has no model. */
  frame?: SkinFrame;
  /** `albedo` paints the finish; `emissive` paints only what should glow, on black. */
  pass?: SkinPass;
}

/**
 * Paints one skin for one weapon onto `c`. The canvas may be any size: the frame's texture size is
 * the design resolution and the drawing scales to the canvas width. No DOM, clock or `Math.random`
 * is touched, so the same recipe records the same operation stream everywhere.
 */
export function renderSkin(def: SkinDef, weapon: WeaponId, role: MatRole, c: SkinCanvas, wear = 0, options: RenderOptions = {}): void {
  if (role === "keep") return;
  const generator = GENERATORS[def.generator]; if (!generator) throw new Error(`Unknown generator: ${def.generator}`);
  const rng = mulberry32(def.seed ^ hashString(weapon)); const palette = paletteFor(def.params);
  const frame = options.frame ?? genericFrame(weapon);
  const pass = options.pass ?? "albedo";
  if (role !== "pattern") { c.rect(0, 0, c.width, c.height, role === "trim" ? palette.accent : palette.base); return; }
  const scale = c.width / frame.width;
  // A 300 px card does not need 1400 grains: primitive counts follow the output size, never the look.
  const detail = Math.min(1, Math.max(.12, scale * 2.2));
  generator(c, rng, def.params, palette, { frame, pass, wear: Math.max(0, Math.min(1, wear)), weapon, def, scale, detail });
}
