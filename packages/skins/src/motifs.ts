import type { Brush } from "./brush";
import { alpha, shade } from "./color";

/** The inks a motif may use. `glow` is what the emissive pass keeps. */
export interface Ink { ink: string; accent: string; light: string; dark: string; base: string; extra: string; glow: string; label: string }
export type MotifFn = (b: Brush, p: Ink, rng: () => number, aspect: number) => void;
export interface Motif { draw: MotifFn; aspect: number; emissive?: MotifFn }

const TAU = Math.PI * 2;
/** Rounded rectangle from a rect and four discs; enough for silhouettes. */
export function rrect(b: Brush, x: number, y: number, w: number, h: number, r: number, color: string): void {
  r = Math.min(r, w / 2, h / 2);
  b.rect(x + r, y, w - 2 * r, h, color); b.rect(x, y + r, w, h - 2 * r, color);
  for (const [cx, cy] of [[x + r, y + r], [x + w - r, y + r], [x + r, y + h - r], [x + w - r, y + h - r]]) b.circle(cx, cy, r, color);
}
export function star(b: Brush, x: number, y: number, r: number, n: number, color: string, inner = .45, rot = Math.PI / 2): void {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r * inner : r; pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  b.poly(pts, color);
}
function heart(b: Brush, x: number, y: number, s: number, color: string): void {
  b.circle(x - s * .26, y + s * .18, s * .3, color); b.circle(x + s * .26, y + s * .18, s * .3, color);
  b.poly([x - s * .55, y + s * .1, x, y - s * .5, x + s * .55, y + s * .1], color);
}
function drips(b: Brush, x0: number, x1: number, y: number, color: string, rng: () => number, n = 5, len = .35, width = .036): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + .5 + (rng() - .5) * .6) / n * (x1 - x0), l = len * (.3 + rng()), w = width * (.6 + rng() * .8);
    b.rect(x - w / 2, y - l, w, l, color); b.circle(x, y - l, w * .75, color); b.circle(x, y, w * .6, color);
  }
}
function skullBase(b: Brush, p: Ink, rng: () => number, bone: string): void {
  b.circle(0, .12, .34, bone); rrect(b, -.22, -.46, .44, .4, .1, bone);
  b.ellipse(-.14, .1, .1, .12, p.dark, .2); b.ellipse(.14, .1, .1, .12, p.dark, -.2);
  b.poly([-.05, -.06, .05, -.06, 0, -.18], p.dark);
  for (let i = 0; i < 6; i++) { const x = -.15 + i * .06; b.rect(x, -.42, .045, .12, shade(bone, .1)); b.line([x, -.36, x + .045, -.36], p.dark, .01); }
  b.line([-.22, -.3, .22, -.3], p.dark, .012);
  b.circle(-.12, .12, .035, alpha(p.accent, .9 * rng() + .1)); b.circle(.16, .12, .035, alpha(p.accent, .9));
}

export const MOTIFS: Record<string, Motif> = {
  // ---- Barber Underground -------------------------------------------------------------------
  "skull-pompadour": { aspect: 1, draw(b, p, rng) {
    skullBase(b, p, rng, p.light);
    b.curve([-.36, .3, -.42, .55, -.15, .72, .12, .78, .42, .62, .38, .38, .18, .44, -.1, .4, -.3, .3], p.ink, 0, true);
    b.curve([-.3, .36, -.34, .52, -.12, .64, .1, .68, .34, .56], shade(p.ink, .45), .03);
    b.curve([-.2, .4, -.22, .5, -.05, .58, .15, .6], shade(p.ink, .6), .02);
    b.line([-.3, -.14, .3, -.14], p.accent, .02);
  } },
  razor: { aspect: 2.2, draw(b, p) {
    b.save(); b.rotate(-.35);
    rrect(b, -.95, -.13, .95, .26, .1, p.ink); b.line([-.85, 0, -.15, 0], shade(p.ink, .3), .03);
    b.circle(-.02, 0, .07, p.accent); b.circle(-.02, 0, .03, p.dark);
    b.poly([-.02, .14, .95, .2, 1.02, .08, 1.02, -.14, .1, -.16, -.02, -.14], p.light);
    b.poly([.05, -.16, 1.02, -.14, 1.0, -.05, .05, -.05], shade(p.light, -.3));
    b.line([.1, .1, .9, .16], shade(p.light, .5), .02);
    b.restore();
  } },
  "bloody-razor": { aspect: 2.2, draw(b, p, rng) {
    MOTIFS.razor.draw(b, p, rng, 2.2);
    b.save(); b.rotate(-.35); drips(b, .15, .95, -.1, p.accent, rng, 6, .3); b.circle(.6, -.1, .07, p.accent); b.restore();
  } },
  scissors: { aspect: 1, draw(b, p) {
    for (const s of [-1, 1]) {
      b.save(); b.rotate(s * .42);
      b.poly([-.03, .05, .03, .05, .05, .48, 0, .52, -.05, .48], p.light); b.line([0, .1, 0, .46], shade(p.light, -.35), .012);
      b.ring(0, -.28, .13, p.ink, .06); b.rect(-.025, -.15, .05, .2, p.ink);
      b.restore();
    }
    b.circle(0, .02, .05, p.accent); b.circle(0, .02, .02, p.dark);
  } },
  comb: { aspect: 2.4, draw(b, p) {
    rrect(b, -1.15, .08, 2.3, .28, .08, p.ink);
    for (let x = -1.05; x < 1.1; x += .07) b.rect(x, -.36, .035, .46, p.ink);
    b.line([-1.05, .22, 1.05, .22], shade(p.ink, .3), .03); b.text("№ 1", 0, .22, .16, p.accent, { font: "display" });
  } },
  clippers: { aspect: 1.1, draw(b, p) {
    rrect(b, -.22, -.5, .44, .85, .12, p.ink); b.rect(-.3, .3, .6, .12, p.light); b.rect(-.34, .4, .68, .06, shade(p.light, -.3));
    for (let x = -.32; x < .34; x += .05) b.rect(x, .42, .022, .08, p.light);
    b.rect(-.12, -.1, .24, .05, p.accent); b.rect(-.12, -.22, .24, .05, p.accent);
    b.circle(.08, .1, .05, p.accent); b.curve([0, -.5, -.05, -.7, .1, -.85, -.1, -1], p.dark, .035);
  } },
  "barber-pole": { aspect: .42, draw(b, p) {
    b.save(); b.clip([-.16, -.42, .16, -.42, .16, .42, -.16, .42]);
    b.rect(-.16, -.42, .32, .84, p.light);
    for (let y = -.9; y < .9; y += .22) { b.poly([-.2, y, .2, y + .3, .2, y + .38, -.2, y + .08], p.accent); b.poly([-.2, y + .11, .2, y + .41, .2, y + .46, -.2, y + .16], p.extra); }
    b.restore();
    b.alpha(.35); b.rect(-.16, -.42, .05, .84, "#000000"); b.rect(.06, -.42, .04, .84, "#ffffff"); b.alpha(1);
    for (const y of [-.5, .5]) { b.ellipse(0, y, .22, .07, p.ink); b.rect(-.22, y - .02, .44, .04, p.ink); }
    b.circle(0, .58, .07, p.ink); b.circle(0, -.58, .07, p.ink);
  } },
  "flame-quiff": { aspect: 1.5, draw(b, p) {
    b.curve([-.7, -.5, -.6, -.1, -.3, .2, -.05, .5, .3, .35, .55, .45, .75, .1, .6, -.3, .7, -.5], p.accent, 0, true);
    b.curve([-.5, -.5, -.42, -.15, -.15, .1, .05, .3, .3, .18, .45, .05, .4, -.5], p.extra, 0, true);
    b.curve([-.3, -.5, -.25, -.2, -.05, 0, .1, .12, .2, -.1, .2, -.5], p.light, 0, true);
    b.rect(-.75, -.6, 1.5, .12, p.ink);
  } },
  mustache: { aspect: 2, draw(b, p) {
    for (const s of [-1, 1]) b.curve([0, .05, s * .25, .18, s * .55, .15, s * .8, -.02, s * .9, -.22, s * .7, -.1, s * .45, -.12, s * .2, -.12], p.ink, 0, true);
    b.circle(0, .02, .07, p.ink);
  } },
  "barber-badge": { aspect: 1, draw(b, p, rng) {
    b.circle(0, 0, .5, p.ink); b.ring(0, 0, .43, p.light, .025); b.ring(0, 0, .36, p.accent, .012);
    b.stamp(0, .05, .5, 0, (bb, a) => MOTIFS["barber-pole"].draw(bb, p, rng, a), .42);
    b.text("ZAKŁAD", 0, -.3, .1, p.light, { font: "display", spacing: .12 }); b.text("1987", 0, .38, .09, p.light, { font: "display" });
  } },
  "hair-wave": { aspect: 3, draw(b, p) {
    for (let i = 0; i < 9; i++) { const y = -.42 + i * .1, pts: number[] = []; for (let x = -1.5; x <= 1.5; x += .15) pts.push(x, y + Math.sin(x * 2.4 + i * .6) * .12); b.curve(pts, i % 3 ? p.ink : shade(p.ink, .35), .035); }
  } },

  // ---- Nocna zmiana (osiedle) -----------------------------------------------------------------
  block: { aspect: 1.6, draw(b, p) {
    b.rect(-.8, -.5, 1.6, 1, p.ink); b.rect(-.8, .5, 1.6, .05, shade(p.ink, .2));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) {
      const lit = ((r * 7 + c * 3) % 5) < 2;
      b.rect(-.72 + c * .17, -.42 + r * .15, .1, .09, lit ? p.glow : shade(p.ink, -.5));
    }
    for (let r = 0; r < 6; r++) b.rect(.12, -.44 + r * .15, .3, .02, shade(p.ink, .35));
    b.rect(-.1, -.5, .2, .18, shade(p.ink, -.6)); b.rect(-.75, .55, .02, .2, p.light); b.line([-.85, .75, -.65, .75], p.light, .015);
  }, emissive(b, p) { for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) if (((r * 7 + c * 3) % 5) < 2) b.rect(-.72 + c * .17, -.42 + r * .15, .1, .09, p.glow); } },
  stairwell: { aspect: 1, draw(b, p) {
    b.rect(-.3, -.5, .6, .8, shade(p.ink, -.4)); b.rect(-.26, -.5, .52, .74, p.dark); b.rect(-.02, -.5, .04, .74, shade(p.ink, .1));
    b.rect(-.18, -.3, .12, .3, alpha(p.glow, .8)); b.rect(.06, -.3, .12, .3, alpha(p.glow, .8));
    b.rect(-.42, .34, .84, .2, p.light); b.text("KLATKA 13", 0, .44, .13, p.dark, { font: "display" });
    for (let i = 0; i < 3; i++) b.rect(-.5 + i * .05, -.62 + i * .05, 1 - i * .1, .04, shade(p.ink, .2));
  }, emissive(b, p) { b.rect(-.18, -.3, .12, .3, p.glow); b.rect(.06, -.3, .12, .3, p.glow); } },
  tag: { aspect: 2.4, draw(b, p, rng) {
    b.save(); b.rotate(-.08);
    b.text(p.label || "MRC", 0, 0, .62, p.accent, { font: "display", stroke: p.dark, strokeWidth: .09, italic: true, maxWidth: 2.2 });
    b.restore();
    drips(b, -.7, .7, -.2, p.accent, rng, 4, .25);
    b.line([.9, .3, 1.15, .1, .9, -.1], p.accent, .05); b.circle(-1.05, .32, .05, p.accent);
  } },
  bench: { aspect: 1.8, draw(b, p) {
    for (let i = 0; i < 3; i++) b.rect(-.85, -.05 + i * .11, 1.7, .08, i % 2 ? p.accent : p.ink);
    for (let i = 0; i < 2; i++) b.rect(-.85, .35 + i * .11, 1.7, .08, p.ink);
    for (const x of [-.6, .6]) { b.rect(x - .04, -.5, .08, .48, p.dark); b.rect(x - .04, .3, .08, .25, p.dark); }
    b.text("REZERWA", 0, .2, .1, p.light, { font: "display", spacing: .2 });
  } },
  lamp: { aspect: .7, draw(b, p) {
    b.poly([-.06, .45, .06, .45, .34, -.5, -.34, -.5], alpha(p.glow, .22)); b.rect(-.02, -.5, .04, .9, p.dark); b.rect(-.12, .4, .24, .06, p.dark); b.ellipse(0, .38, .1, .04, p.glow);
  }, emissive(b, p) { b.ellipse(0, .38, .1, .04, p.glow); b.poly([-.06, .45, .06, .45, .34, -.5, -.34, -.5], alpha(p.glow, .25)); } },
  "ultras-shield": { aspect: .9, draw(b, p) {
    b.poly([-.45, .48, .45, .48, .45, -.05, 0, -.5, -.45, -.05], p.light); b.poly([-.4, .43, .4, .43, .4, -.05, 0, -.44, -.4, -.05], p.ink);
    b.poly([-.4, .43, -.15, .43, -.15, -.35, -.4, -.05], p.accent); b.poly([.15, .43, .4, .43, .4, -.05, .15, -.35], p.extra);
    star(b, 0, .12, .16, 5, p.light); b.text("MRC", 0, -.16, .13, p.light, { font: "display", spacing: .1 });
  } },
  "flat-number": { aspect: 1.3, draw(b, p) {
    rrect(b, -.6, -.4, 1.2, .8, .08, p.light); rrect(b, -.54, -.34, 1.08, .68, .05, p.ink);
    b.text(p.label || "13", 0, .04, .5, p.light, { font: "display" }); b.text("M. NR", 0, -.26, .1, p.accent, { font: "mono" });
    b.circle(-.5, .3, .03, p.dark); b.circle(.5, -.3, .03, p.dark);
  } },
  antenna: { aspect: 1, draw(b, p) {
    b.rect(-.02, -.5, .04, 1, p.ink); for (let i = 0; i < 4; i++) { const w = .5 - i * .1; b.rect(-w / 2, -.2 + i * .2, w, .03, p.ink); }
    b.ring(0, .45, .1, p.accent, .02, -.6, .6 + Math.PI); b.circle(0, .45, .04, p.accent);
  } },

  // ---- Monopolowy -----------------------------------------------------------------------------
  bottle: { aspect: .42, draw(b, p) {
    b.rect(-.06, .3, .12, .2, shade(p.ink, .1)); b.rect(-.075, .44, .15, .06, p.accent);
    b.poly([-.06, .3, .06, .3, .16, .1, .16, -.5, -.16, -.5, -.16, .1], p.ink);
    b.rect(-.16, -.5, .32, .05, shade(p.ink, -.4));
    rrect(b, -.13, -.32, .26, .38, .02, p.light); b.rect(-.13, -.02, .26, .04, p.accent);
    b.text(p.label || "CZYSTA", 0, -.1, .07, p.dark, { font: "display", maxWidth: .22 }); b.text("40%", 0, -.24, .05, p.dark, { font: "mono" });
    b.alpha(.35); b.rect(.08, -.45, .04, .7, "#ffffff"); b.alpha(1);
  } },
  shot: { aspect: .8, draw(b, p) {
    b.poly([-.3, .4, .3, .4, .2, -.4, -.2, -.4], alpha(p.light, .55)); b.poly([-.22, .05, .22, .05, .18, -.38, -.18, -.38], alpha(p.accent, .7));
    b.rect(-.24, -.44, .48, .06, p.light); b.alpha(.5); b.rect(-.22, -.3, .04, .65, "#ffffff"); b.alpha(1);
    b.ring(0, .4, .3, p.light, .025, 0, Math.PI);
  } },
  cap: { aspect: 1, draw(b, p) {
    const pts: number[] = []; for (let i = 0; i < 44; i++) { const a = i / 44 * TAU, r = i % 2 ? .46 : .5; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
    b.poly(pts, p.accent); b.circle(0, 0, .38, p.light); b.ring(0, 0, .3, p.accent, .02); star(b, 0, .02, .14, 5, p.accent);
    b.text("SETKA", 0, -.22, .07, p.dark, { font: "display" });
  } },
  label: { aspect: 1.5, draw(b, p) {
    rrect(b, -.72, -.45, 1.44, .9, .06, p.light); b.ring(0, 0, 0, p.light, 0);
    b.rect(-.66, -.39, 1.32, .78, p.accent); rrect(b, -.62, -.35, 1.24, .7, .03, p.light);
    b.text(p.label || "MONOPOL", 0, .08, .24, p.dark, { font: "display", maxWidth: 1.1 });
    b.rect(-.5, -.12, 1, .02, p.accent); b.text("SPIRYTUS TAKTYCZNY · 95%", 0, -.22, .07, p.dark, { font: "serif", italic: true, maxWidth: 1.1 });
    for (const x of [-.55, .55]) star(b, x, .3, .05, 5, p.accent);
  } },
  "neon-24": { aspect: 1.6, draw(b, p) {
    b.rect(-.75, -.4, 1.5, .8, p.dark); b.ring(0, 0, 0, p.dark, 0);
    b.glow(.08, p.glow); b.text("24H", 0, .1, .46, p.glow, { font: "display", stroke: alpha(p.light, .6), strokeWidth: .02 }); b.glow(0, "#000");
    b.text("MONOPOL", 0, -.25, .13, p.light, { font: "display", spacing: .25 });
  }, emissive(b, p) { b.text("24H", 0, .1, .46, p.glow, { font: "display" }); b.text("MONOPOL", 0, -.25, .13, p.light, { font: "display", spacing: .25 }); } },
  clink: { aspect: 1.4, draw(b, p, rng) {
    for (const s of [-1, 1]) { b.save(); b.translate(s * .3, 0); b.rotate(-s * .35); MOTIFS.shot.draw(b, p, rng, .8); b.restore(); }
    star(b, 0, .42, .12, 4, p.light, .3); star(b, .18, .55, .06, 4, p.light, .3); star(b, -.2, .5, .05, 4, p.light, .3);
  } },
  wedding: { aspect: 1.3, draw(b, p, rng) {
    for (const s of [-1, 1]) b.stamp(s * .22, 0, 1, s * .12, (bb, a) => MOTIFS.bottle.draw(bb, p, rng, a), .42);
    b.ring(-.08, .35, .1, p.accent, .03); b.ring(.08, .35, .1, p.accent, .03);
    b.curve([-.35, -.35, -.15, -.2, 0, -.35, .15, -.2, .35, -.35], p.extra, .04);
  } },
  banknote: { aspect: 2.1, draw(b, p) {
    rrect(b, -1, -.45, 2, .9, .05, p.light); rrect(b, -.94, -.39, 1.88, .78, .03, p.accent); rrect(b, -.88, -.33, 1.76, .66, .02, p.light);
    b.circle(0, 0, .28, p.accent); b.text("100", -.65, 0, .3, p.dark, { font: "display" }); b.text("100", .65, 0, .3, p.dark, { font: "display" });
    b.text("BANK DZIELNICY", 0, -.3, .07, p.dark, { font: "serif" });
  } },

  // ---- Zielony salon --------------------------------------------------------------------------
  leaf: { aspect: 1, draw(b, p) {
    const blade = (len: number, a: number) => { b.save(); b.rotate(a); const pts: number[] = [0, 0]; for (let t = 0; t <= 1; t += .1) { const w = Math.sin(t * Math.PI) * .09 * (1 + (Math.round(t * 10) % 2) * .35); pts.push(w, t * len); } for (let t = 1; t >= 0; t -= .1) { const w = Math.sin(t * Math.PI) * .09 * (1 + (Math.round(t * 10) % 2) * .35); pts.push(-w, t * len); } b.poly(pts, p.accent); b.line([0, 0, 0, len * .95], shade(p.accent, -.4), .01); b.restore(); };
    for (const [len, a] of [[.5, 0], [.46, .55], [.46, -.55], [.38, 1.1], [.38, -1.1], [.26, 1.7], [.26, -1.7]]) blade(len, a);
    b.rect(-.015, -.42, .03, .4, shade(p.accent, -.3));
  } },
  smoke: { aspect: 1.3, draw(b, p, rng) {
    for (let i = 0; i < 14; i++) { const t = i / 14; const x = -.5 + Math.sin(t * 5) * .3 + (rng() - .5) * .2, y = -.5 + t; b.alpha(.15 + rng() * .2); b.circle(x, y, .1 + t * .3 + rng() * .1, p.light); }
    b.alpha(1);
  } },
  eye: { aspect: 1.8, draw(b, p, rng) {
    b.curve([-.85, 0, -.4, .42, .4, .42, .85, 0, .4, -.42, -.4, -.42], p.light, 0, true);
    for (let i = 0; i < 10; i++) { const a = rng() * TAU; b.line([Math.cos(a) * .3, Math.sin(a) * .18, Math.cos(a) * .8, Math.sin(a) * .35], alpha(p.accent, .7), .012); }
    b.circle(0, 0, .3, p.extra); b.circle(0, 0, .16, p.dark); b.circle(.08, .1, .05, "#ffffff");
    b.curve([-.85, 0, -.4, .42, .4, .42, .85, 0], p.dark, .05); b.curve([-.85, 0, -.4, -.42, .4, -.42, .85, 0], p.dark, .03);
  }, emissive(b, p) { b.circle(0, 0, .3, alpha(p.extra, .6)); } },
  spiral: { aspect: 1, draw(b, p) {
    for (let r = .5; r > .04; r -= .055) { b.ring(0, 0, r, p.ink, .028, 0, Math.PI * 1.5); b.ring(0, 0, r - .0275, p.accent, .028, Math.PI * 1.5, TAU); }
    b.circle(0, 0, .05, p.accent);
  } },
  "mushroom-face": { aspect: 1, draw(b, p) {
    b.curve([-.5, .05, -.4, .4, 0, .52, .4, .4, .5, .05], p.accent, 0, true); b.rect(-.5, -.02, 1, .1, p.accent);
    for (const [x, y, r] of [[-.25, .25, .07], [.1, .38, .09], [.32, .18, .05]]) b.circle(x, y, r, p.light);
    rrect(b, -.22, -.5, .44, .5, .1, p.light);
    b.circle(-.1, -.15, .06, p.dark); b.circle(.1, -.15, .06, p.dark); b.circle(-.08, -.13, .02, "#ffffff"); b.circle(.12, -.13, .02, "#ffffff");
    b.curve([-.14, -.32, -.05, -.4, .05, -.4, .14, -.32], p.dark, .03); b.rect(-.06, -.35, .12, .04, "#ffffff");
    b.alpha(.45); b.circle(-.18, -.28, .05, p.extra); b.circle(.18, -.28, .05, p.extra); b.alpha(1);
  } },
  rings: { aspect: 1, draw(b, p) {
    const cols = [p.ink, p.accent, p.extra, p.light];
    for (let i = 0; i < 9; i++) b.circle(0, 0, .5 - i * .055, cols[i % cols.length]);
  } },
  bud: { aspect: .8, draw(b, p, rng) {
    for (let i = 0; i < 16; i++) { const y = -.45 + i * .06 * (1 + rng() * .1), w = .32 * (1 - Math.abs(y) * 1.2); b.ellipse((rng() - .5) * .1, y, w, .07, i % 2 ? p.accent : shade(p.accent, -.2), (rng() - .5) * .6); }
    for (let i = 0; i < 30; i++) { const y = -.4 + rng() * .8, x = (rng() - .5) * .5; b.line([x, y, x + (rng() - .5) * .1, y + (rng() - .5) * .1], p.extra, .012); }
    b.alpha(.5); for (let i = 0; i < 20; i++) b.circle((rng() - .5) * .5, -.4 + rng() * .8, .012, p.light); b.alpha(1);
  } },

  // ---- Masa -----------------------------------------------------------------------------------
  dumbbell: { aspect: 2.4, draw(b, p) {
    b.rect(-1.2, -.06, 2.4, .12, p.light); b.rect(-.35, -.09, .7, .18, shade(p.light, -.25));
    for (const s of [-1, 1]) { rrect(b, s * .95 - .1, -.5, .2, 1, .03, p.ink); rrect(b, s * .72 - .09, -.4, .18, .8, .03, p.ink); rrect(b, s * .52 - .08, -.3, .16, .6, .03, p.ink); }
    b.text("MASA", 0, 0, .1, p.dark, { font: "display", spacing: .2 });
  } },
  syringe: { aspect: 2.6, draw(b, p) {
    b.rect(-.55, -.2, 1.1, .4, alpha(p.light, .55)); b.rect(-.5, -.15, .95, .3, p.glow);
    for (let x = -.45; x < .5; x += .1) b.rect(x, .06, .015, .12, p.dark);
    b.rect(-.62, -.28, .1, .56, p.light); b.rect(-1.2, -.05, .6, .1, p.light); b.rect(-1.3, -.22, .12, .44, p.light);
    b.rect(.55, -.08, .2, .16, p.light); b.rect(.75, -.02, .55, .04, shade(p.light, -.2)); b.circle(.6, -.28, .05, p.glow);
    b.text("SERUM X", -.05, -.32, .11, p.light, { font: "display", spacing: .1 });
  }, emissive(b, p) { b.rect(-.5, -.15, .95, .3, p.glow); } },
  pill: { aspect: 2, draw(b, p) {
    b.save(); b.rotate(-.5); rrect(b, -.9, -.32, 1.8, .64, .32, p.light); b.clip([-.9, -.4, 0, -.4, 0, .4, -.9, .4]); rrect(b, -.9, -.32, 1.8, .64, .32, p.accent); b.restore();
    b.save(); b.rotate(-.5); b.alpha(.5); b.rect(-.6, .12, 1.2, .08, "#ffffff"); b.alpha(1); b.text("XXL", .4, 0, .2, p.dark, { font: "display", rot: 0 }); b.restore();
  } },
  "flex-arm": { aspect: 1.2, draw(b, p) {
    b.curve([-.6, -.5, -.5, -.1, -.3, .2, .1, .42, .5, .3, .6, 0, .35, -.05, .15, .12, -.05, .05, -.2, -.3, -.15, -.5], p.ink, 0, true);
    b.curve([-.35, -.2, -.25, .1, 0, .25, .3, .18, .22, .0, -.05, -.02], shade(p.ink, .35), 0, true);
    b.circle(.5, .1, .16, p.ink); b.line([-.5, -.5, -.55, -.9], p.ink, .3);
  } },
  kettlebell: { aspect: .9, draw(b, p) {
    b.ring(0, .28, .22, p.ink, .1); b.circle(0, -.12, .4, p.ink); b.rect(-.4, -.5, .8, .1, shade(p.ink, -.4));
    b.text("32", 0, -.1, .3, p.accent, { font: "display" }); b.alpha(.3); b.circle(-.15, .02, .1, "#ffffff"); b.alpha(1);
  } },
  shaker: { aspect: .55, draw(b, p) {
    b.poly([-.22, -.5, .22, -.5, .26, .3, -.26, .3], alpha(p.light, .35)); b.rect(-.27, .3, .54, .12, p.ink); b.rect(-.12, .42, .24, .08, p.ink);
    b.poly([-.21, -.48, .21, -.48, .24, .05, -.24, .05], alpha(p.accent, .8)); for (let y = -.4; y < .3; y += .12) b.line([-.26, y, -.14, y], p.light, .012);
    b.text("GAINZ", 0, -.15, .08, p.light, { font: "display" });
  } },
  flask: { aspect: .8, draw(b, p, rng) {
    b.poly([-.1, .5, .1, .5, .1, .05, .4, -.45, -.4, -.45, -.1, .05], alpha(p.light, .4)); b.poly([-.22, -.15, .22, -.15, .36, -.42, -.36, -.42], p.glow);
    for (let i = 0; i < 6; i++) b.circle((rng() - .5) * .3, -.2 + rng() * .5, .02 + rng() * .03, alpha(p.glow, .8));
    b.rect(-.14, .44, .28, .06, p.light); b.text("☠", 0, -.3, .12, p.dark);
  }, emissive(b, p) { b.poly([-.22, -.15, .22, -.15, .36, -.42, -.36, -.42], p.glow); } },
  lifter: { aspect: 1, draw(b, p) {
    b.poly([-.5, .1, -.25, .3, .25, .3, .5, .1, .3, -.5, -.3, -.5], p.ink);
    b.circle(-.14, .05, .15, shade(p.ink, .2)); b.circle(.14, .05, .15, shade(p.ink, .2));
    b.circle(-.48, .2, .16, p.ink); b.circle(.48, .2, .16, p.ink); b.circle(0, .42, .1, p.ink);
    b.rect(-.6, -.55, 1.2, .08, p.accent); b.text("DZIEŃ NÓG", 0, -.32, .09, p.light, { font: "display", spacing: .1 });
  } },

  // ---- Po godzinach ---------------------------------------------------------------------------
  lips: { aspect: 1.7, draw(b, p) {
    b.curve([-.8, 0, -.4, .38, -.1, .22, 0, .3, .1, .22, .4, .38, .8, 0], p.accent, 0, true);
    b.curve([-.8, 0, -.4, -.4, 0, -.48, .4, -.4, .8, 0], p.accent, 0, true);
    b.line([-.72, 0, .72, 0], p.dark, .04); b.alpha(.5); b.ellipse(-.3, -.2, .16, .06, "#ffffff"); b.alpha(1);
  } },
  heart: { aspect: 1, draw(b, p) { heart(b, 0, 0, .9, p.accent); b.alpha(.4); b.circle(-.2, .22, .08, "#ffffff"); b.alpha(1); } },
  "neon-club": { aspect: 1.8, draw(b, p) {
    b.rect(-.9, -.45, 1.8, .9, p.dark);
    b.glow(.06, p.glow); b.text(p.label || "KLUB", 0, .12, .42, p.glow, { font: "display", stroke: alpha("#ffffff", .5), strokeWidth: .015 });
    heart(b, -.7, .15, .25, p.accent); heart(b, .7, .15, .25, p.accent); b.glow(0, "#000");
    b.text("OTWARTE PO 22", 0, -.26, .1, p.light, { font: "display", spacing: .2 });
  }, emissive(b, p) { b.text(p.label || "KLUB", 0, .12, .42, p.glow, { font: "display" }); heart(b, -.7, .15, .25, p.accent); heart(b, .7, .15, .25, p.accent); } },
  censored: { aspect: 2.6, draw(b, p) {
    b.save(); b.rotate(-.06); b.rect(-1.3, -.22, 2.6, .44, p.dark); b.text("CENZURA", 0, 0, .3, p.light, { font: "display", spacing: .2 }); b.restore();
  } },
  "pinup-legs": { aspect: .9, draw(b, p) {
    b.curve([-.35, -.5, -.3, -.1, -.15, .2, -.05, .5, .1, .5, .05, .15, -.08, -.15, -.1, -.5], p.ink, 0, true);
    b.curve([.1, -.5, .05, -.15, .2, .15, .38, .45, .48, .42, .35, .1, .25, -.2, .3, -.5], p.ink, 0, true);
    b.poly([-.4, -.5, -.05, -.5, .0, -.62, -.25, -.68], p.accent); b.poly([.08, -.5, .36, -.5, .42, -.62, .15, -.68], p.accent);
    b.rect(-.4, .4, .9, .1, p.accent);
  } },
  garter: { aspect: 2.5, draw(b, p, rng) {
    b.rect(-1.25, -.15, 2.5, .3, p.accent); for (let x = -1.2; x < 1.25; x += .12) { b.circle(x, .18, .05, p.light); b.circle(x, -.18, .05, p.light); }
    for (let i = 0; i < 40; i++) b.circle(-1.2 + rng() * 2.4, (rng() - .5) * .22, .012, alpha(p.light, .6));
    b.circle(0, 0, .14, p.light); heart(b, 0, 0, .18, p.accent);
  } },
  cherry: { aspect: 1, draw(b, p) {
    b.curve([-.2, -.1, -.1, .3, .05, .5], p.extra, .04); b.curve([.22, -.05, .12, .3, .05, .5], p.extra, .04);
    b.circle(-.22, -.22, .22, p.accent); b.circle(.24, -.18, .22, p.accent); b.alpha(.5); b.circle(-.3, -.14, .06, "#ffffff"); b.circle(.16, -.1, .06, "#ffffff"); b.alpha(1);
    b.ellipse(.12, .5, .14, .06, p.extra, .4);
  } },
  "kiss-mark": { aspect: 1.5, draw(b, p) {
    b.save(); b.rotate(.25);
    for (const s of [-1, 1]) { b.curve([0, .05, s * .2, .3, s * .5, .2, s * .7, 0], p.accent, .12); b.curve([0, -.02, s * .25, -.3, s * .55, -.22, s * .7, 0], p.accent, .1); }
    b.restore();
  } },

  // ---- Złota półka ----------------------------------------------------------------------------
  crown: { aspect: 1.3, draw(b, p) {
    b.poly([-.6, -.45, .6, -.45, .6, -.1, .4, .35, .2, -.05, 0, .45, -.2, -.05, -.4, .35, -.6, -.1], p.accent);
    b.rect(-.6, -.45, 1.2, .12, shade(p.accent, -.25));
    for (const [x, y] of [[-.4, .38], [0, .5], [.4, .38]]) b.circle(x, y, .07, p.extra);
    for (const x of [-.35, -.12, .12, .35]) b.circle(x, -.25, .05, p.ink);
    b.alpha(.4); b.rect(-.55, -.4, .2, .3, "#ffffff"); b.alpha(1);
  } },
  filigree: { aspect: 2.4, draw(b, p) {
    for (const s of [-1, 1]) {
      b.curve([0, 0, s * .3, .25, s * .7, .3, s * 1.0, .05, s * .9, -.2, s * .7, -.05, s * .8, .12], p.accent, .035);
      b.curve([0, -.05, s * .35, -.3, s * .75, -.3, s * 1.1, -.05], p.accent, .03);
      b.circle(s * .85, .1, .05, p.accent); b.circle(s * 1.15, -.08, .04, p.accent);
      b.curve([s * .2, .1, s * .35, .4, s * .55, .45], shade(p.accent, .3), .02);
    }
    b.circle(0, 0, .07, p.extra); b.ring(0, 0, .12, p.accent, .02);
  } },
  laurel: { aspect: 1.4, draw(b, p) {
    for (const s of [-1, 1]) {
      b.curve([s * .1, -.5, s * .5, -.3, s * .65, .1, s * .45, .48], p.accent, .03);
      for (let i = 0; i < 7; i++) { const t = i / 7; const x = s * (.1 + .5 * Math.sin(t * 1.9)), y = -.5 + t * .95; b.ellipse(x + s * .1, y, .12, .045, p.accent, s * (.9 - t * 1.5)); b.ellipse(x - s * .05, y + .04, .1, .04, p.accent, s * (.3 - t * 1.5)); }
    }
  } },
  sunburst: { aspect: 1, draw(b, p) {
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; b.poly([0, 0, Math.cos(a) * .7, Math.sin(a) * .7, Math.cos(a + .1) * .7, Math.sin(a + .1) * .7], i % 2 ? p.accent : shade(p.accent, .3)); }
    b.circle(0, 0, .18, p.extra); b.ring(0, 0, .22, p.ink, .02);
  } },
  gem: { aspect: 1, draw(b, p) {
    b.poly([-.5, .15, -.25, .45, .25, .45, .5, .15, 0, -.5], p.accent);
    b.poly([-.25, .45, .25, .45, .1, .15, -.1, .15], shade(p.accent, .5)); b.poly([-.5, .15, -.1, .15, 0, -.5], shade(p.accent, -.25)); b.poly([.5, .15, .1, .15, 0, -.5], shade(p.accent, .25));
    b.line([-.5, .15, .5, .15], shade(p.accent, .7), .015); star(b, -.2, .3, .08, 4, "#ffffff", .3);
  } },
  wings: { aspect: 2.6, draw(b, p) {
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const t = i / 5; b.curve([0, .1 - t * .15, s * (.4 + t * .1), .35 - t * .25, s * (1.2 - t * .18), .1 - t * .32, s * (.5 + t * .05), -.1 - t * .12], p.accent, 0, true); }
    b.circle(0, .05, .12, p.extra); b.ring(0, .05, .17, p.accent, .025);
  } },

  // ---- Zakład / generic -----------------------------------------------------------------------
  wasp: { aspect: 1.6, draw(b, p) {
    b.ellipse(.3, 0, .45, .26, p.accent); for (let i = 0; i < 4; i++) b.ellipse(.15 + i * .16, 0, .05, .26, p.ink);
    b.poly([.72, .05, .92, 0, .72, -.05], p.ink); b.circle(-.25, 0, .18, p.ink); b.circle(-.45, 0, .14, p.ink); b.circle(-.5, .06, .05, p.light);
    b.alpha(.55); b.ellipse(-.05, .32, .32, .1, p.light, .5); b.ellipse(.05, .3, .28, .08, p.light, .8); b.alpha(1);
    for (let i = 0; i < 3; i++) b.line([-.1 + i * .15, -.18, -.15 + i * .15, -.4], p.ink, .025);
    b.line([-.5, .12, -.7, .3], p.ink, .02); b.line([-.42, .14, -.5, .35], p.ink, .02);
  } },
  "flower-folk": { aspect: 1, draw(b, p) {
    for (let k = 0; k < 8; k++) b.ellipse(Math.cos(k * Math.PI / 4) * .3, Math.sin(k * Math.PI / 4) * .3, .2, .1, k % 2 ? p.accent : p.extra, k * Math.PI / 4);
    b.circle(0, 0, .14, p.light); b.circle(0, 0, .07, p.ink);
    for (const s of [-1, 1]) { b.ellipse(s * .42, -.36, .16, .07, p.ink, s * .6); }
  } },
  skyline: { aspect: 3, draw(b, p, rng) {
    let x = -1.5; while (x < 1.5) { const w = .12 + rng() * .25, h = .3 + rng() * .65; b.rect(x, -.5, w, h, p.ink); for (let yy = -.42; yy < h - .55; yy += .08) for (let xx = x + .03; xx < x + w - .03; xx += .06) if (rng() < .4) b.rect(xx, yy, .03, .04, p.glow); x += w + .02; }
    b.rect(-1.5, -.5, 3, .04, p.dark);
  }, emissive(b, p, rng) { let x = -1.5; while (x < 1.5) { const w = .12 + rng() * .25, h = .3 + rng() * .65; for (let yy = -.42; yy < h - .55; yy += .08) for (let xx = x + .03; xx < x + w - .03; xx += .06) if (rng() < .4) b.rect(xx, yy, .03, .04, p.glow); x += w + .02; } } },
  aurora: { aspect: 3, draw(b, p) {
    for (let i = 0; i < 6; i++) { const pts: number[] = []; for (let x = -1.5; x <= 1.5; x += .12) pts.push(x, -.1 + Math.sin(x * 2 + i) * .22 + i * .08); b.alpha(.55); b.curve(pts, [p.accent, p.extra, p.glow][i % 3], .12); }
    b.alpha(1); for (let i = 0; i < 30; i++) b.circle(-1.4 + (i * .097) % 2.8, -.45 + (i * .37) % .9, .012, p.light);
  }, emissive(b, p) { for (let i = 0; i < 6; i++) { const pts: number[] = []; for (let x = -1.5; x <= 1.5; x += .12) pts.push(x, -.1 + Math.sin(x * 2 + i) * .22 + i * .08); b.alpha(.4); b.curve(pts, [p.accent, p.extra, p.glow][i % 3], .12); } } },
  lollipop: { aspect: .8, draw(b, p) {
    b.rect(-.03, -.5, .06, .55, p.light); b.circle(0, .18, .32, p.accent);
    for (let r = .3; r > .03; r -= .07) b.ring(0, .18, r, p.light, .03, r * 4, r * 4 + Math.PI);
    b.alpha(.35); b.circle(-.1, .3, .07, "#ffffff"); b.alpha(1);
  } },
  palm: { aspect: 1, draw(b, p) {
    b.curve([.1, -.5, .0, -.1, -.05, .25], p.ink, .06);
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .45; b.curve([-.05, .25, -.05 + Math.cos(a - .4) * .3, .25 - Math.sin(a - .4) * .3 + .1, -.05 + Math.cos(a) * .5, .25 - Math.sin(a) * .55], p.ink, .05); }
  } },
  mountains: { aspect: 2.6, draw(b, p) {
    b.poly([-1.3, -.5, -.8, .3, -.4, -.1, 0, .45, .4, 0, .8, .25, 1.3, -.5], p.ink);
    b.poly([-.1, .3, 0, .45, .1, .3, .03, .25, -.03, .28], p.light); b.poly([-.88, .18, -.8, .3, -.72, .18], p.light);
  } },
  candy: { aspect: 2.2, draw(b, p) {
    b.ellipse(0, 0, .42, .3, p.accent); for (let i = -1; i <= 1; i++) b.ellipse(i * .2, 0, .05, .3, p.light, .3);
    for (const s of [-1, 1]) b.poly([s * .4, .1, s * 1.05, .3, s * .95, 0, s * 1.05, -.3, s * .4, -.1], p.accent);
  } },
  wrench: { aspect: 2.4, draw(b, p) {
    b.save(); b.rotate(-.5); b.rect(-.9, -.08, 1.6, .16, p.light); b.circle(.8, 0, .28, p.light); b.circle(-.9, 0, .22, p.light);
    b.poly([.75, .06, 1.15, .18, 1.15, -.18, .75, -.06], p.dark); b.poly([-.85, .08, -1.2, .16, -1.2, -.16, -.85, -.08], p.dark); b.restore();
  } },
  gear: { aspect: 1, draw(b, p) {
    const pts: number[] = []; for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, r = i % 4 < 2 ? .5 : .4; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
    b.poly(pts, p.ink); b.circle(0, 0, .22, p.base); b.ring(0, 0, .3, shade(p.ink, .3), .02);
  } },
  "oil-drop": { aspect: .8, draw(b, p) { b.curve([0, .5, .3, .05, .28, -.25, 0, -.45, -.28, -.25, -.3, .05], p.ink, 0, true); b.alpha(.5); b.ellipse(-.1, -.15, .06, .12, "#ffffff", .3); b.alpha(1); } },
  bolt: { aspect: .7, draw(b, p) { b.poly([.05, .5, -.3, -.05, -.02, -.05, -.15, -.5, .3, .1, .02, .1], p.accent); } },
  target: { aspect: 1, draw(b, p) { b.circle(0, 0, .5, p.light); b.ring(0, 0, .38, p.accent, .1); b.ring(0, 0, .2, p.accent, .08); b.circle(0, 0, .07, p.accent); b.line([-.6, 0, .6, 0], p.ink, .02); b.line([0, -.6, 0, .6], p.ink, .02); } },
  drips: { aspect: 3, draw(b, p, rng) { drips(b, -1.5, 1.5, .5, p.accent, rng, 9, .75, .11); } },
  chain: { aspect: 3, draw(b, p) { for (let x = -1.4; x < 1.5; x += .22) { b.ring(x, 0, .1, p.light, .035); b.ring(x, 0, .1, shade(p.light, -.4), .012); } } },
  "barbed-wire": { aspect: 3, draw(b, p) {
    const pts: number[] = []; for (let x = -1.5; x <= 1.5; x += .1) pts.push(x, Math.sin(x * 6) * .05); b.curve(pts, p.light, .03);
    for (let x = -1.35; x < 1.5; x += .3) { b.line([x - .08, .18, x + .08, -.18], p.light, .025); b.line([x + .08, .18, x - .08, -.18], p.light, .025); }
  } },
  shield: { aspect: .9, draw(b, p) { b.poly([-.45, .48, .45, .48, .45, -.05, 0, -.5, -.45, -.05], p.accent); b.poly([-.38, .41, .38, .41, .38, -.05, 0, -.42, -.38, -.05], p.ink); b.rect(-.38, .1, .76, .12, p.accent); } },
  banner: { aspect: 3, draw(b, p) {
    b.poly([-1.5, .3, 1.5, .3, 1.5, -.3, -1.5, -.3], p.accent); b.poly([-1.7, .4, -1.4, .4, -1.4, -.2, -1.7, -.2, -1.55, .1], shade(p.accent, -.3)); b.poly([1.7, .4, 1.4, .4, 1.4, -.2, 1.7, -.2, 1.55, .1], shade(p.accent, -.3));
    b.text(p.label || "BARBERSTRIKE", 0, 0, .34, p.light, { font: "display", spacing: .12, maxWidth: 2.7 });
  } },
  dice: { aspect: 1, draw(b, p) {
    b.save(); b.rotate(.3); rrect(b, -.4, -.4, .8, .8, .12, p.light); for (const [x, y] of [[-.2, .2], [0, 0], [.2, -.2], [-.2, -.2], [.2, .2]]) b.circle(x, y, .07, p.dark); b.restore();
  } },
  card: { aspect: .72, draw(b, p) {
    rrect(b, -.36, -.5, .72, 1, .06, p.light); heart(b, 0, 0, .5, p.accent); b.text("A", -.26, .38, .16, p.accent, { font: "serif" }); b.text("A", .26, -.38, .16, p.accent, { font: "serif", rot: Math.PI });
  } },
  moon: { aspect: 1, draw(b, p) { b.circle(0, 0, .45, p.light); b.circle(.18, .1, .4, p.base); star(b, -.3, -.3, .07, 4, p.light, .3); } },
  lightning: { aspect: .7, draw(b, p) { b.poly([.1, .5, -.3, -.02, 0, -.02, -.15, -.5, .35, .1, .05, .1], p.glow); }, emissive(b, p) { b.poly([.1, .5, -.3, -.02, 0, -.02, -.15, -.5, .35, .1, .05, .1], p.glow); } },
  "star-badge": { aspect: 1, draw(b, p) { star(b, 0, 0, .5, 5, p.accent); star(b, 0, 0, .3, 5, p.light); b.text(p.label || "★", 0, 0, .18, p.dark, { font: "display" }); } },
  hexnut: { aspect: 1, draw(b, p) { const pts: number[] = []; for (let k = 0; k < 6; k++) pts.push(Math.cos(k * Math.PI / 3) * .5, Math.sin(k * Math.PI / 3) * .5); b.poly(pts, p.light); b.circle(0, 0, .22, p.base); b.ring(0, 0, .26, shade(p.light, -.4), .03); } },
  towel: { aspect: 1.4, draw(b, p) { rrect(b, -.74, -.49, 1.48, .98, .1, p.ink); rrect(b, -.7, -.45, 1.4, .9, .08, p.light); for (let y = -.3; y < .4; y += .12) b.rect(-.7, y, 1.4, .05, alpha(p.accent, .5)); b.rect(-.7, -.45, 1.4, .1, p.accent); b.rect(-.7, .35, 1.4, .1, p.accent); } },
};

export const motifNames = (): string[] => Object.keys(MOTIFS);
export const motif = (name: unknown): Motif | undefined => MOTIFS[String(name)];
