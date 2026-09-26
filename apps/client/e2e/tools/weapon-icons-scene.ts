/**
 * Browser-side half of `weapon-icons.mjs`, imported through Vite's `/@fs/` path so its bare
 * `@frankibarber/*` and view imports resolve.
 *
 * WHY NOT A LIVE BABYLON RENDER. The first cut built each weapon with `buildWeaponModel` and shot it
 * with an ArcRotateCamera. Under headless SwiftShader the PBR/Standard shaders never reached
 * `isReady` (their `#include` chunks are side-effect registrations a tree-shaken standalone import
 * drops, so the engine fell back to a URL fetch → ERR_CONNECTION_REFUSED), and every draw call was
 * skipped: a flat clear colour, zero opaque pixels. Rather than depend on the full app's module
 * graph and a running match (what `weapon-shots.mjs` needs), this renders the SAME geometry a
 * different, shader-free way: `proceduralParts(id)` — the exact box/cylinder AABBs the game builds —
 * projected through a 3/4 camera and painted as sorted, shaded quads on a 2D canvas. Deterministic,
 * no GPU, real geometry, true alpha.
 */
import type { WeaponId } from "@frankibarber/shared";
import { WEAPON_ART, WEAPON_ART_IDS } from "@frankibarber/shared";
import { proceduralParts, type NamedBox } from "../../src/game/view/weaponMeshes";
import type { MatKey } from "../../src/game/view/weaponMeshes";

export interface IconResult { id: string; png: string; opaque: number; radius: number }

type Vec3 = [number, number, number];

/** Base albedo per material, and a rim tint for lit faces — enough to read the parts apart. */
const MAT_COLOR: Record<MatKey, [number, number, number]> = {
  metal: [116, 122, 130],
  steel: [176, 182, 190],
  polymer: [38, 40, 44],
  tan: [176, 148, 104],
  wood: [120, 82, 48],
  rubber: [26, 27, 30],
  brass: [198, 158, 74],
  lens: [70, 120, 150],
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The eight corners of an AABB. */
function corners(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < 8; i++) out.push([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
  return out;
}

/** The six faces of an AABB as corner-index quads, with the outward normal of each. */
const FACES: { idx: [number, number, number, number]; n: Vec3 }[] = [
  { idx: [0, 1, 3, 2], n: [0, 0, -1] }, { idx: [4, 6, 7, 5], n: [0, 0, 1] },
  { idx: [0, 2, 6, 4], n: [-1, 0, 0] }, { idx: [1, 5, 7, 3], n: [1, 0, 0] },
  { idx: [0, 4, 5, 1], n: [0, -1, 0] }, { idx: [2, 3, 7, 6], n: [0, 1, 0] },
];

const D2R = Math.PI / 180;

/**
 * Render one weapon's parts to a size×size RGBA buffer, three-quarter, with alpha. A right-handed
 * look-at camera (the same 3/4 as `WEAPON_ART`) with an orthographic projection framed to the model
 * — orthographic keeps a long rifle from foreshortening into a wedge and needs no near/far tuning.
 */
function renderParts(parts: NamedBox[], id: WeaponId, size: number): { rgba: Uint8ClampedArray; opaque: number; radius: number } {
  // Model bounds.
  let mn: Vec3 = [Infinity, Infinity, Infinity];
  let mx: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.box.min[k]); mx[k] = Math.max(mx[k], p.box.max[k]); } }
  const center: Vec3 = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const radius = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2;

  const a = WEAPON_ART[id];
  // Camera direction: front-upper-left 3/4. eye = center + dir * distance.
  const yaw = a.yawDeg * D2R, pitch = a.pitchDeg * D2R;
  const dir: Vec3 = norm([-Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)]);
  const worldUp: Vec3 = [0, 1, 0];
  const right = norm(cross(worldUp, dir));
  const up = cross(dir, right);
  const eye = add(center, scale(dir, radius * 3));
  const light = norm([-0.5, 0.85, -0.35]); // key light for face shading

  // Orthographic half-extent: fit the model's projected bounds, times the art's margin. The 3D
  // radius (half the diagonal) overestimates a long thin gun's silhouette, so a tight factor still
  // leaves headroom; the content-crop below removes whatever transparent margin is left.
  const half = radius * 0.9 * a.zoom;
  const px = size / (2 * half);

  const project = (w: Vec3): { sx: number; sy: number; depth: number } => {
    const rel = sub(w, eye);
    const cx = dot(rel, right), cy = dot(rel, up), cz = dot(rel, dir); // camera space
    return { sx: size / 2 + cx * px, sy: size / 2 - cy * px, depth: cz };
  };

  // One quad to paint: its screen polygon, its average depth (painter sort), its shaded colour.
  interface Quad { pts: [number, number][]; depth: number; col: [number, number, number] }
  const quads: Quad[] = [];
  const viewDir = scale(dir, -1); // from surface toward camera
  for (const part of parts) {
    const mat = (part.name.slice(part.name.indexOf(":") + 1) as MatKey) || "metal";
    const base = MAT_COLOR[mat] ?? MAT_COLOR.metal;
    const cs = corners(part.box.min as Vec3, part.box.max as Vec3);
    for (const f of FACES) {
      // Back-face cull against the camera.
      if (dot(f.n, viewDir) <= 0.02) continue;
      const lit = Math.max(0, dot(f.n, light));
      const shade = 0.44 + 0.78 * lit; // ambient + diffuse, a touch brighter and higher-contrast so
      // the gun reads as a lit object rather than a flat grey blob (clamped to 255 below).
      const col: [number, number, number] = [
        Math.min(255, Math.round(base[0] * shade)),
        Math.min(255, Math.round(base[1] * shade)),
        Math.min(255, Math.round(base[2] * shade)),
      ];
      const proj = f.idx.map((i) => project(cs[i]));
      quads.push({ pts: proj.map((p) => [p.sx, p.sy]) as [number, number][], depth: (proj[0].depth + proj[1].depth + proj[2].depth + proj[3].depth) / 4, col });
    }
  }
  // Painter's algorithm: far first (larger camera-space z = farther along view dir).
  quads.sort((p, q) => q.depth - p.depth);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, size, size);
  g.lineJoin = "round";
  for (const q of quads) {
    g.beginPath();
    g.moveTo(q.pts[0][0], q.pts[0][1]);
    for (let i = 1; i < q.pts.length; i++) g.lineTo(q.pts[i][0], q.pts[i][1]);
    g.closePath();
    const fill = `rgb(${q.col[0]},${q.col[1]},${q.col[2]})`;
    g.fillStyle = fill;
    g.strokeStyle = fill; // a hairline stroke seals the seam between coplanar quads (no gaps)
    g.lineWidth = 1;
    g.fill();
    g.stroke();
  }
  const data = g.getImageData(0, 0, size, size);
  let opaque = 0;
  for (let i = 3; i < data.data.length; i += 4) if (data.data[i] > 8) opaque++;
  return { rgba: data.data, opaque, radius };
}

/** Tight alpha bounding box of an RGBA buffer (pixels with alpha > 8), or null if fully clear. */
function alphaBounds(rgba: Uint8ClampedArray, size: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Every shop weapon as a base64 PNG, three-quarter, transparent background — CROPPED to the gun's
 * own bounding box (+ a small pad). A square canvas around a wide, short gun is mostly transparent
 * margin, and `object-fit: contain` in the shop tile then shrinks the whole square (gun included)
 * to fit the tile's height, so the gun read as a tiny thumbnail. Cropping to content gives the PNG
 * the gun's real aspect, so the tile fills its width with the gun and it reads large.
 */
export function renderWeaponIcons(size: number): IconResult[] {
  const out: IconResult[] = [];
  for (const id of WEAPON_ART_IDS) {
    const pp = proceduralParts(id);
    const parts = [...pp.parts, ...pp.magazine];
    const { rgba, opaque, radius } = renderParts(parts, id, size);

    const full = document.createElement("canvas");
    full.width = full.height = size;
    full.getContext("2d")!.putImageData(new ImageData(rgba, size, size), 0, 0);

    const b = alphaBounds(rgba, size);
    let outCanvas = full;
    if (b) {
      const pad = Math.round(size * 0.03);
      const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
      const w = Math.min(size - x, b.w + pad * 2), h = Math.min(size - y, b.h + pad * 2);
      const crop = document.createElement("canvas");
      crop.width = w; crop.height = h;
      crop.getContext("2d")!.drawImage(full, x, y, w, h, 0, 0, w, h);
      outCanvas = crop;
    }
    const png = outCanvas.toDataURL("image/png").split(",")[1];
    out.push({ id, png, opaque, radius });
  }
  return out;
}
