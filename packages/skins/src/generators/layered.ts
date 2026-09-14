import { mulberry32 } from "@frankibarber/shared";
import { Brush } from "../brush";
import { alpha, inkOn, mix, shade } from "../color";
import { collectionMark, legend, rivets, serialPlate, stencilBand, sticker } from "../decals";
import { insetZone, zoneCy, zoneCz, zoneH, zoneW } from "../frame";
import { listParam, numberParam, stringParam } from "../layers";
import { materialKind, paintMaterial, paintPartEdges, paintPartMaterials } from "../materials";
import { MOTIFS, type Ink } from "../motifs";
import { paintPattern, patternKind } from "../patterns";
import type { GeneratorFn, Palette, Params, RenderContext, Side, Zone } from "../types";
import { paintGrain, paintWear } from "../wear";

/**
 * The one generator behind the whole catalogue.
 *
 * A recipe is a stack of named layers over the weapon's side elevation: a base material for the
 * whole flank, each part's own material showing through, a supporting pattern confined to the
 * stock or fore-end, a hero illustration on the receiver, marks on the magazine and stock, then
 * stickers, a serial, the collection's sign, edge bevels, wear and grain. Both flanks get the same
 * design from the same seed; text is re-read per flank so it never runs backwards.
 */
export const layered: GeneratorFn = (c, _rng, params, palette, ctx) => {
  const sides: Side[] = ["right", "left"];
  for (const side of sides) {
    const rng = mulberry32(ctx.def.seed ^ 0x5bd1e995);
    const b = Brush.forBand(c, ctx.frame, side, ctx.scale);
    try { if (ctx.pass === "emissive") paintEmissive(b, params, palette, rng, ctx); else paintAlbedo(b, params, palette, rng, ctx); }
    finally { b.end(); }
  }
};

function inks(params: Params, palette: Palette): Ink {
  const [base, ink = "#141414", accent = "#d9a453", light = "#f1ebdf", extra] = palette.colors;
  return {
    base: String(params.color ?? base), ink, accent, light, extra: extra ?? accent,
    dark: mix(ink, "#000000", .55), glow: stringParam(params, "glow", extra ?? accent), label: stringParam(params, "heroLabel"),
  };
}

const zonesNamed = (ctx: RenderContext, names: string[]): Zone[] => {
  const f = ctx.frame; const out: Zone[] = [];
  for (const n of names) {
    const z = n === "all" ? { z0: f.z0, z1: f.z0 + f.zSpan, y0: f.y0, y1: f.y0 + f.ySpan } : n === "receiver" ? f.receiver : n === "stock" ? f.stock : n === "front" ? f.front : n === "grip" ? f.grip : n === "mag" ? f.magazine : n === "body" ? f.body : null;
    if (z) out.push(z);
  }
  return out;
};

function drawMotif(b: Brush, name: string, z: Zone, fill: number, p: Ink, rng: () => number, dz = 0, dy = 0, rot = 0, pass: "albedo" | "emissive" = "albedo"): void {
  const m = MOTIFS[name]; if (!m) return;
  const fn = pass === "emissive" ? m.emissive : m.draw; if (!fn) return;
  // A motif turned on its side fits the zone by its rotated footprint (a bottle lying along a receiver).
  const rotated = Math.abs(Math.sin(rot)) > .7;
  b.stampIn(z, m.aspect, fill, (bb, a) => fn(bb, p, rng, a), dz, dy, rot, rotated ? 1 / m.aspect : m.aspect);
}

/**
 * Where the hero sits on the receiver, shared by the albedo and emissive passes so a glow never
 * drifts from its paint. A square hero beside a legend moves to one end; the legend gets the rest.
 */
function heroPlacement(params: Params, receiver: Zone): { dz: number; legendZone: Zone | null } {
  const hero = stringParam(params, "hero"), legendText = stringParam(params, "receiverLegend");
  let dz = numberParam(params, "heroDz", 0);
  if (!hero) return { dz, legendZone: null };
  const fill = numberParam(params, "heroScale", 1.15), rot = numberParam(params, "heroRot", 0);
  const m = MOTIFS[hero]; const fitAspect = m ? (Math.abs(Math.sin(rot)) > .7 ? 1 / m.aspect : m.aspect) : 1;
  const footH = Math.min(zoneH(receiver), zoneW(receiver) / fitAspect) * fill, footW = footH * fitAspect;
  const side = stringParam(params, "heroSide", legendText ? "rear" : "center");
  if (side === "center" || footW >= zoneW(receiver) * .8) return { dz, legendZone: null };
  const margin = zoneH(receiver) * .12;
  const heroZ = side === "rear" ? receiver.z0 + margin + footW / 2 : receiver.z1 - margin - footW / 2;
  dz = (heroZ - zoneCz(receiver)) / zoneW(receiver);
  if (!legendText) return { dz, legendZone: null };
  const gap = zoneH(receiver) * .15;
  const zone: Zone = side === "rear" ? { z0: heroZ + footW / 2 + gap, z1: receiver.z1 - margin, y0: receiver.y0 + margin, y1: receiver.y1 - margin } : { z0: receiver.z0 + margin, z1: heroZ - footW / 2 - gap, y0: receiver.y0 + margin, y1: receiver.y1 - margin };
  return { dz, legendZone: zoneW(zone) > zoneH(zone) ? zone : null };
}

/** Where stickers go, in order of preference; a recipe with two stickers fills the first two. */
function stickerSpots(ctx: RenderContext): { x: number; y: number; size: number; maxWidth: number }[] {
  const f = ctx.frame, r = f.receiver, spots: { x: number; y: number; size: number; maxWidth: number }[] = [];
  spots.push({ x: r.z0 + zoneW(r) * .84, y: r.y0 + zoneH(r) * .28, size: zoneH(r) * .4, maxWidth: zoneW(r) * .3 });
  if (f.magazine) spots.push({ x: zoneCz(f.magazine), y: zoneCy(f.magazine) - zoneH(f.magazine) * .05, size: Math.min(zoneW(f.magazine) * .9, zoneH(f.magazine) * .4), maxWidth: zoneW(f.magazine) * 1.15 });
  if (f.stock) spots.push({ x: f.stock.z0 + zoneW(f.stock) * .3, y: f.stock.y0 + zoneH(f.stock) * .72, size: zoneH(f.stock) * .32, maxWidth: zoneW(f.stock) * .5 });
  spots.push({ x: r.z0 + zoneW(r) * .16, y: r.y0 + zoneH(r) * .74, size: zoneH(r) * .34, maxWidth: zoneW(r) * .3 });
  if (f.grip) spots.push({ x: zoneCz(f.grip), y: zoneCy(f.grip), size: Math.min(zoneW(f.grip), zoneH(f.grip)) * .7, maxWidth: zoneW(f.grip) * 1.2 });
  if (f.front) spots.push({ x: f.front.z0 + zoneW(f.front) * .6, y: zoneCy(f.front), size: zoneH(f.front) * .5, maxWidth: zoneW(f.front) * .35 });
  return spots;
}

function paintAlbedo(b: Brush, params: Params, palette: Palette, rng: () => number, ctx: RenderContext): void {
  const f = ctx.frame, p = inks(params, palette), window = b.window;
  const base = materialKind(params.base);
  const receiver = f.receiver;

  // 1. Base material over the whole flank, then every part's own material showing through.
  paintMaterial(b, window, base, p.base, rng, ctx.detail);
  paintPartMaterials(b, f.parts, base, p.base, numberParam(params, "partTint", .7), rng, undefined, ctx.detail);

  // 2. Supporting pattern, confined to the named zones (never the receiver unless asked).
  const pattern = patternKind(params.pattern);
  if (pattern !== "none") {
    const colors = listParam(params, "patternColors"); const style = {
      colors: colors.length ? colors : [p.ink, p.accent], scale: numberParam(params, "patternScale", .35),
      angle: numberParam(params, "patternAngle", 62) * Math.PI / 180, alpha: numberParam(params, "patternAlpha", .85),
    };
    for (const z of zonesNamed(ctx, listParam(params, "patternOn").length ? listParam(params, "patternOn") : ["stock", "front"])) paintPattern(b, z, pattern, style, rng);
  }

  // 3. A panel behind the hero gives the illustration a ground of its own on a busy weapon.
  const panel = stringParam(params, "panel", "none");
  if (panel !== "none") {
    const z = insetZone(receiver, zoneW(receiver) * .04, zoneH(receiver) * .08);
    const color = panel === "dark" ? shade(p.base, -.55) : panel === "light" ? p.light : panel === "ink" ? p.ink : p.accent;
    b.save(); b.alpha(numberParam(params, "panelAlpha", .9)); b.zone(z, color); b.restore();
    if (params.panelRivets) rivets(b, z, color);
  }

  // 4. Marks on the parts around the receiver: magazine, stock, fore-end, grip.
  const partMotif = (key: string, z: Zone | null, fill: number) => { const name = stringParam(params, key); if (name && z) drawMotif(b, name, z, fill, p, rng, numberParam(params, `${key}Dz`, 0), numberParam(params, `${key}Dy`, 0), numberParam(params, `${key}Rot`, 0)); };
  partMotif("magMotif", f.magazine, numberParam(params, "magScale", .8));
  partMotif("stockMotif", f.stock, numberParam(params, "stockScale", .8));
  partMotif("frontMotif", f.front, numberParam(params, "frontScale", .8));
  partMotif("gripMotif", f.grip, numberParam(params, "gripScale", .7));

  // 5. The hero illustration on the receiver, with an optional glow or drips. A square hero on a
  //    long receiver sits at one end and leaves the rest to a big legend, the way real prints do.
  const hero = stringParam(params, "hero");
  const textColor = stringParam(params, "textColor", p.light), textStroke = params.textStroke === false ? undefined : stringParam(params, "textStroke", p.dark);
  const legendText = stringParam(params, "receiverLegend");
  const { dz, legendZone } = heroPlacement(params, receiver);
  if (hero) {
    const fill = numberParam(params, "heroScale", 1.15), dy = numberParam(params, "heroDy", 0), rot = numberParam(params, "heroRot", 0);
    if (legendText && legendZone) legend(b, legendZone, legendText, textColor, textStroke, !!params.italic, 0, zoneH(receiver) * .8);
    // The illustration is printed on the receiver: it may run a little past its edges, never onto
    // the magazine or the grip hanging under it. Drips are the one thing allowed to run down.
    b.save(); b.clipZone(insetZone(receiver, -zoneW(receiver) * .1, -zoneH(receiver) * .2));
    if (params.heroGlow) { const cx = zoneCz(receiver) + dz * zoneW(receiver), cy = zoneCy(receiver) + dy * zoneH(receiver), r = zoneH(receiver) * fill * .9; b.save(); b.alpha(.75); b.circle(cx, cy, r, b.radial(cx, cy, r, [[0, alpha(p.glow, .9)], [1, alpha(p.glow, 0)]])); b.restore(); }
    if (params.heroShadow !== false) { b.save(); b.alpha(.35); b.translate(zoneH(receiver) * .03, -zoneH(receiver) * .03); drawMotif(b, hero, receiver, fill, { ...p, ink: "#000000", accent: "#000000", light: "#000000", extra: "#000000", dark: "#000000", glow: "#000000" }, mulberry32(ctx.def.seed), dz, dy, rot); b.restore(); }
    drawMotif(b, hero, receiver, fill, p, mulberry32(ctx.def.seed), dz, dy, rot);
    b.restore();
    if (params.drips) {
      const z = { ...receiver, y0: receiver.y0 - zoneH(receiver) * .4 };
      b.save(); b.clipZone(z); drawMotif(b, "drips", z, 1.1, { ...p, accent: stringParam(params, "dripColor", p.accent) }, rng, 0, .05); b.restore();
    }
  }

  // 6. Legends: stock and fore-end carry words; a pistol with no stock writes on its grip.
  const stockText = stringParam(params, "stockText");
  if (stockText) {
    if (f.stock) legend(b, insetZone(f.stock, zoneW(f.stock) * .08, zoneH(f.stock) * .2), stockText, textColor, textStroke, !!params.italic, 0, numberParam(params, "textSize", .05));
    else if (f.grip) legend(b, f.grip, stockText, textColor, textStroke, !!params.italic, -Math.PI / 2 + .25, numberParam(params, "textSize", .014));
  }
  const frontText = stringParam(params, "frontText");
  if (frontText && f.front) legend(b, insetZone(f.front, zoneW(f.front) * .1, zoneH(f.front) * .22), frontText, textColor, textStroke, !!params.italic, 0, numberParam(params, "textSize", .035));
  const magText = stringParam(params, "magText");
  if (magText && f.magazine) legend(b, insetZone(f.magazine, zoneW(f.magazine) * .1, zoneH(f.magazine) * .3), magText, textColor, textStroke, false, -Math.PI / 2, .018);
  const receiverText = stringParam(params, "receiverText");
  if (receiverText) legend(b, { ...receiver, y0: receiver.y0 + zoneH(receiver) * numberParam(params, "receiverTextY", .55) }, receiverText, textColor, textStroke, !!params.italic, 0, numberParam(params, "receiverTextSize", .03));
  const band = stringParam(params, "stencil");
  if (band) stencilBand(b, f.front ?? receiver, band, p.dark, p.light);

  // 7. Stickers, a serial and the collection's mark.
  const stickers = listParam(params, "stickers"), spots = stickerSpots(ctx);
  stickers.slice(0, spots.length).forEach((entry, i) => {
    const spot = spots[i], rot = (rng() - .5) * .5;
    if (entry.startsWith("!")) sticker(b, spot.x, spot.y, spot.size * .9, rot, p, rng, undefined, entry.slice(1), spot.maxWidth);
    else sticker(b, spot.x, spot.y, spot.size, rot, p, rng, entry, undefined, spot.maxWidth);
  });
  if (!params.noSerial) serialPlate(b, { ...receiver, y1: receiver.y0 + zoneH(receiver) * .28, z0: receiver.z0 + zoneW(receiver) * .55, z1: receiver.z1 - zoneW(receiver) * .05 }, stringParam(params, "serial", `BS-${(ctx.def.seed % 9000 + 1000).toString()}`), p.base);
  const markSize = Math.min(.018, zoneH(receiver) * .32);
  collectionMark(b, ctx.def.collection, receiver.z0 + zoneW(receiver) * .09, receiver.y1 - markSize * .7, markSize, p, rng);

  // 8. Accent bands on the receiver edges, if asked; then machined edges on every part.
  if (params.accentBand) { const t = zoneH(receiver) * .09; b.rect(receiver.z0, receiver.y1 - t, zoneW(receiver), t, p.accent); b.rect(receiver.z0, receiver.y0, zoneW(receiver), t, p.accent); }
  paintPartEdges(b, f.parts, numberParam(params, "edges", .8));

  // 9. Wear and grain. The recipe's own patina is added to the instance wear rolled from a crate.
  paintWear(b, f.parts, window, Math.min(1, numberParam(params, "wear", .12) + ctx.wear * .8), rng, p.base, ctx.detail);
  paintGrain(b, window, numberParam(params, "grain", .5), rng, ctx.detail);
  void inkOn;
}

/** Only what should glow in the dark: emissive motifs and glow-marked text. Everything else is black. */
function paintEmissive(b: Brush, params: Params, palette: Palette, rng: () => number, ctx: RenderContext): void {
  const f = ctx.frame, p = inks(params, palette);
  b.zone(b.window, "#000000");
  const hero = stringParam(params, "hero");
  if (hero) { b.save(); b.clipZone(insetZone(f.receiver, -zoneW(f.receiver) * .1, -zoneH(f.receiver) * .2)); drawMotif(b, hero, f.receiver, numberParam(params, "heroScale", 1.15), p, mulberry32(ctx.def.seed), heroPlacement(params, f.receiver).dz, numberParam(params, "heroDy", 0), numberParam(params, "heroRot", 0), "emissive"); b.restore(); }
  for (const [key, z] of [["magMotif", f.magazine], ["stockMotif", f.stock], ["frontMotif", f.front], ["gripMotif", f.grip]] as const) {
    const name = stringParam(params, key); if (name && z) drawMotif(b, name, z, numberParam(params, key.replace("Motif", "Scale"), .8), p, rng, numberParam(params, `${key}Dz`, 0), numberParam(params, `${key}Dy`, 0), numberParam(params, `${key}Rot`, 0), "emissive");
  }
  if (params.glowText) {
    const stockText = stringParam(params, "stockText"), frontText = stringParam(params, "frontText"), receiverText = stringParam(params, "receiverText");
    if (stockText && f.stock) legend(b, insetZone(f.stock, zoneW(f.stock) * .08, zoneH(f.stock) * .2), stockText, p.glow, undefined, !!params.italic, 0, numberParam(params, "textSize", .05));
    if (frontText && f.front) legend(b, insetZone(f.front, zoneW(f.front) * .1, zoneH(f.front) * .22), frontText, p.glow, undefined, !!params.italic, 0, numberParam(params, "textSize", .035));
    if (receiverText) legend(b, { ...f.receiver, y0: f.receiver.y0 + zoneH(f.receiver) * numberParam(params, "receiverTextY", .55) }, receiverText, p.glow, undefined, !!params.italic, 0, numberParam(params, "receiverTextSize", .03));
  }
  if (params.glowPattern) {
    const style = { colors: [p.glow], scale: numberParam(params, "patternScale", .35), angle: numberParam(params, "patternAngle", 62) * Math.PI / 180, alpha: .9 };
    for (const z of zonesNamed(ctx, listParam(params, "patternOn").length ? listParam(params, "patternOn") : ["stock", "front"])) paintPattern(b, z, patternKind(params.pattern), style, rng);
  }
}
