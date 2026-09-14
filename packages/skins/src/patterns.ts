import type { Brush } from "./brush";
import { shade } from "./color";
import type { Zone } from "./types";

export type PatternKind = "stripes" | "chevron" | "hazard" | "camo" | "hex" | "checker" | "dots" | "flames" | "waves" | "bricks" | "plaid" | "leopard" | "zebra" | "circuit" | "helix" | "folk" | "rays" | "grid" | "splatter" | "scales" | "none";
export const PATTERNS: readonly PatternKind[] = ["stripes", "chevron", "hazard", "camo", "hex", "checker", "dots", "flames", "waves", "bricks", "plaid", "leopard", "zebra", "circuit", "helix", "folk", "rays", "grid", "splatter", "scales", "none"];
export const patternKind = (v: unknown): PatternKind => (PATTERNS as readonly string[]).includes(String(v)) ? v as PatternKind : "none";

export interface PatternStyle { colors: string[]; scale: number; angle: number; alpha: number }

/**
 * Secondary surface patterns. They are always confined to a zone (the stock, the fore-end, a band)
 * so that a pattern supports the hero illustration instead of flooding the weapon. `scale` is the
 * feature size relative to the zone height.
 */
export function paintPattern(b: Brush, z: Zone, kind: PatternKind, style: PatternStyle, rng: () => number): void {
  if (kind === "none") return;
  const w = z.z1 - z.z0, h = z.y1 - z.y0, cz = (z.z0 + z.z1) / 2, cy = (z.y0 + z.y1) / 2;
  const s = Math.max(.004, h * style.scale);
  const col = (i: number) => style.colors[i % style.colors.length];
  const reach = Math.hypot(w, h);
  b.save(); b.clipZone(z); b.alpha(style.alpha);
  switch (kind) {
    case "stripes": case "helix": {
      b.translate(cz, cy); b.rotate(style.angle);
      let i = 0;
      for (let y = -reach; y < reach; y += s) {
        b.rect(-reach, y, reach * 2, s * .55, col(i++));
        if (kind === "helix") { b.alpha(style.alpha * .5); b.rect(-reach, y + s * .55, reach * 2, s * .12, "#ffffff"); b.alpha(style.alpha); }
      }
      break;
    }
    case "chevron": {
      const cw = s * 2;
      for (let x = z.z0 - cw, i = 0; x < z.z1 + cw; x += cw, i++) for (let y = z.y0 - s; y < z.y1 + s; y += s * 1.5) b.poly([x, y, x + cw / 2, y + s * .75, x + cw, y, x + cw, y + s * .5, x + cw / 2, y + s * 1.25, x, y + s * .5], col(i));
      break;
    }
    case "hazard": {
      b.translate(cz, cy); b.rotate(-Math.PI / 4);
      for (let y = -reach, i = 0; y < reach; y += s, i++) b.rect(-reach, y, reach * 2, s, i % 2 ? col(0) : col(1));
      break;
    }
    case "camo": {
      for (let i = 0; i < 26; i++) {
        const x = z.z0 + rng() * w, y = z.y0 + rng() * h, pts: number[] = [];
        const n = 5 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const r = s * (1.2 + rng() * 1.4); pts.push(x + Math.cos(a) * r * 1.9, y + Math.sin(a) * r); }
        b.curve(pts, col(i), 0, true);
      }
      break;
    }
    case "hex": {
      const r = s * .6;
      for (let y = z.y0 - r, row = 0; y < z.y1 + r; y += r * 1.55, row++) for (let x = z.z0 - r + (row % 2 ? r * .9 : 0); x < z.z1 + r; x += r * 1.8) {
        const pts: number[] = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; pts.push(x + Math.cos(a) * r * .86, y + Math.sin(a) * r * .86); }
        b.poly(pts, col(row + Math.round((x - z.z0) / (r * 1.8))));
      }
      break;
    }
    case "checker": {
      for (let y = z.y0, row = 0; y < z.y1; y += s, row++) for (let x = z.z0, colI = 0; x < z.z1; x += s, colI++) if ((row + colI) % 2 === 0) b.rect(x, y, s, s, col(0));
      break;
    }
    case "dots": {
      for (let y = z.y0 + s / 2, row = 0; y < z.y1; y += s, row++) for (let x = z.z0 + (row % 2 ? s : s / 2); x < z.z1; x += s) b.circle(x, y, s * .28, col(row));
      break;
    }
    case "flames": {
      for (let x = z.z0 - s, i = 0; x < z.z1 + s; x += s * .9, i++) {
        const tall = h * (.55 + rng() * .45), lean = s * (rng() - .2);
        b.curve([x - s * .6, z.y0, x - s * .3, z.y0 + tall * .5, x + lean, z.y0 + tall, x + s * .35, z.y0 + tall * .45, x + s * .6, z.y0], col(0), 0, true);
        b.curve([x - s * .35, z.y0, x - s * .15, z.y0 + tall * .35, x + lean * .6, z.y0 + tall * .62, x + s * .2, z.y0 + tall * .3, x + s * .35, z.y0], col(1), 0, true);
      }
      break;
    }
    case "waves": {
      for (let y = z.y0 - s, i = 0; y < z.y1 + s; y += s * .8, i++) {
        const pts: number[] = []; for (let x = z.z0 - s; x <= z.z1 + s; x += s * .5) pts.push(x, y + Math.sin(x / s * 1.6 + i) * s * .3);
        b.curve(pts, col(i), s * .18);
      }
      break;
    }
    case "bricks": {
      const bw = s * 2.1, bh = s;
      for (let y = z.y0, row = 0; y < z.y1; y += bh, row++) for (let x = z.z0 - (row % 2 ? bw / 2 : 0); x < z.z1; x += bw) b.rect(x + bh * .08, y + bh * .08, bw - bh * .16, bh - bh * .16, col(row + Math.round(rng() * .6)));
      break;
    }
    case "plaid": {
      for (let y = z.y0, i = 0; y < z.y1; y += s * 1.5, i++) b.rect(z.z0, y, w, s * .7, col(i));
      for (let x = z.z0, i = 0; x < z.z1; x += s * 1.5, i++) b.rect(x, z.y0, s * .7, h, col(i + 1));
      break;
    }
    case "leopard": {
      for (let i = 0; i < 60; i++) {
        const x = z.z0 + rng() * w, y = z.y0 + rng() * h, r = s * (.35 + rng() * .35);
        b.ellipse(x, y, r * 1.2, r, col(0), rng() * Math.PI); b.ellipse(x + r * .2, y + r * .1, r * .7, r * .55, col(1), rng() * Math.PI);
      }
      break;
    }
    case "zebra": {
      for (let x = z.z0 - s, i = 0; x < z.z1 + s; x += s * 1.3, i++) {
        const pts: number[] = []; for (let y = z.y0 - s; y <= z.y1 + s; y += s * .6) pts.push(x + Math.sin(y / s * 1.3 + i) * s * .5 + (rng() - .5) * s * .3, y);
        b.curve(pts, col(0), s * (.35 + rng() * .3));
      }
      break;
    }
    case "circuit": {
      for (let i = 0; i < 28; i++) {
        let x = z.z0 + rng() * w, y = z.y0 + rng() * h; const pts = [x, y];
        for (let k = 0; k < 4; k++) { if (rng() < .5) x += (rng() - .5) * w * .3; else y += (rng() - .5) * h * .4; pts.push(x, y); }
        b.line(pts, col(i), s * .12, "butt"); b.circle(x, y, s * .22, col(i)); b.circle(x, y, s * .1, shade(col(i), -.6));
      }
      break;
    }
    case "folk": {
      for (let x = z.z0 + s, i = 0; x < z.z1; x += s * 2.2, i++) {
        const y = cy; const r = s * .55;
        for (let k = 0; k < 8; k++) b.ellipse(x + Math.cos(k * Math.PI / 4) * r, y + Math.sin(k * Math.PI / 4) * r, r * .42, r * .25, col(i), k * Math.PI / 4);
        b.circle(x, y, r * .35, col(i + 1));
        b.circle(x + s * 1.1, y, s * .16, col(i + 2)); b.line([x + s * .55, y - s * .6, x + s * 1.65, y + s * .6], col(i + 1), s * .06);
      }
      break;
    }
    case "rays": {
      b.translate(cz, cy);
      const n = 18;
      for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = a0 + Math.PI / n; b.poly([0, 0, Math.cos(a0) * reach, Math.sin(a0) * reach, Math.cos(a1) * reach, Math.sin(a1) * reach], col(i)); }
      break;
    }
    case "grid": {
      for (let y = z.y0; y < z.y1; y += s) b.rect(z.z0, y, w, s * .08, col(0));
      for (let x = z.z0; x < z.z1; x += s) b.rect(x, z.y0, s * .08, h, col(0));
      break;
    }
    case "splatter": {
      for (let i = 0; i < 40; i++) {
        const x = z.z0 + rng() * w, y = z.y0 + rng() * h, r = s * (.1 + rng() * rng() * .8);
        b.circle(x, y, r, col(i)); for (let k = 0; k < 3; k++) b.circle(x + (rng() - .5) * r * 4, y + (rng() - .5) * r * 4, r * rng() * .4, col(i));
      }
      break;
    }
    case "scales": {
      for (let y = z.y0 - s, row = 0; y < z.y1 + s; y += s * .5, row++) for (let x = z.z0 - s + (row % 2 ? s * .5 : 0); x < z.z1 + s; x += s) { b.circle(x, y, s * .5, col(row)); b.ring(x, y, s * .5, shade(col(row), -.4), s * .05, Math.PI, Math.PI * 2); }
      break;
    }
  }
  b.restore();
}
