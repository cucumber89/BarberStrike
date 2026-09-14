import type { WeaponId } from "@frankibarber/shared";
import type { FramePart, MatKey, Side, SkinFrame, Zone } from "./types";

/** One input box in weapon-root metres, as `proceduralParts` reports it. */
export interface FrameBox { min: [number, number, number]; max: [number, number, number]; mat: MatKey; magazine?: boolean }

const MARGIN_Z = 1.05, MARGIN_Y = 1.14;
/** Candidate texture shapes; the best pixel density that stays within eight megabytes wins. */
const SHAPES: [number, number][] = [[1024, 1024], [2048, 1024], [1024, 512]];
export const zoneW = (z: Zone): number => z.z1 - z.z0;
export const zoneH = (z: Zone): number => z.y1 - z.y0;
export const zoneCz = (z: Zone): number => (z.z0 + z.z1) / 2;
export const zoneCy = (z: Zone): number => (z.y0 + z.y1) / 2;
export function unionZones(zones: readonly Zone[]): Zone | null {
  if (!zones.length) return null;
  return zones.reduce((a, b) => ({ z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }));
}
export const insetZone = (z: Zone, dz: number, dy = dz): Zone => ({ z0: z.z0 + dz, z1: z.z1 - dz, y0: z.y0 + dy, y1: z.y1 - dy });
const boxZone = (b: FrameBox): Zone => ({ z0: b.min[2], z1: b.max[2], y0: b.min[1], y1: b.max[1] });

/**
 * Lays a weapon out on its texture from part bounds. `boxes[0]` is the receiver by the procedural
 * model's own convention. Parts entirely behind the receiver form the stock, parts entirely ahead
 * of it the fore-end, parts hanging under it (that are not the magazine) the grip.
 */
export const PAINTABLE_MATS: ReadonlySet<MatKey> = new Set<MatKey>(["metal", "polymer", "tan", "wood"]);
export function buildFrame(weapon: WeaponId, boxes: readonly FrameBox[], paintable: ReadonlySet<MatKey> = PAINTABLE_MATS): SkinFrame {
  if (!boxes.length) throw new RangeError("A frame needs at least one part");
  const parts: FramePart[] = boxes.map(b => ({ zone: boxZone(b), mat: b.mat, magazine: !!b.magazine }));
  const body = unionZones(parts.map(p => p.zone))!;
  // The hero goes on the receiver, unless that receiver keeps its factory finish: then it goes on
  // the largest flat that does take paint (a pump gun's wooden fore-end, say).
  const painted = parts.filter(p => paintable.has(p.mat) && !p.magazine);
  const receiver = paintable.has(parts[0].mat) || !painted.length ? parts[0].zone : painted.reduce((a, b) => zoneW(b.zone) * zoneH(b.zone) > zoneW(a.zone) * zoneH(a.zone) ? b : a).zone;
  const fixed = parts.filter(p => !p.magazine);
  // A zone is the largest single flat in its region, not the union: a legend on the union of two
  // skeleton-stock rods would fall into the gap between them.
  const largest = (zones: Zone[]): Zone | null => zones.length ? zones.reduce((a, b) => zoneW(b) * zoneH(b) > zoneW(a) * zoneH(a) ? b : a) : null;
  const magazine = largest(parts.filter(p => p.magazine).map(p => p.zone));
  const stock = largest(fixed.filter(p => p.zone.z1 <= receiver.z0 + .015 && zoneW(p.zone) > .03).map(p => p.zone));
  const front = largest(fixed.filter(p => p.zone.z0 >= receiver.z1 - .015 && zoneW(p.zone) > .03 && zoneH(p.zone) > .012).map(p => p.zone));
  const grip = largest(fixed.filter(p => p.zone.y1 <= receiver.y0 + .012 && p.zone.z0 < receiver.z1 && p.zone.z1 > receiver.z0 && zoneH(p.zone) > .02).map(p => p.zone));
  const zRange = zoneW(body) * MARGIN_Z, yRange = zoneH(body) * MARGIN_Y;
  let best: { width: number; height: number; zSpan: number; ppm: number } | null = null;
  for (const [width, height] of SHAPES) {
    const aspect = width / height;
    const zSpan = Math.max(zRange, yRange * 2 * aspect);
    const ppm = width / zSpan;
    const bytes = width * height * 4;
    // Beyond ~2400 px/m nothing is gained in the Armoury or the viewmodel: take the cheaper texture.
    if (!best || (ppm > best.ppm * 1.1 && bytes <= 8 << 20 && best.ppm < 2400) || (ppm >= 2400 && bytes < best.width * best.height * 4)) best = { width, height, zSpan, ppm };
  }
  const { width, height, zSpan } = best!;
  const ySpan = zSpan / (2 * width / height);
  return {
    weapon, width, height,
    z0: zoneCz(body) - zSpan / 2, zSpan,
    y0: zoneCy(body) - ySpan / 2, ySpan,
    body, receiver, magazine, stock, front, grip, parts,
  };
}

/**
 * The side-elevation projection. Flanks map z → u and y → v inside their band: the right flank
 * (+x) takes the upper half of the texture, the left flank the lower. Top, bottom and end faces
 * borrow the band of the flank they touch and slide along it by their own width, so a pattern wraps
 * over an edge instead of stopping at it. Clamping keeps a face inside its band; the texture never
 * repeats.
 */
export function frameUv(f: SkinFrame, x: number, y: number, z: number, nx: number, ny: number, nz: number): [number, number] {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const side: Side = (axis === 0 ? nx : x) >= 0 ? "right" : "left";
  const zz = axis === 2 ? z + x : z;
  const yy = axis === 1 ? y + x : y;
  const u = Math.min(.999, Math.max(.001, (zz - f.z0) / f.zSpan));
  const vBand = Math.min(.998, Math.max(.002, (yy - f.y0) / f.ySpan));
  return [u, side === "right" ? .5 + vBand * .5 : vBand * .5];
}

/** Canvas pixel rectangle of one band; y grows downwards, so the right flank sits on top. */
export function bandPx(f: SkinFrame, side: Side): { x: number; y: number; w: number; h: number } {
  return { x: 0, y: side === "right" ? 0 : f.height / 2, w: f.width, h: f.height / 2 };
}

/** A believable rifle layout for thumbnails, cards and tests, where no procedural model is at hand. */
export function genericFrame(weapon: WeaponId = "rifle"): SkinFrame {
  const boxes: FrameBox[] = [
    { min: [-.025, .01, -.04], max: [.025, .08, .34], mat: "metal" },              // receiver
    { min: [-.02, -.06, .0], max: [.02, .02, .07], mat: "polymer" },               // grip
    { min: [-.018, -.04, -.32], max: [.018, .07, -.04], mat: "polymer" },          // stock
    { min: [-.02, .02, .34], max: [.02, .07, .62], mat: "polymer" },               // handguard
    { min: [-.008, .04, .62], max: [.008, .056, .8], mat: "steel" },               // barrel
    { min: [-.015, -.11, .12], max: [.015, .01, .18], mat: "polymer", magazine: true },
    { min: [-.012, .08, .05], max: [.012, .11, .2], mat: "steel" },                // rail / sight
  ];
  return buildFrame(weapon, boxes);
}
