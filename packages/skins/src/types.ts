import type { WeaponId } from "@frankibarber/shared";

export type Rarity = "pospolity" | "rzadki" | "epicki" | "legendarny" | "zloty";
export type MatKey = "metal" | "steel" | "polymer" | "tan" | "wood" | "rubber" | "brass" | "lens";
export type MatRole = "pattern" | "accent" | "trim" | "keep";
export type Params = Record<string, number | string | boolean>;
/** Collections group the catalogue in the Armoury and give every skin a small shared mark. */
export type CollectionId = "zaklad" | "barber" | "osiedle" | "monopol" | "zielony" | "masa" | "pogodzinach" | "zlota";
export interface SkinDef {
  id: string; name: string; rarity: Rarity; collection: CollectionId; generator: string; seed: number; params: Params;
  weapons: "all" | WeaponId[]; mats?: Partial<Record<MatKey, MatRole>>; nsfw?: boolean; blurb: string;
}
export interface SkinInstance { skin: string; wear: number; rolledAt: number }
export interface Palette { base: string; ink: string; accent: string; colors: string[] }
/** Which layer a render pass paints: albedo carries everything, emissive only the glowing marks. */
export type SkinPass = "albedo" | "emissive";

export type FontKind = "display" | "sans" | "mono" | "script" | "serif";
export interface TextOpts {
  rot?: number; font?: FontKind; weight?: number; italic?: boolean; align?: "left" | "center" | "right";
  stroke?: string; strokeWidth?: number; maxWidth?: number; spacing?: number;
}
export type BlendMode = "source-over" | "multiply" | "screen" | "overlay" | "lighter" | "soft-light" | "destination-in";

/** The full 2D contract. Every method is recordable, so recipes stay deterministic and testable. */
export interface SkinCanvas {
  readonly size: number;
  readonly width: number;
  readonly height: number;
  fill(color: string): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  poly(points: number[], color: string): void;
  circle(x: number, y: number, r: number, color: string): void;
  ellipse(x: number, y: number, rx: number, ry: number, color: string, rot?: number): void;
  ring(x: number, y: number, r: number, color: string, width: number, from?: number, to?: number): void;
  line(points: number[], color: string, width: number, cap?: "butt" | "round"): void;
  /** Smooth curve through the points (midpoint quadratics). `width` 0 fills the closed shape. */
  curve(points: number[], color: string, width: number, close?: boolean): void;
  gradient(x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): string;
  radial(x: number, y: number, r: number, stops: [number, string][]): string;
  text(s: string, x: number, y: number, px: number, color: string, opts?: TextOpts | number): void;
  clip(points: number[]): void;
  blend(mode: BlendMode): void;
  glow(blurPx: number, color: string): void;
  alpha(a: number): void;
  save(): void; restore(): void;
  translate(x: number, y: number): void; rotate(r: number): void; scale(x: number, y: number): void;
}

/** A side-view rectangle in weapon-root metres: z along the barrel, y up. */
export interface Zone { z0: number; z1: number; y0: number; y1: number }
export interface FramePart { zone: Zone; mat: MatKey; magazine: boolean }
/**
 * Where the weapon sits on its texture. The texture is a side elevation: `u` runs along z from
 * `z0` to `z0 + zSpan`, and two bands stacked in `v` carry the right and left flanks. Zones tell a
 * generator where the receiver, magazine, stock, fore-end and grip are, so a hero illustration can
 * sit on the receiver while the magazine takes a mark and the stock a legend.
 */
export interface SkinFrame {
  weapon: WeaponId;
  width: number; height: number;
  z0: number; zSpan: number;
  y0: number; ySpan: number;
  body: Zone;
  receiver: Zone;
  magazine: Zone | null;
  stock: Zone | null;
  front: Zone | null;
  grip: Zone | null;
  parts: FramePart[];
}
export type Side = "right" | "left";

/** `detail` scales the count of grain, speckle and scratch primitives: a thumbnail needs far fewer. */
export interface RenderContext { frame: SkinFrame; pass: SkinPass; wear: number; weapon: WeaponId; def: SkinDef; scale: number; detail: number }
export type GeneratorFn = (c: SkinCanvas, rng: () => number, params: Params, palette: Palette, ctx: RenderContext) => void;

// Steel carries sights and bolts: preserve their factory contrast. Scope glass is always untouched.
export const DEFAULT_ROLES: Record<MatKey, MatRole> = {
  metal: "pattern", polymer: "pattern", tan: "pattern", wood: "pattern",
  steel: "keep", rubber: "keep", brass: "keep", lens: "keep",
};
export function roleFor(def: SkinDef, mat: MatKey): MatRole { return mat === "lens" ? "keep" : def.mats?.[mat] ?? DEFAULT_ROLES[mat]; }
export function wearName(wear: number): string {
  return wear < .07 ? "Prosto od fryzjera" : wear < .15 ? "Świeżo podcięty" : wear < .38 ? "Po sezonie" : wear < .45 ? "Zapuszczony" : "Zarośnięty";
}
