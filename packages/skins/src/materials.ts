import type { Brush } from "./brush";
import { alpha, mix, shade } from "./color";
import type { FramePart, MatKey, Zone } from "./types";

export type MaterialKind = "lacquer" | "steel" | "polymer" | "wood" | "chrome" | "carbon" | "concrete" | "gold" | "cloth" | "paper" | "rubber" | "neon";
export const MATERIALS: readonly MaterialKind[] = ["lacquer", "steel", "polymer", "wood", "chrome", "carbon", "concrete", "gold", "cloth", "paper", "rubber", "neon"];
export const materialKind = (v: unknown): MaterialKind => (MATERIALS as readonly string[]).includes(String(v)) ? v as MaterialKind : "lacquer";

/**
 * Base finishes. Every one paints the full zone, then adds the marks that make it read as that
 * material on a flat side view: brushing on steel, grain on wood, weave on carbon, pores in concrete.
 * Density is in local units, so the look holds at thumbnail and texture resolution alike.
 */
export function paintMaterial(b: Brush, z: Zone, kind: MaterialKind, color: string, rng: () => number, detail = 1): void {
  const w = z.z1 - z.z0, h = z.y1 - z.y0, n = (count: number) => Math.ceil(count * detail);
  b.save(); b.clipZone(z);
  switch (kind) {
    case "steel": {
      b.zone(z, b.gradient(z.z0, z.y1, z.z0, z.y0, [[0, shade(color, .18)], [.5, color], [1, shade(color, -.2)]]));
      b.alpha(.28);
      for (let i = 0; i < n(260); i++) {
        const y = z.y0 + rng() * h, x = z.z0 + rng() * w, len = w * (.05 + rng() * .35);
        b.line([x, y, x + len, y], rng() < .5 ? shade(color, .35) : shade(color, -.35), .0006 + rng() * .0012);
      }
      break;
    }
    case "chrome": {
      b.zone(z, b.gradient(z.z0, z.y1, z.z0, z.y0, [[0, "#f6f8fb"], [.38, shade(color, .3)], [.5, shade(color, -.55)], [.53, shade(color, .05)], [.8, shade(color, -.25)], [1, "#dfe5ec"]]));
      b.alpha(.35);
      for (let i = 0; i < 8; i++) { const y = z.y0 + rng() * h; b.line([z.z0, y, z.z1, y + (rng() - .5) * h * .1], "#ffffff", h * (.003 + rng() * .01)); }
      break;
    }
    case "gold": {
      b.zone(z, b.gradient(z.z0, z.y1, z.z1, z.y0, [[0, shade(color, .45)], [.3, color], [.55, shade(color, -.3)], [.7, shade(color, .1)], [1, shade(color, -.45)]]));
      b.alpha(.25);
      for (let i = 0; i < n(140); i++) { const y = z.y0 + rng() * h, x = z.z0 + rng() * w; b.line([x, y, x + w * .1 * rng(), y], "#fff6cf", .0005 + rng() * .0008); }
      break;
    }
    case "wood": {
      b.zone(z, b.gradient(z.z0, z.y0, z.z0, z.y1, [[0, shade(color, -.12)], [.5, shade(color, .06)], [1, shade(color, -.08)]]));
      const rings = 12 + Math.floor(rng() * 8);
      for (let i = 0; i < rings; i++) {
        const y = z.y0 + (i + rng() * .6) / rings * h, pts: number[] = [];
        for (let x = z.z0 - .01; x <= z.z1 + .01; x += Math.max(.004, w / 24)) pts.push(x, y + Math.sin((x - z.z0) * 60 + i) * h * .025 + (rng() - .5) * h * .01);
        b.alpha(.45 + rng() * .3); b.curve(pts, shade(color, -.42), h * (.006 + rng() * .012));
      }
      b.alpha(.35);
      for (let i = 0; i < 3; i++) { const x = z.z0 + w * (.2 + rng() * .6), y = z.y0 + h * (.25 + rng() * .5); b.ellipse(x, y, h * .06, h * .035, shade(color, -.5)); b.ring(x, y, h * .09, shade(color, -.35), h * .008); }
      break;
    }
    case "carbon": {
      b.zone(z, shade(color, -.1));
      const s = Math.max(.003, Math.min(w, h) / 22);
      for (let y = z.y0, row = 0; y < z.y1; y += s, row++) for (let x = z.z0 + (row % 2 ? s / 2 : 0); x < z.z1; x += s * 2) b.rect(x, y, s * .92, s * .92, shade(color, .18));
      b.alpha(.3); b.zone(z, b.gradient(z.z0, z.y1, z.z1, z.y0, [[0, "#ffffff"], [.5, "#000000"], [1, "#ffffff"]]));
      break;
    }
    case "concrete": {
      b.zone(z, color);
      b.alpha(.35);
      for (let i = 0; i < n(420); i++) b.circle(z.z0 + rng() * w, z.y0 + rng() * h, .0006 + rng() * .0025, rng() < .6 ? shade(color, -.35) : shade(color, .3));
      b.alpha(.5);
      for (let i = 0; i < 4; i++) {
        const pts: number[] = []; let x = z.z0 + rng() * w, y = z.y0 + rng() * h;
        for (let k = 0; k < 6; k++) { pts.push(x, y); x += (rng() - .3) * w * .1; y += (rng() - .5) * h * .3; }
        b.line(pts, shade(color, -.55), .0008);
      }
      break;
    }
    case "polymer": {
      b.zone(z, color);
      b.alpha(.22);
      for (let i = 0; i < n(700); i++) b.rect(z.z0 + rng() * w, z.y0 + rng() * h, .0009, .0009, rng() < .5 ? shade(color, .3) : shade(color, -.4));
      b.alpha(.16); b.zone(z, b.gradient(z.z0, z.y1, z.z0, z.y0, [[0, "#ffffff"], [1, "#000000"]]));
      break;
    }
    case "rubber": {
      b.zone(z, shade(color, -.15));
      const s = Math.max(.003, h / 10);
      b.alpha(.45);
      for (let y = z.y0; y < z.y1; y += s) for (let x = z.z0; x < z.z1; x += s) b.circle(x + s / 2, y + s / 2, s * .22, shade(color, -.5));
      break;
    }
    case "cloth": {
      b.zone(z, color);
      b.alpha(.25);
      const s = Math.max(.002, h / 40);
      for (let y = z.y0; y < z.y1; y += s * 2) b.line([z.z0, y, z.z1, y], shade(color, -.35), s * .6);
      for (let x = z.z0; x < z.z1; x += s * 2) b.line([x, z.y0, x, z.y1], shade(color, .2), s * .5);
      break;
    }
    case "paper": {
      b.zone(z, color);
      b.alpha(.18);
      for (let i = 0; i < n(300); i++) b.circle(z.z0 + rng() * w, z.y0 + rng() * h, .0005 + rng() * .002, shade(color, -.25));
      break;
    }
    case "neon": {
      b.zone(z, b.gradient(z.z0, z.y1, z.z0, z.y0, [[0, shade(color, .05)], [1, shade(color, -.35)]]));
      b.alpha(.2);
      const s = Math.max(.006, h / 6);
      for (let x = z.z0; x < z.z1; x += s) b.line([x, z.y0, x, z.y1], shade(color, .45), .0006);
      for (let y = z.y0; y < z.y1; y += s) b.line([z.z0, y, z.z1, y], shade(color, .45), .0006);
      break;
    }
    default: { // lacquer
      b.zone(z, b.gradient(z.z0, z.y1, z.z0, z.y0, [[0, shade(color, .16)], [.45, color], [1, shade(color, -.22)]]));
      b.alpha(.16); b.zone(z, b.gradient(z.z0, z.y0, z.z1, z.y1, [[0, "#000000"], [.5, "#ffffff"], [1, "#000000"]]));
    }
  }
  b.restore();
}

/** What a part's own material looks like when the recipe does not repaint it. */
const PART_TINT: Partial<Record<MatKey, { kind: MaterialKind; tint: number }>> = {
  polymer: { kind: "polymer", tint: -.22 }, tan: { kind: "polymer", tint: -.1 }, wood: { kind: "wood", tint: -.05 }, rubber: { kind: "rubber", tint: -.3 }, metal: { kind: "lacquer", tint: .04 },
};

/**
 * Parts keep telling their material apart: a polymer grip stays matte and darker than the steel
 * receiver it hangs from, wood stays wood. `strength` 0 leaves the base finish alone everywhere.
 */
export function paintPartMaterials(b: Brush, parts: readonly FramePart[], base: MaterialKind, color: string, strength: number, rng: () => number, woodColor = "#6a4529", detail = 1): void {
  if (strength <= 0) return;
  for (const part of parts) {
    const spec = PART_TINT[part.mat]; if (!spec || spec.kind === base) continue;
    if (part.mat === "wood") { b.save(); b.alpha(Math.min(1, strength)); paintMaterial(b, part.zone, "wood", mix(color, woodColor, .55), rng, detail); b.restore(); continue; }
    b.save(); b.alpha(Math.min(1, strength * .9));
    paintMaterial(b, part.zone, spec.kind, shade(color, spec.tint), rng, detail);
    b.restore();
  }
}

/** A soft bevel on every part edge in the side view: what makes stacked boxes read as machined parts. */
export function paintPartEdges(b: Brush, parts: readonly FramePart[], strength: number): void {
  if (strength <= 0) return;
  b.save();
  for (const { zone: z } of parts) {
    const t = Math.min(.0025, (z.y1 - z.y0) * .12);
    b.alpha(.35 * strength); b.rect(z.z0, z.y1 - t, z.z1 - z.z0, t, "#ffffff");
    b.alpha(.45 * strength); b.rect(z.z0, z.y0, z.z1 - z.z0, t, "#000000");
    b.alpha(.25 * strength); b.rect(z.z0, z.y0, t * .8, z.y1 - z.y0, "#000000"); b.rect(z.z1 - t * .8, z.y0, t * .8, z.y1 - z.y0, "#000000");
  }
  b.restore();
}

export const shadowColor = (color: string, a = .5): string => alpha(shade(color, -.7), a);
