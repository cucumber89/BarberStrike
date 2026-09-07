/**
 * Weapon parts check (2.1, drop A): "nothing floats" made numeric.
 *
 * Given every part of a weapon as a measured axis-aligned box in the gun's final frame (+Z forward,
 * +Y up, +X right, metres, origin at the top of the grip — the frame `weaponModels.ts` hands the
 * viewmodel), plus the anchors the game actually uses (grip origin, muzzle, aim point, ejection
 * port, the support hand), this module answers:
 *
 *  - which part is the RECEIVER (the thing everything else must hang off);
 *  - for every part, how far it is from the receiver and from its nearest neighbour, and whether it
 *    is ATTACHED — connected to the receiver through a chain of parts that touch (gap ≤ tolerance).
 *    A barrel that touches the handguard that touches the receiver is attached; "distance to the
 *    receiver" alone would flag every muzzle device on every rifle, so attachment is the verdict and
 *    the two distances are the evidence;
 *  - for every anchor, whether it lies on (within tolerance of) the part it is supposed to be on:
 *    the grip origin on the grip, the muzzle on the barrel, the aim point on the sights, the eject
 *    on the port, the support hand touching the fore-end.
 *
 * Pure geometry, no Babylon, so it runs in vitest and in `e2e/tools/weapon-parts.mjs` alike. The
 * measuring (Babylon for glTF, arithmetic for the procedural specs) lives elsewhere; this file only
 * judges boxes.
 */

import type { PartBox } from "./weaponFit";
import { centre, sizeOf, unionBox } from "./weaponFit";

export interface NamedBox { name: string; box: PartBox }

/** 5 mm: the plan's threshold. Anything closer than this is "touching" at game scale. */
export const ATTACH_TOL = 0.005;

/** Euclidean gap between two boxes: 0 when they overlap or touch. */
export function boxGap(a: PartBox, b: PartBox): number {
  let sq = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.max(0, a.min[i] - b.max[i], b.min[i] - a.max[i]);
    sq += d * d;
  }
  return Math.sqrt(sq);
}

/** Distance from a point to a box: 0 when the point is inside. */
export function pointGap(p: [number, number, number], b: PartBox): number {
  let sq = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.max(0, b.min[i] - p[i], p[i] - b.max[i]);
    sq += d * d;
  }
  return Math.sqrt(sq);
}

const volume = (b: PartBox): number => { const s = sizeOf(b); return Math.max(0, s[0]) * Math.max(0, s[1]) * Math.max(0, s[2]); };
const norm = (s: string): string => s.toLowerCase().replace(/\.\d+$/, "").replace(/[\s-]+/g, "_");

/** Names the pack (and any sane modeller) gives the receiver. Exact after normalisation. */
const RECEIVER = /^(receiver|frame|body|lower|upper|lower_receiver|upper_receiver|main_body|chassis)$/;

/**
 * Picks the receiver: a part NAMED as one, else the largest part by volume that is not the
 * magazine (a drum or a box mag can out-volume a pistol frame). `exclude` lists names that must
 * not be chosen (the magazine, the action, projectiles).
 */
export function pickReceiver(parts: NamedBox[], exclude: string[] = []): NamedBox | undefined {
  const ex = new Set(exclude.map(norm));
  const named = parts.find((p) => RECEIVER.test(norm(p.name)) && !ex.has(norm(p.name)));
  if (named) return named;
  let best: NamedBox | undefined;
  for (const p of parts) {
    if (ex.has(norm(p.name))) continue;
    if (!best || volume(p.box) > volume(best.box)) best = p;
  }
  return best;
}

export interface PartRow {
  name: string;
  box: PartBox;
  /** Gap to the receiver box (0 = touching / overlapping). */
  toReceiver: number;
  /** Gap to the nearest OTHER part, and which one. */
  toNearest: number;
  nearest: string;
  /** Connected to the receiver through parts that touch within the tolerance. */
  attached: boolean;
}

/**
 * Attachment by union-find over "gap ≤ tol" edges. O(n²) on a few dozen boxes — trivial.
 * Every part is measured; the receiver itself is attached by definition.
 */
export function attachParts(parts: NamedBox[], receiver: NamedBox, tol = ATTACH_TOL): PartRow[] {
  const n = parts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const rows: PartRow[] = parts.map((p) => ({ name: p.name, box: p.box, toReceiver: boxGap(p.box, receiver.box), toNearest: Infinity, nearest: "", attached: false }));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const g = boxGap(parts[i].box, parts[j].box);
      if (g <= tol) union(i, j);
      if (g < rows[i].toNearest) { rows[i].toNearest = g; rows[i].nearest = parts[j].name; }
      if (g < rows[j].toNearest) { rows[j].toNearest = g; rows[j].nearest = parts[i].name; }
    }
  }
  const ri = parts.indexOf(receiver);
  const root = ri >= 0 ? find(ri) : -1;
  for (let i = 0; i < n; i++) {
    rows[i].attached = ri >= 0 && find(i) === root;
    if (rows[i].toNearest === Infinity) { rows[i].toNearest = 0; rows[i].nearest = "—"; }
  }
  return rows;
}

export interface AnchorCheck {
  anchor: string;
  point: [number, number, number];
  /** Part(s) the anchor is expected on; empty when the model names no such part and the check is informational. */
  expected: string;
  /** Gap from the point to the expected part (or to the whole gun when nothing is named). */
  gap: number;
  ok: boolean;
  note?: string;
}

export interface AnchorInput {
  /** The point the viewmodel hangs the gun from (always (0,0,0) after the loader's shift). */
  gripOrigin: [number, number, number];
  muzzle: [number, number, number];
  aimPoint: [number, number, number];
  eject?: [number, number, number];
  /** Where the support hand's box is centred, and its size. */
  supportHand?: { centre: [number, number, number]; size: [number, number, number] };
  /** Parts that should carry each anchor, when the model names them. */
  grip?: NamedBox[];
  barrel?: NamedBox[];
  sights?: NamedBox[];
  ejectPort?: NamedBox[];
  magazine?: NamedBox[];
}

function onParts(anchor: string, point: [number, number, number], expected: NamedBox[] | undefined, fallback: NamedBox[], tol: number, fallbackNote: string): AnchorCheck {
  if (expected && expected.length > 0) {
    let best = expected[0], gap = Infinity;
    for (const p of expected) { const g = pointGap(point, p.box); if (g < gap) { gap = g; best = p; } }
    return { anchor, point, expected: best.name, gap, ok: gap <= tol };
  }
  // Nothing named: the anchor must at least lie on the gun somewhere.
  let gap = Infinity, name = "—";
  for (const p of fallback) { const g = pointGap(point, p.box); if (g < gap) { gap = g; name = p.name; } }
  return { anchor, point, expected: "", gap, ok: gap <= tol, note: `${fallbackNote}; nearest ${name}` };
}

/**
 * Judges every anchor against the part it belongs on. `parts` is the whole gun (statics + moving),
 * used as the fallback when the rig named nothing for a role.
 */
export function checkAnchors(input: AnchorInput, parts: NamedBox[], receiver: NamedBox | undefined, tol = ATTACH_TOL): AnchorCheck[] {
  const out: AnchorCheck[] = [];
  out.push(onParts("grip", input.gripOrigin, input.grip, parts, tol, "no grip part named"));
  out.push(onParts("muzzle", input.muzzle, input.barrel, parts, tol, "no barrel part named"));
  if (input.sights && input.sights.length > 0) {
    // The aim point is the rear notch at the front post's height: on the span the two sights cover.
    const span = unionBox(input.sights.map((s) => s.box));
    const gap = pointGap(input.aimPoint, span);
    out.push({ anchor: "aimPoint", point: input.aimPoint, expected: input.sights.map((s) => s.name).join("+"), gap, ok: gap <= tol });
  } else {
    out.push(onParts("aimPoint", input.aimPoint, undefined, parts, tol, "no sight part named"));
  }
  if (input.eject) {
    out.push(input.ejectPort && input.ejectPort.length > 0
      ? onParts("eject", input.eject, input.ejectPort, parts, tol, "")
      : onParts("eject", input.eject, undefined, parts, tol, "no ejection port named"));
  }
  if (input.magazine && input.magazine.length > 0 && receiver) {
    // Seated = touching the well it lives in: the receiver on a rifle, the grip on a pistol, the
    // magwell block on a DMR. So the nearest STATIC part decides, and is named.
    const mag = unionBox(input.magazine.map((m) => m.box));
    const magNames = new Set(input.magazine.map((m) => m.name));
    let gap = Infinity, on = receiver.name;
    for (const p of parts) { if (magNames.has(p.name)) continue; const g = boxGap(mag, p.box); if (g < gap) { gap = g; on = p.name; } }
    if (gap === Infinity) { gap = boxGap(mag, receiver.box); on = receiver.name; }
    out.push({ anchor: "magazine", point: centre(mag), expected: on, gap, ok: gap <= tol, note: "magazine box seated in its well" });
  }
  if (input.supportHand) {
    const h = input.supportHand;
    const hb: PartBox = { min: [h.centre[0] - h.size[0] / 2, h.centre[1] - h.size[1] / 2, h.centre[2] - h.size[2] / 2], max: [h.centre[0] + h.size[0] / 2, h.centre[1] + h.size[1] / 2, h.centre[2] + h.size[2] / 2] };
    let gap = Infinity, name = "—";
    for (const p of parts) { const g = boxGap(hb, p.box); if (g < gap) { gap = g; name = p.name; } }
    // Touching is not enough: a hand on the flash hider touches the gun. Its front must stay a
    // hand's width (3 cm) behind the muzzle.
    const clearance = input.muzzle[2] - hb.max[2];
    const clear = clearance >= 0.03;
    out.push({ anchor: "supportHand", point: h.centre, expected: name, gap, ok: gap <= tol && clear, note: clear ? "left hand box touches the gun, clear of the muzzle" : `left hand ${(clearance * 1000).toFixed(0)} mm from the muzzle` });
  }
  return out;
}

export interface WeaponReport {
  id: string;
  source: "gltf" | "procedural";
  receiver: string;
  whole: PartBox;
  parts: PartRow[];
  anchors: AnchorCheck[];
  /** Parts not attached to the receiver. */
  floating: string[];
  /** Anchors off their part. */
  misplaced: string[];
  ok: boolean;
}

export function judgeWeapon(id: string, source: WeaponReport["source"], parts: NamedBox[], receiver: NamedBox, anchors: AnchorInput, tol = ATTACH_TOL): WeaponReport {
  const rows = attachParts(parts, receiver, tol);
  const checks = checkAnchors(anchors, parts, receiver, tol);
  const floating = rows.filter((r) => !r.attached).map((r) => r.name);
  const misplaced = checks.filter((c) => !c.ok).map((c) => c.anchor);
  return { id, source, receiver: receiver.name, whole: unionBox(parts.map((p) => p.box)), parts: rows, anchors: checks, floating, misplaced, ok: floating.length === 0 && misplaced.length === 0 };
}

const mm = (m: number): string => (m * 1000).toFixed(1);
const v3 = (p: [number, number, number]): string => `(${p.map((x) => x.toFixed(3)).join(", ")})`;

/** One markdown section per weapon; the summary line is what `weapon-parts.mjs` prints. */
export function formatReport(r: WeaponReport): string {
  const lines: string[] = [];
  const s = sizeOf(r.whole);
  lines.push(`## ${r.id} (${r.source}) — ${r.ok ? "PASS" : "FAIL"}`);
  lines.push(`receiver: \`${r.receiver}\`; gun box ${v3(r.whole.min)} … ${v3(r.whole.max)} (${mm(s[0])} × ${mm(s[1])} × ${mm(s[2])} mm); ${r.parts.length} parts, ${r.floating.length} floating, ${r.misplaced.length} anchors off`);
  lines.push("");
  lines.push("| part | box min | box max | to receiver mm | nearest (mm) | attached |");
  lines.push("|---|---|---|---|---|---|");
  for (const p of r.parts) lines.push(`| ${p.name} | ${v3(p.box.min)} | ${v3(p.box.max)} | ${mm(p.toReceiver)} | ${p.nearest} (${mm(p.toNearest)}) | ${p.attached ? "yes" : "**NO**"} |`);
  lines.push("");
  lines.push("| anchor | point | on | gap mm | ok | note |");
  lines.push("|---|---|---|---|---|---|");
  for (const a of r.anchors) lines.push(`| ${a.anchor} | ${v3(a.point)} | ${a.expected || "—"} | ${mm(a.gap)} | ${a.ok ? "yes" : "**NO**"} | ${a.note ?? ""} |`);
  lines.push("");
  return lines.join("\n");
}

export function summaryLine(reports: WeaponReport[]): string {
  const bad = reports.filter((r) => !r.ok);
  const detail = bad.map((r) => `${r.id}[${[...r.floating.map((f) => `float:${f}`), ...r.misplaced.map((m) => `anchor:${m}`)].join(",")}]`).join(" ");
  return `weapon-parts: ${reports.length - bad.length}/${reports.length} pass${bad.length ? ` — FAIL ${detail}` : ""}`;
}
