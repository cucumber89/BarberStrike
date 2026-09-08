import type { Palette, Params, SkinCanvas } from "./types";

export const numberParam = (p: Params, key: string, fallback: number): number => typeof p[key] === "number" && Number.isFinite(p[key]) ? p[key] as number : fallback;
export function paletteFor(params: Params): Palette {
  // A comma-separated string keeps recipes within the stable scalar-only JSON contract.
  const colors = String(params.colors ?? "#e8e2d6,#c8102e,#0a3d91").split(",");
  return { base: String(params.color ?? colors[0]), ink: colors[1] ?? "#141414", accent: colors[2] ?? colors[1] ?? "#d9a453", colors };
}
export function baseFinish(c: SkinCanvas, params: Params, palette: Palette): void {
  c.rect(0, 0, 256, 256, palette.base);
  const sheen = params.finish === "połysk" ? .19 : params.finish === "anodowany" ? .13 : .06;
  c.save(); c.alpha(sheen);
  c.rect(0, 0, 256, 256, c.gradient(0, 0, 256, 256, [[0, "#000000"], [.45, "#ffffff"], [1, "#000000"]])); c.restore();
}
export function grain(c: SkinCanvas, rng: () => number, strength: number): void {
  c.save(); c.alpha(Math.max(0, Math.min(1, strength)) * .16);
  for (let i = 0; i < 1800; i++) c.rect(rng() * 256, rng() * 256, .2 + rng() * .5, .15 + rng() * .6, rng() < .5 ? "#ffffff" : "#11151a");
  c.restore();
}
export function wearMask(c: SkinCanvas, rng: () => number, wear: number): void {
  c.save(); c.alpha(.55);
  for (let i = 0; i < Math.floor(wear * 650); i++) {
    const x = rng() * 256, y = rng() * 256;
    if (Math.min(x, y, 256 - x, 256 - y) < 10 + rng() * 20) c.line([x, y, x + rng() * 6, y + rng() * 1.8], "#88959e", .2 + rng() * .6);
  }
  c.restore();
}
