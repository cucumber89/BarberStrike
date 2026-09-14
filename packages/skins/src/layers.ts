import type { Palette, Params } from "./types";

export const numberParam = (p: Params, key: string, fallback: number): number => typeof p[key] === "number" && Number.isFinite(p[key]) ? p[key] as number : fallback;
export const stringParam = (p: Params, key: string, fallback = ""): string => typeof p[key] === "string" ? p[key] as string : fallback;
export const listParam = (p: Params, key: string): string[] => stringParam(p, key).split(",").map(s => s.trim()).filter(Boolean);
/**
 * Colour slots, comma separated because params stay scalar JSON: base material, ink, accent, light,
 * extra. Missing slots fall back to sensible neighbours so a three-colour recipe still renders.
 */
export function paletteFor(params: Params): Palette {
  const colors = String(params.colors ?? "#e8e2d6,#c8102e,#0a3d91").split(",").map(s => s.trim());
  return { base: String(params.color ?? colors[0]), ink: colors[1] ?? "#141414", accent: colors[2] ?? colors[1] ?? "#d9a453", colors };
}
