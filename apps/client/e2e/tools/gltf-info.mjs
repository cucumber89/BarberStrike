#!/usr/bin/env node
/**
 * Reads a .glb straight from disk and prints what the asset pipeline cares about: node names,
 * animation clips, materials, and the model's bounding box in its OWN units.
 *
 * Why this exists (drop 6b): the weapon rig classifier and the anchor fitter are pure functions
 * tested against a fixture of node names. A fixture can drift from the files. This tool reads the
 * files, so "the rig finds the magazine" can be checked against the real asset without a browser,
 * a GPU, or a running game.
 *
 * Usage: node e2e/tools/gltf-info.mjs public/models/raw/firearms/*.glb
 *        node e2e/tools/gltf-info.mjs --json public/models/raw/firearms/P320.glb
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

/** Splits a GLB container into its JSON manifest and its binary buffer. */
export function readGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a GLB");
  let off = 12, json = null, bin = null;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(buf.subarray(start, start + len)));
    else if (type === BIN_CHUNK) bin = buf.subarray(start, start + len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error("no JSON chunk");
  return { json, bin };
}

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
};
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** glTF node transform → a row-major 4×4, matching the file's column-major storage on `matrix`. */
function nodeMatrix(n) {
  if (n.matrix) {
    const m = n.matrix; // column-major in the file
    return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];
  }
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy - wz) * sy, (xz + wy) * sz, tx,
    (xy + wz) * sx, (1 - (xx + zz)) * sy, (yz - wx) * sz, ty,
    (xz - wy) * sx, (yz + wx) * sy, (1 - (xx + yy)) * sz, tz,
    0, 0, 0, 1,
  ];
}

const apply = (m, p) => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];

/**
 * World-space bounding box per NAMED node, covering the node and everything under it — taken from
 * each POSITION accessor's declared min/max, which glTF requires, so no vertex data is decoded.
 */
export function nodeBoxes(json) {
  const out = new Map();
  /** Returns the subtree's world box so a GROUP node (`Magazines`, `Barrels`) gets one too. */
  const walk = (idx, parent) => {
    const n = json.nodes[idx];
    const world = mul(parent, nodeMatrix(n));
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const grow = (p) => { for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); } };
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives ?? []) {
        const acc = json.accessors?.[prim.attributes?.POSITION];
        if (!acc?.min || !acc?.max) continue;
        // All eight corners: a rotated box's extremes are corners, not the min/max pair.
        for (let i = 0; i < 8; i++) {
          grow(apply(world, [i & 1 ? acc.max[0] : acc.min[0], i & 2 ? acc.max[1] : acc.min[1], i & 4 ? acc.max[2] : acc.min[2]]));
        }
      }
    }
    for (const c of n.children ?? []) {
      const cb = walk(c, world);
      if (cb) { grow(cb.min); grow(cb.max); }
    }
    if (!Number.isFinite(min[0])) return null;
    const box = { min, max };
    if (n.name && !out.has(n.name)) out.set(n.name, box);
    return box;
  };
  for (const s of json.scenes?.[json.scene ?? 0]?.nodes ?? []) walk(s, identity());
  return out;
}

export function summarize(file) {
  const { json } = readGlb(readFileSync(file));
  const boxes = nodeBoxes(json);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes.values()) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
  return {
    file: basename(file),
    nodes: (json.nodes ?? []).map((n) => n.name).filter(Boolean),
    meshNodes: [...boxes.keys()],
    primitives: (json.meshes ?? []).reduce((s, m) => s + (m.primitives?.length ?? 0), 0),
    materials: (json.materials ?? []).map((m) => m.name),
    animations: (json.animations ?? []).map((a) => a.name),
    skins: (json.skins ?? []).length,
    joints: json.skins?.[0]?.joints?.length ?? 0,
    boneNames: (json.skins?.[0]?.joints ?? []).map((j) => json.nodes[j]?.name).filter(Boolean),
    images: (json.images ?? []).length,
    size: Number.isFinite(min[0]) ? [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((v) => +v.toFixed(4)) : null,
    min: Number.isFinite(min[0]) ? min.map((v) => +v.toFixed(4)) : null,
    max: Number.isFinite(max[0]) ? max.map((v) => +v.toFixed(4)) : null,
    boxes: Object.fromEntries([...boxes].map(([k, v]) => [k, { min: v.min.map((x) => +x.toFixed(4)), max: v.max.map((x) => +x.toFixed(4)) }])),
  };
}

const args = process.argv.slice(2);
const asJson = args[0] === "--json";
const files = asJson ? args.slice(1) : args;
if (files.length === 0) { console.error("usage: gltf-info.mjs [--json] <file.glb>..."); process.exit(2); }
const all = files.map(summarize);
if (asJson) { console.log(JSON.stringify(all.length === 1 ? all[0] : all, null, 2)); }
else {
  for (const s of all) {
    console.log(`\n=== ${s.file}`);
    console.log(`  size ${s.size?.join(" × ")}  min ${s.min?.join(",")}  max ${s.max?.join(",")}`);
    console.log(`  ${s.nodes.length} nodes, ${s.meshNodes.length} with geometry, ${s.primitives} primitives, ${s.materials.length} materials, ${s.images} images`);
    if (s.skins) console.log(`  skin: ${s.joints} joints, ${s.animations.length} clips`);
    console.log(`  nodes: ${s.nodes.join(", ")}`);
    if (s.animations.length) console.log(`  clips: ${s.animations.join(", ")}`);
  }
}
