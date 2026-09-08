import type { WeaponId } from "@frankibarber/shared";

export type Rarity = "pospolity" | "rzadki" | "epicki" | "legendarny" | "zloty";
export type MatKey = "metal" | "steel" | "polymer" | "tan" | "wood" | "rubber" | "brass" | "lens";
export type MatRole = "pattern" | "accent" | "trim" | "keep";
export type Params = Record<string, number | string | boolean>;
export interface SkinDef {
  id: string; name: string; rarity: Rarity; generator: string; seed: number; params: Params;
  weapons: "all" | WeaponId[]; mats?: Partial<Record<MatKey, MatRole>>; nsfw?: boolean; blurb: string;
}
export interface SkinInstance { skin: string; wear: number; rolledAt: number }
export interface Palette { base: string; ink: string; accent: string; colors: string[] }
export interface SkinCanvas {
  readonly size: number;
  fill(color: string): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  poly(points: number[], color: string): void;
  circle(x: number, y: number, r: number, color: string): void;
  line(points: number[], color: string, width: number, cap?: "butt" | "round"): void;
  gradient(x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): string;
  text(s: string, x: number, y: number, px: number, color: string, rot?: number): void;
  alpha(a: number): void;
  save(): void; restore(): void;
  translate(x: number, y: number): void; rotate(r: number): void; scale(x: number, y: number): void;
}
export type GeneratorFn = (c: SkinCanvas, rng: () => number, params: Params, palette: Palette) => void;

// Steel carries sights and bolts: preserve their factory contrast. Scope glass is always untouched.
export const DEFAULT_ROLES: Record<MatKey, MatRole> = {
  metal: "pattern", polymer: "pattern", tan: "pattern", wood: "pattern",
  steel: "keep", rubber: "keep", brass: "keep", lens: "keep",
};
export function roleFor(def: SkinDef, mat: MatKey): MatRole { return mat === "lens" ? "keep" : def.mats?.[mat] ?? DEFAULT_ROLES[mat]; }
export function wearName(wear: number): string {
  return wear < .07 ? "Prosto od fryzjera" : wear < .15 ? "Świeżo podcięty" : wear < .38 ? "Po sezonie" : wear < .45 ? "Zapuszczony" : "Zarośnięty";
}
