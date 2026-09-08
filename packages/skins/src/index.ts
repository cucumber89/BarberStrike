import { hashString, mulberry32, type WeaponId } from "@frankibarber/shared";
import { catalog } from "./catalog";
import { baseFinish, grain, numberParam, paletteFor, wearMask } from "./layers";
import { solid } from "./generators/solid";
import { stripes } from "./generators/stripes";
import type { GeneratorFn, MatRole, SkinCanvas, SkinDef } from "./types";
export * from "./types";
export * from "./canvas";
export { catalog, paletteFor };
export const GENERATORS: Readonly<Record<string, GeneratorFn>> = { solid, stripes };
export const skinById = (id: string): SkinDef | undefined => catalog.find(s => s.id === id);
export const fitsWeapon = (skin: SkinDef, weapon: WeaponId): boolean => skin.weapons === "all" || skin.weapons.includes(weapon);

/** Recipe order is versioned by golden hashes: finish → pattern → wear → grain. No DOM or clock. */
export function renderSkin(def: SkinDef, weapon: WeaponId, role: MatRole, c: SkinCanvas, wear = 0): void {
  if (role === "keep") return;
  const generator = GENERATORS[def.generator]; if (!generator) throw new Error(`Unknown generator: ${def.generator}`);
  const rng = mulberry32(def.seed ^ hashString(weapon)); const palette = paletteFor(def.params);
  c.save(); c.scale(c.size / 256, c.size / 256);
  if (role === "trim") c.rect(0, 0, 256, 256, palette.accent);
  else {
    baseFinish(c, def.params, palette);
    if (role === "pattern") generator(c, rng, def.params, palette);
    wearMask(c, rng, Math.max(0, Math.min(1, wear)));
    grain(c, rng, numberParam(def.params, "grain", .22));
  }
  c.restore();
}
