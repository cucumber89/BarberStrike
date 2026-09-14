import type { Brush } from "./brush";
import { alpha, inkOn, shade } from "./color";
import { MOTIFS, rrect, star, type Ink } from "./motifs";
import type { CollectionId, Zone } from "./types";

/**
 * The small stuff: stickers with a paper border, stamped serials, collection marks and legends.
 * All of it is text-safe (drawn through `Brush.text`) and sized in metres, so a sticker is the
 * same physical size on a pistol and a sniper.
 */

/** A vinyl sticker: paper backing, a slight tilt, a motif or a word. */
export function sticker(b: Brush, x: number, y: number, size: number, rot: number, p: Ink, rng: () => number, motifName?: string, word?: string, maxWidth = Infinity): void {
  const m = motifName ? MOTIFS[motifName] : undefined;
  const aspect = word ? Math.max(1.4, word.length * .5 + .4) : (m?.aspect ?? 1);
  size = Math.min(size, maxWidth / aspect);
  b.save();
  b.translate(x, y); b.rotate(rot);
  b.alpha(.45); b.rect(-size * aspect / 2 + size * .04, -size / 2 - size * .04, size * aspect, size, "#000000"); b.alpha(1);
  b.scale(size);
  rrect(b, -aspect / 2, -.5, aspect, 1, .12, p.light);
  if (m) { b.save(); b.scale(.8); m.draw(b, p, rng, aspect); b.restore(); }
  if (word) b.text(word, 0, 0, .5, p.dark, { font: "display", spacing: .04, maxWidth: aspect * .88 });
  // A lifted corner, which is what says "sticker" rather than "print".
  b.alpha(.5); b.poly([aspect / 2, -.5, aspect / 2 - .18, -.5, aspect / 2, -.32], shade(p.light, -.35)); b.alpha(1);
  b.restore();
}

/** A stamped serial: mono text in a shallow recess, the kind every receiver carries. */
export function serialPlate(b: Brush, z: Zone, text: string, ground: string): void {
  const h = Math.min(.012, (z.y1 - z.y0) * .5), w = Math.min(z.z1 - z.z0, h * text.length * .68 + h);
  const x = z.z0 + (z.z1 - z.z0) * .5 - w / 2, y = z.y0 + h * .3;
  b.alpha(.35); b.rect(x, y, w, h, "#000000"); b.alpha(1);
  b.text(text, x + w / 2, y + h / 2, h * .62, inkOn(ground, "#2a2d31", "#d6d9dd"), { font: "mono", maxWidth: w * .92 });
}

/** A legend on the stock or fore-end: display caps, optional outline, fitted to the zone. */
export function legend(b: Brush, z: Zone, text: string, color: string, stroke?: string, italic = false, rot = 0, maxSize = .05): void {
  const w = z.z1 - z.z0, h = z.y1 - z.y0;
  const size = Math.min(h * .7, w * .92 / Math.max(1, text.length * .5), maxSize);
  b.text(text, (z.z0 + z.z1) / 2, (z.y0 + z.y1) / 2, size, color, { font: "display", italic, rot, spacing: .06, stroke, strokeWidth: stroke ? size * .1 : 0, maxWidth: w * .92 });
}

/** Each collection signs its work with the same small mark, so a Barber piece is known at a glance. */
export function collectionMark(b: Brush, collection: CollectionId, x: number, y: number, size: number, p: Ink, rng: () => number): void {
  b.save(); b.translate(x, y); b.scale(size);
  switch (collection) {
    case "barber": b.circle(0, 0, .5, p.dark); b.ring(0, 0, .42, p.light, .05); b.stamp(0, 0, .6, 0, (bb, a) => MOTIFS["barber-pole"].draw(bb, p, rng, a), .42); break;
    case "osiedle": b.rect(-.5, -.5, 1, 1, p.dark); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b.rect(-.38 + c * .3, -.38 + r * .3, .18, .18, (r + c) % 2 ? p.glow : shade(p.dark, .3)); b.text("13", 0, 0, .4, p.light, { font: "display", stroke: p.dark, strokeWidth: .06 }); break;
    case "monopol": MOTIFS.cap.draw(b, { ...p, label: "" }, rng, 1); break;
    case "zielony": b.circle(0, 0, .5, p.dark); b.ring(0, 0, .44, p.accent, .04); b.stamp(0, -.02, .8, 0, (bb, a) => MOTIFS.leaf.draw(bb, p, rng, a)); break;
    case "masa": b.circle(0, 0, .5, p.dark); b.stamp(0, 0, .5, 0, (bb, a) => MOTIFS.dumbbell.draw(bb, { ...p, ink: p.light, light: p.accent }, rng, a), 2.4); break;
    case "pogodzinach": b.circle(0, 0, .5, p.dark); b.ring(0, 0, .44, p.accent, .04); b.stamp(0, 0, .5, 0, (bb, a) => MOTIFS.lips.draw(bb, p, rng, a), 1.7); break;
    case "zlota": b.circle(0, 0, .5, p.dark); b.ring(0, 0, .44, p.accent, .05); b.stamp(0, 0, .6, 0, (bb, a) => MOTIFS.crown.draw(bb, p, rng, a), 1.3); break;
    default: b.circle(0, 0, .5, p.dark); b.ring(0, 0, .42, p.light, .05); star(b, 0, 0, .28, 5, p.light); b.text("Z", 0, 0, .3, p.dark, { font: "display" });
  }
  b.restore();
}

/** Rivets along a zone edge: the cheapest way to make a flat read as a bolted panel. */
export function rivets(b: Brush, z: Zone, color: string, spacing = .02): void {
  const r = .0016;
  for (let x = z.z0 + spacing / 2; x < z.z1; x += spacing) for (const y of [z.y0 + r * 2.5, z.y1 - r * 2.5]) { b.circle(x, y, r, shade(color, -.5)); b.circle(x - r * .3, y + r * .3, r * .6, shade(color, .4)); }
}

/** Warning stripe band with a stencil word, along the bottom of a zone. */
export function stencilBand(b: Brush, z: Zone, word: string, ink: string, paper: string): void {
  const h = Math.min(.014, (z.y1 - z.y0) * .35);
  b.rect(z.z0, z.y0, z.z1 - z.z0, h, alpha(paper, .85));
  b.text(word, (z.z0 + z.z1) / 2, z.y0 + h / 2, h * .7, ink, { font: "display", spacing: .25, maxWidth: (z.z1 - z.z0) * .9 });
}
