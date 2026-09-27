/**
 * Voxel kit — "z pikseli": a piece of furniture is drawn as PICTURES made of characters (a plan,
 * a front view, a side view), each extruded a few cells, and compiled into one optimised mesh.
 *
 * WHY. The owner wants every room of DOLNA 17 to live — a stove, the fridge, the couch, the
 * barber's wash unit — without a modelling tool and without draw calls. A picture of 6 × 18
 * characters is a fridge; the compiler keeps only the faces that show and merges neighbouring
 * faces of the same ink into one rectangle (greedy meshing), so a fridge is ~30 quads, not
 * 6 × 18 × 6 boxes. Colour is a vertex attribute: every matte thing on the map is ONE material,
 * every glossy thing one, every metal thing one — and the props merger (`props.ts`) folds all of
 * them into one mesh per material per 24 m zone. A kitchen is a handful of draw calls.
 *
 * THE FORMAT (text, so it can be typed, diffed and pasted into the lab page):
 *
 *   #model fridge            the id
 *   #cell 0.1                one character = 10 cm
 *   #ink W #e8e8e8 gloss     a character → colour (+ finish: matte | gloss | metal | glow | glass)
 *   #ink K #202020 metal
 *   #box 0,0,0 6,18,6 W      a filled block: at x,y,z (cells), size w,h,d — the bulk
 *   #part z n=1 at=0,0,6     a picture extruded along z, 1 cell deep, placed with its min corner
 *   WWWWWW                     at (0,0,6): rows are the FRONT VIEW as seen from +z, top row first,
 *   WW..WW                     columns as the viewer sees them (left = +x); "." is empty
 *   ...
 *
 * Axes of a part: "z" = the FRONT VIEW as a viewer standing at +z sees it (rows = y top→bottom,
 * columns left→right = the viewer's left→right, which in Babylon's left-handed world is +x → −x;
 * extruded toward +z); "y" = plan (rows = north→south i.e. +z → −z, cols = −x → +x, extruded
 * up); "x" = the side view as a viewer at +x sees it (rows = y, columns = −z → +z, extruded
 * toward +x). Later parts overwrite earlier cells.
 * The model's origin is the min corner of its grid; `voxelBounds` gives the metres, and the
 * client centres the footprint on the prop's x/z and stands it on its y (y = 0 is the bottom).
 *
 * Coordinates: +X east, +Y up, +Z north — the map's own. A prop's local +Z is its front.
 */

export type VoxelFinish = "matte" | "gloss" | "metal" | "glow" | "glass";
export interface VoxelInk { color: string; finish: VoxelFinish }
export type VoxelAxis = "x" | "y" | "z";

export interface VoxelPart {
  axis: VoxelAxis;
  /** Cells of extrusion along the axis (≥ 1). */
  n: number;
  /** Min corner of the part in model cells. */
  x: number; y: number; z: number;
  /** The picture: top row first for "z" / "x", north row first for "y". "." or " " is empty. */
  rows: string[];
}

export interface VoxelModel {
  id: string;
  /** Cell size in metres. */
  cell: number;
  palette: Record<string, VoxelInk>;
  parts: VoxelPart[];
}

/** One merged rectangle of a compiled model: a quad on a cell boundary, in model cells. */
export interface VoxelQuad {
  /** Outward normal axis and sign. */
  axis: VoxelAxis; dir: 1 | -1;
  /** Min corner (cells) and size (cells) in the two in-plane axes; `at` = the plane's coordinate. */
  at: number; u0: number; v0: number; du: number; dv: number;
  ink: string;
}

/** Compiled geometry of one finish group: flat arrays in METRES, ready for a vertex buffer. */
export interface VoxelGeometry {
  finish: VoxelFinish;
  /** For glow / glass groups: the one colour of the group (their material carries it as a uniform). */
  color?: string;
  positions: number[];
  normals: number[];
  /** RGBA per vertex, sRGB 0–1 (the client linearises for PBR). */
  colors: number[];
  uvs: number[];
  indices: number[];
  quads: number;
}

export interface VoxelCompiled {
  id: string;
  cell: number;
  /** Grid size in cells. */
  size: [number, number, number];
  groups: VoxelGeometry[];
  quads: number;
  /** Total voxels set. */
  voxels: number;
}

const EMPTY = 0;
const isEmptyChar = (c: string) => c === "." || c === " " || c === "";

// ======================= parsing / formatting =======================

/** Parses the text format described above. Throws on a malformed line, naming it. */
export function parseVoxelText(text: string): VoxelModel {
  const model: VoxelModel = { id: "", cell: 0.1, palette: {}, parts: [] };
  const lines = text.replace(/\r/g, "").split("\n");
  let part: VoxelPart | null = null;
  const flush = () => { if (part && part.rows.length) model.parts.push(part); part = null; };
  const num = (s: string, what: string, line: number) => {
    const v = Number(s);
    if (!Number.isFinite(v)) throw new Error(`voxel: line ${line}: ${what} is not a number: "${s}"`);
    return v;
  };
  const triple = (s: string | undefined, what: string, line: number): [number, number, number] => {
    const p = (s ?? "").split(",");
    if (p.length !== 3) throw new Error(`voxel: line ${line}: ${what} wants x,y,z`);
    return [num(p[0], what, line), num(p[1], what, line), num(p[2], what, line)];
  };
  lines.forEach((raw, i) => {
    const line = i + 1;
    const l = raw.replace(/\/\/.*$/, "").replace(/\s+$/, "");
    if (!l.trim()) { flush(); return; }
    if (l.startsWith("#")) {
      flush();
      const [cmd, ...args] = l.slice(1).trim().split(/\s+/);
      switch (cmd) {
        case "model": model.id = args[0] ?? ""; break;
        case "cell": model.cell = num(args[0], "cell", line); break;
        case "ink": {
          const [ch, color, finish] = args;
          if (!ch || ch.length !== 1 || isEmptyChar(ch)) throw new Error(`voxel: line ${line}: an ink is one character (not "." or space)`);
          if (!/^#[0-9a-fA-F]{6}$/.test(color ?? "")) throw new Error(`voxel: line ${line}: ink ${ch} wants a #rrggbb colour`);
          const f = (finish ?? "matte") as VoxelFinish;
          if (!["matte", "gloss", "metal", "glow", "glass"].includes(f)) throw new Error(`voxel: line ${line}: unknown finish "${finish}"`);
          model.palette[ch] = { color: color.toLowerCase(), finish: f };
          break;
        }
        case "box": {
          const [x, y, z] = triple(args[0], "box at", line);
          const [w, h, d] = triple(args[1], "box size", line);
          const ch = args[2];
          if (!ch || ch.length !== 1) throw new Error(`voxel: line ${line}: box wants an ink character`);
          const row = ch.repeat(Math.max(0, Math.round(w)));
          model.parts.push({ axis: "y", n: Math.round(h), x, y, z, rows: Array.from({ length: Math.round(d) }, () => row) });
          break;
        }
        case "part": {
          const axis = args[0] as VoxelAxis;
          if (!["x", "y", "z"].includes(axis)) throw new Error(`voxel: line ${line}: part axis is x, y or z`);
          let n = 1, at: [number, number, number] = [0, 0, 0];
          for (const a of args.slice(1)) {
            if (a.startsWith("n=")) n = Math.max(1, Math.round(num(a.slice(2), "n", line)));
            else if (a.startsWith("at=")) at = triple(a.slice(3), "at", line);
            else throw new Error(`voxel: line ${line}: unknown part option "${a}"`);
          }
          part = { axis, n, x: at[0], y: at[1], z: at[2], rows: [] };
          break;
        }
        default: throw new Error(`voxel: line ${line}: unknown directive #${cmd}`);
      }
      return;
    }
    if (!part) throw new Error(`voxel: line ${line}: picture rows need a #part first`);
    for (const ch of l) if (!isEmptyChar(ch) && !model.palette[ch]) throw new Error(`voxel: line ${line}: ink "${ch}" is not declared`);
    part.rows.push(l);
  });
  flush();
  if (!model.id) throw new Error("voxel: #model <id> is missing");
  if (!(model.cell > 0)) throw new Error("voxel: #cell must be positive");
  return model;
}

/** The inverse of `parseVoxelText`: what the lab page copies out. */
export function formatVoxelText(m: VoxelModel): string {
  const out = [`#model ${m.id}`, `#cell ${m.cell}`];
  for (const [ch, ink] of Object.entries(m.palette)) out.push(`#ink ${ch} ${ink.color}${ink.finish === "matte" ? "" : " " + ink.finish}`);
  for (const p of m.parts) {
    out.push("", `#part ${p.axis} n=${p.n} at=${p.x},${p.y},${p.z}`);
    out.push(...p.rows);
  }
  return out.join("\n") + "\n";
}

// ======================= the grid =======================

export interface VoxelGrid {
  size: [number, number, number];
  /** Palette index + 1 per cell (0 = empty), x fastest, then z, then y. */
  cells: Uint8Array;
  inks: string[];
  /** Cell offset of the parts' min corner: parts may start at negative cells. */
  origin: [number, number, number];
}

/** Cell extents of one part, in model cells (min inclusive, max exclusive). */
export function partExtent(p: VoxelPart): { min: [number, number, number]; max: [number, number, number] } {
  const rows = p.rows.length, cols = p.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const min: [number, number, number] = [p.x, p.y, p.z];
  const max: [number, number, number] = p.axis === "y" ? [p.x + cols, p.y + p.n, p.z + rows]
    : p.axis === "z" ? [p.x + cols, p.y + rows, p.z + p.n]
    : [p.x + p.n, p.y + rows, p.z + cols];
  return { min, max };
}

/** Rasterises the parts into a dense grid. */
export function voxelGrid(m: VoxelModel): VoxelGrid {
  const inks = Object.keys(m.palette);
  const index = new Map(inks.map((k, i) => [k, i + 1]));
  const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of m.parts) {
    const e = partExtent(p);
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], e.min[a]); hi[a] = Math.max(hi[a], e.max[a]); }
  }
  if (!m.parts.length || !Number.isFinite(lo[0])) return { size: [0, 0, 0], cells: new Uint8Array(0), inks, origin: [0, 0, 0] };
  const size: [number, number, number] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const [W, H, D] = size;
  const cells = new Uint8Array(W * H * D);
  const set = (x: number, y: number, z: number, v: number) => { cells[(y * D + z) * W + x] = v; };
  for (const p of m.parts) {
    const rows = p.rows.length, cols = p.rows.reduce((mx, r) => Math.max(mx, r.length), 0);
    for (let r = 0; r < rows; r++) {
      const row = p.rows[r];
      for (let c = 0; c < cols; c++) {
        const ch = row[c] ?? ".";
        if (isEmptyChar(ch)) continue;
        const v = index.get(ch);
        if (!v) throw new Error(`voxel ${m.id}: ink "${ch}" is not in the palette`);
        for (let k = 0; k < p.n; k++) {
          let x: number, y: number, z: number;
          // Babylon's world is left-handed: a viewer at +z looking at the model has +x on their
          // LEFT, and a viewer at +x has +z on their RIGHT — so a front view's first column is the
          // model's east edge and a side view's first column its south edge. Measured in the lab
          // (a mailbox number drawn plainly came out mirrored before this).
          if (p.axis === "y") { x = p.x + c; y = p.y + k; z = p.z + (rows - 1 - r); }
          else if (p.axis === "z") { x = p.x + (cols - 1 - c); y = p.y + (rows - 1 - r); z = p.z + k; }
          else { x = p.x + k; y = p.y + (rows - 1 - r); z = p.z + c; }
          set(x - lo[0], y - lo[1], z - lo[2], v);
        }
      }
    }
  }
  return { size, cells, inks, origin: lo };
}

// ======================= the mesher =======================

const DIRS: { axis: VoxelAxis; dir: 1 | -1 }[] = [
  { axis: "x", dir: 1 }, { axis: "x", dir: -1 }, { axis: "y", dir: 1 }, { axis: "y", dir: -1 }, { axis: "z", dir: 1 }, { axis: "z", dir: -1 },
];
const AX = { x: 0, y: 1, z: 2 } as const;

/**
 * Greedy meshing: for every direction and every slice, the exposed cells of one ink are merged
 * into the fewest rectangles (rows first, then rows of equal runs). A face is exposed when the
 * neighbour is empty, outside the grid, or glass while this cell is not (you see through glass).
 */
export function voxelQuads(m: VoxelModel, g: VoxelGrid = voxelGrid(m)): VoxelQuad[] {
  const [W, H, D] = g.size;
  if (!W) return [];
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) ? EMPTY : g.cells[(y * D + z) * W + x];
  const finishOf = (v: number) => m.palette[g.inks[v - 1]].finish;
  const exposed = (self: number, other: number) => other === EMPTY || (finishOf(other) === "glass" && finishOf(self) !== "glass");
  const quads: VoxelQuad[] = [];
  for (const { axis, dir } of DIRS) {
    const a = AX[axis];
    // In-plane axes u, v: the two others, in ascending order.
    const ua = a === 0 ? 1 : 0, va = a === 2 ? 1 : 2;
    const sz = [W, H, D];
    const NU = sz[ua], NV = sz[va], NA = sz[a];
    const mask = new Uint8Array(NU * NV);
    const pos = [0, 0, 0];
    for (let s = 0; s < NA; s++) {
      // mask: ink of exposed cells in this slice
      for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) {
        pos[a] = s; pos[ua] = u; pos[va] = v;
        const self = at(pos[0], pos[1], pos[2]);
        if (self === EMPTY) { mask[v * NU + u] = 0; continue; }
        pos[a] = s + dir;
        mask[v * NU + u] = exposed(self, at(pos[0], pos[1], pos[2])) ? self : 0;
      }
      for (let v = 0; v < NV; v++) for (let u = 0; u < NU;) {
        const ink = mask[v * NU + u];
        if (!ink) { u++; continue; }
        let du = 1;
        while (u + du < NU && mask[v * NU + u + du] === ink) du++;
        let dv = 1;
        outer: while (v + dv < NV) {
          for (let k = 0; k < du; k++) if (mask[(v + dv) * NU + u + k] !== ink) break outer;
          dv++;
        }
        for (let j = 0; j < dv; j++) for (let k = 0; k < du; k++) mask[(v + j) * NU + u + k] = 0;
        quads.push({ axis, dir, at: dir === 1 ? s + 1 : s, u0: u, v0: v, du, dv, ink: g.inks[ink - 1] });
        u += du;
      }
    }
  }
  return quads;
}

/** Hex → rgb 0–1. */
export function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/**
 * Compiles a model to vertex buffers grouped by finish (glow and glass also by colour). Positions
 * are in metres with the footprint CENTRED on x/z and the bottom at y = 0. Winding follows
 * Babylon's left-handed default (clockwise seen from outside), the same as its own boxes.
 */
export function compileVoxel(m: VoxelModel): VoxelCompiled {
  const g = voxelGrid(m);
  const quads = voxelQuads(m, g);
  const [W, , D] = g.size;
  const c = m.cell;
  const ox = -W * c / 2, oz = -D * c / 2;
  const groups = new Map<string, VoxelGeometry>();
  const group = (ink: VoxelInk): VoxelGeometry => {
    const perColour = ink.finish === "glow" || ink.finish === "glass";
    const key = perColour ? `${ink.finish}_${ink.color}` : ink.finish;
    let gr = groups.get(key);
    if (!gr) { gr = { finish: ink.finish, color: perColour ? ink.color : undefined, positions: [], normals: [], colors: [], uvs: [], indices: [], quads: 0 }; groups.set(key, gr); }
    return gr;
  };
  for (const q of quads) {
    const ink = m.palette[q.ink];
    const gr = group(ink);
    const a = AX[q.axis], ua = a === 0 ? 1 : 0, va = a === 2 ? 1 : 2;
    const n = [0, 0, 0]; n[a] = q.dir;
    // Four corners in cell space: (u0,v0) (u1,v0) (u1,v1) (u0,v1).
    const corners = [[q.u0, q.v0], [q.u0 + q.du, q.v0], [q.u0 + q.du, q.v0 + q.dv], [q.u0, q.v0 + q.dv]];
    // Right-hand cross of (c1-c0)×(c2-c0) with u before v is +axis when (ua, va) is a cyclic pair
    // of the normal axis; Babylon wants the opposite (clockwise from outside), so the order is
    // reversed exactly when the right-hand result would point OUT.
    // ua < va always here: (y, z) around x and (x, y) around z are cyclic, (x, z) around y is not.
    const cyclic = a !== 1;
    const rightHandOut = (cyclic ? 1 : -1) * q.dir === 1;
    const order = rightHandOut ? [0, 3, 2, 1] : [0, 1, 2, 3];
    const base = gr.positions.length / 3;
    const [r, gg, b] = hexRgb(ink.color);
    for (const idx of order) {
      const [u, v] = corners[idx];
      const p = [0, 0, 0]; p[a] = q.at; p[ua] = u; p[va] = v;
      gr.positions.push(p[0] * c + ox, p[1] * c, p[2] * c + oz);
      gr.normals.push(n[0], n[1], n[2]);
      gr.colors.push(r, gg, b, 1);
      gr.uvs.push(u - q.u0, v - q.v0);
    }
    gr.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    gr.quads++;
  }
  let voxels = 0;
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i]) voxels++;
  return { id: m.id, cell: c, size: g.size, groups: [...groups.values()], quads: quads.length, voxels };
}

/** Metres: width (x), height (y), depth (z) of the model's grid. */
export function voxelBounds(m: VoxelModel): { w: number; h: number; d: number } {
  const g = voxelGrid(m);
  const r = (n: number) => Math.round(n * m.cell * 1e6) / 1e6;
  return { w: r(g.size[0]), h: r(g.size[1]), d: r(g.size[2]) };
}

/**
 * The collision box of a model placed at (x, y, z) with a yaw that is a multiple of 90° — the
 * footprint centred on x/z like the mesh, standing on y. Other yaws take the larger square.
 */
export function voxelFootprint(m: VoxelModel, x: number, y: number, z: number, yaw = 0): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } {
  const b = voxelBounds(m);
  const q = Math.round(yaw / (Math.PI / 2)) % 2 !== 0;
  const exact = Math.abs(yaw / (Math.PI / 2) - Math.round(yaw / (Math.PI / 2))) < 1e-6;
  const w = exact ? (q ? b.d : b.w) : Math.max(b.w, b.d), d = exact ? (q ? b.w : b.d) : Math.max(b.w, b.d);
  return { minX: x - w / 2, minY: y, minZ: z - d / 2, maxX: x + w / 2, maxY: y + b.h, maxZ: z + d / 2 };
}
