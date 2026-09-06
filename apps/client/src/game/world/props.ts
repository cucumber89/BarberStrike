import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Meshes/instancedMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Material } from "@babylonjs/core/Materials/material";
import type { PropHint } from "@frankibarber/shared";

/**
 * Procedural props for PropHints. Everything is primitives + generated textures; identical
 * props share materials, and repeated small items (bottles, lamps) reuse one source mesh via
 * instances. Props are visual only — anything solid lives in map.solids.
 */

interface PropSet { root: TransformNode; meshes: Mesh[]; emissive: Mesh[]; dispose(): void }

class Palette {
  private mats = new Map<string, Material>();
  private textures: DynamicTexture[] = [];
  constructor(private scene: Scene) {}

  pbr(key: string, hex: string, rough: number, metal = 0, emissiveHex?: string, emissiveScale = 1): PBRMaterial {
    let m = this.mats.get(key) as PBRMaterial | undefined;
    if (m) return m;
    m = new PBRMaterial(`prop_${key}`, this.scene);
    m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    m.roughness = rough; m.metallic = metal;
    if (emissiveHex) m.emissiveColor = Color3.FromHexString(emissiveHex).scale(emissiveScale);
    m.maxSimultaneousLights = 4;
    m.useGLTFLightFalloff = true; // range-limited, same as the map materials
    m.freeze();
    this.mats.set(key, m);
    return m;
  }

  /** Text on a dark or transparent plate. A "\n" in the text stacks lines (menu boards, notes, calendars). */
  text(key: string, text: string, opts: { w: number; h: number; color: string; bg: string; font?: string; glow?: boolean; size?: number; align?: CanvasTextAlign }): StandardMaterial {
    text = text ?? "";
    const k = `txt_${key}_${text}`;
    let m = this.mats.get(k) as StandardMaterial | undefined;
    if (m) return m;
    const px = 512;
    const dt = new DynamicTexture(k, { width: px, height: Math.max(64, Math.round(px * opts.h / opts.w)) }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const W = dt.getSize().width, H = dt.getSize().height;
    ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, W, H);
    const lines = text.split("\n");
    const size = opts.size ?? Math.floor(lines.length === 1 ? H * 0.62 : H * 0.78 / lines.length);
    ctx.font = `${opts.font ?? "bold"} ${size}px "Bebas Neue", "Oswald", Impact, "Arial Narrow", sans-serif`;
    ctx.textAlign = opts.align ?? "center"; ctx.textBaseline = "middle";
    if (opts.glow) { ctx.shadowColor = opts.color; ctx.shadowBlur = size * 0.35; }
    ctx.fillStyle = opts.color;
    const x = opts.align === "left" ? W * 0.06 : opts.align === "right" ? W * 0.94 : W / 2;
    const lh = size * 1.15, top = H / 2 - lh * (lines.length - 1) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, top + i * lh + size * 0.05));
    dt.update(false);
    dt.hasAlpha = opts.bg === "rgba(0,0,0,0)";
    this.textures.push(dt);
    m = new StandardMaterial(k, this.scene);
    m.diffuseTexture = dt;
    if (dt.hasAlpha) { m.opacityTexture = dt; m.backFaceCulling = false; }
    if (opts.glow) { m.emissiveTexture = dt; m.emissiveColor = Color3.White(); m.disableLighting = true; }
    else { m.specularColor = Color3.Black(); }
    m.freeze();
    this.mats.set(k, m);
    return m;
  }

  /** Barber-pole stripes (drop 6): red / white / blue diagonals that wrap a cylinder into a helix, lit from inside. */
  stripes(key: string): StandardMaterial {
    const k = `stripes_${key}`;
    let m = this.mats.get(k) as StandardMaterial | undefined;
    if (m) return m;
    const W = 128, H = 256;
    const dt = new DynamicTexture(k, { width: W, height: H }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const colors = ["#e63946", "#f4f1ea", "#2a5cc9", "#f4f1ea"];
    const band = 40;
    for (let i = -8; i < 14; i++) {
      ctx.fillStyle = colors[((i % 4) + 4) % 4];
      ctx.beginPath();
      ctx.moveTo(0, i * band); ctx.lineTo(W, i * band - W); ctx.lineTo(W, i * band - W + band); ctx.lineTo(0, i * band + band); ctx.closePath();
      ctx.fill();
    }
    dt.update(false);
    dt.wrapU = 1; dt.wrapV = 1;
    this.textures.push(dt);
    m = new StandardMaterial(k, this.scene);
    m.diffuseTexture = dt;
    m.emissiveTexture = dt; m.emissiveColor = new Color3(0.55, 0.55, 0.55);
    m.specularColor = new Color3(0.2, 0.2, 0.2);
    m.freeze();
    this.mats.set(k, m);
    return m;
  }

  /** Yellow / black hazard diagonals (warning tape, floor edge strips). Tight bands so any length reads the same. */
  hazard(): StandardMaterial {
    const k = "hazard";
    let m = this.mats.get(k) as StandardMaterial | undefined;
    if (m) return m;
    const W = 512, H = 64;
    const dt = new DynamicTexture(k, { width: W, height: H }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#e0b322"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#151515";
    const band = 32;
    for (let x = -H; x < W + H; x += band * 2) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + band, 0); ctx.lineTo(x + band - H, H); ctx.lineTo(x - H, H); ctx.closePath(); ctx.fill();
    }
    dt.update(false);
    this.textures.push(dt);
    m = new StandardMaterial(k, this.scene);
    m.diffuseTexture = dt; m.specularColor = new Color3(0.1, 0.1, 0.1);
    m.freeze();
    this.mats.set(k, m);
    return m;
  }

  /** Wall-clock dial: cream face, hour ticks, numerals. Hands are meshes so they stay crisp. */
  clockFace(): StandardMaterial {
    const k = "clockface";
    let m = this.mats.get(k) as StandardMaterial | undefined;
    if (m) return m;
    const S = 256;
    const dt = new DynamicTexture(k, { width: S, height: S }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#0e0e10"; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#f1ead8"; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1a1e";
    ctx.font = `bold ${Math.floor(S * 0.13)}px "Bebas Neue", "Oswald", Impact, "Arial Narrow", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, r = S * 0.36;
      if (i % 3 === 0) ctx.fillText(String(i === 0 ? 12 : i), S / 2 + Math.sin(a) * r, S / 2 - Math.cos(a) * r + S * 0.01);
      else { ctx.save(); ctx.translate(S / 2 + Math.sin(a) * S * 0.41, S / 2 - Math.cos(a) * S * 0.41); ctx.rotate(a); ctx.fillRect(-2, -S * 0.03, 4, S * 0.06); ctx.restore(); }
    }
    dt.update(false);
    this.textures.push(dt);
    m = new StandardMaterial(k, this.scene);
    m.diffuseTexture = dt; m.specularColor = new Color3(0.05, 0.05, 0.05);
    m.freeze();
    this.mats.set(k, m);
    return m;
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose(true, true);
    for (const t of this.textures) t.dispose();
    this.mats.clear();
  }
}

/**
 * @param imported Drop 6b: ready instancing sources for small props, keyed by the same key the
 * procedural builder uses ("bottle"). A key present here replaces the procedural mesh for that
 * item; anything missing stays procedural, so the map is complete with or without the assets.
 */
export function buildProps(scene: Scene, hints: PropHint[], imported?: Map<string, Mesh>): PropSet {
  const root = new TransformNode("props", scene);
  const pal = new Palette(scene);
  const meshes: Mesh[] = [];
  const emissive: Mesh[] = [];
  const sources = new Map<string, Mesh>();

  const M = {
    chrome: () => pal.pbr("chrome", "#c8ccd2", 0.25, 0.95),
    leather: () => pal.pbr("leather", "#1f1613", 0.55),
    black: () => pal.pbr("black", "#111113", 0.6, 0.1),
    brass: () => pal.pbr("brass", "#b08a3e", 0.35, 0.9),
    wood: () => pal.pbr("wood", "#5a3f2c", 0.6),
    darkmetal: () => pal.pbr("darkmetal", "#3a3d43", 0.5, 0.7),
    rust: () => pal.pbr("rust", "#4a3a2c", 0.9, 0.3),
    plastic: () => pal.pbr("plastic", "#2b2b30", 0.7),
    towel: () => pal.pbr("towel", "#dcd6c8", 0.95),
    tube: () => pal.pbr("tube", "#fff3dc", 0.4, 0, "#fff0d6", 2.2),
    tubeCool: () => pal.pbr("tubeCool", "#e6f0ff", 0.4, 0, "#dbe8ff", 1.8),
    pendant: () => pal.pbr("pendant", "#ffd9a3", 0.5, 0, "#ffc27a", 2.6),
    screen: () => pal.pbr("screen", "#0c1620", 0.3, 0, "#3a6b8a", 0.9),
    glassDark: () => pal.pbr("glassDark", "#0a0c10", 0.15, 0.2),
    amber: () => pal.pbr("amber", "#7a4a12", 0.3, 0, "#ff9a3c", 0.25),
    clear: () => pal.pbr("clear", "#9fb5c8", 0.1, 0.1),
    mirror: () => pal.pbr("mirror", "#d8dde5", 0.03, 0.98),
    mirrorStrip: () => pal.pbr("mirrorStrip", "#fff2dd", 0.4, 0, "#ffe6c2", 2.4),
    // 2.2 dressing: cheap flat colours for furniture, tools, cloth, paper and litter.
    rubber: () => pal.pbr("rubber", "#141414", 0.95),
    paintRed: () => pal.pbr("paintRed", "#b0322a", 0.55, 0.2),
    paintYellow: () => pal.pbr("paintYellow", "#d9ac2a", 0.6, 0.1),
    orange: () => pal.pbr("orange", "#ef6a1c", 0.6),
    white: () => pal.pbr("white", "#e9e6df", 0.5),
    ceramic: () => pal.pbr("ceramic", "#e8e6e0", 0.2),
    grey: () => pal.pbr("grey", "#8a8d93", 0.6, 0.4),
    paper: () => pal.pbr("paper", "#efe9dc", 0.92),
    paperY: () => pal.pbr("paperY", "#efd97a", 0.92),
    paperP: () => pal.pbr("paperP", "#efb6c4", 0.92),
    paperG: () => pal.pbr("paperG", "#b7c9a1", 0.92),
    cork: () => pal.pbr("cork", "#a67c4e", 0.95),
    pegboard: () => pal.pbr("pegboard", "#6e5a45", 0.9),
    foliage: () => pal.pbr("foliage", "#2f6b35", 0.85),
    terracotta: () => pal.pbr("terracotta", "#8a4a33", 0.8),
    cardboard: () => pal.pbr("cardboard", "#a8865a", 0.9),
    hessian: () => pal.pbr("hessian", "#b9a274", 0.95),
    tarp: () => pal.pbr("tarp", "#2c4f8a", 0.5),
    cloth: () => pal.pbr("cloth", "#3a4250", 0.9),
    concrete: () => pal.pbr("concrete", "#8d8a82", 0.95),
    puddle: () => pal.pbr("puddle", "#0b0f14", 0.06, 0.35),
    bulb: () => pal.pbr("bulb", "#ffe2a8", 0.4, 0, "#ffcf7a", 3.0),
    fire: () => pal.pbr("fire", "#ff7a1a", 0.5, 0, "#ff6a14", 3.2),
    flame: () => pal.pbr("flame", "#ffd36a", 0.5, 0, "#ffc24a", 3.2),
    led: () => pal.pbr("led", "#ff3b2a", 0.4, 0, "#ff2a1a", 2.5),
    coffee: () => pal.pbr("coffee", "#3b2418", 0.6),
  };

  const box = (name: string, w: number, h: number, d: number, mat: Material, parent: TransformNode, x = 0, y = 0, z = 0, glow = false): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.material = mat; m.parent = parent; m.position.set(x, y, z); m.isPickable = false; m.receiveShadows = true;
    meshes.push(m); if (glow) emissive.push(m);
    return m;
  };
  const cyl = (name: string, dia: number, hgt: number, mat: Material, parent: TransformNode, x = 0, y = 0, z = 0, tess = 12): Mesh => {
    const m = MeshBuilder.CreateCylinder(name, { diameter: dia, height: hgt, tessellation: tess }, scene);
    m.material = mat; m.parent = parent; m.position.set(x, y, z); m.isPickable = false; m.receiveShadows = true;
    meshes.push(m);
    return m;
  };
  // MEASURED (screenshots v-sign, w-sign, x-z): a DynamicTexture text plane read from the side its
  // anchor yaw faces came out rotated 180°; an in-plane half turn makes it read correctly there.
  // The readable side is the anchor's facing direction — orient hints (yaw) toward the viewer.
  const plane = (name: string, w: number, h: number, mat: Material, parent: TransformNode, x = 0, y = 0, z = 0, glow = false): Mesh => {
    const m = MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    m.material = mat; m.parent = parent; m.position.set(x, y, z); m.isPickable = false;
    m.rotation.set(0, 0, Math.PI);
    meshes.push(m); if (glow) emissive.push(m);
    return m;
  };
  /** Instanced small item (bottle etc.): the first call creates the source, later calls instance it. */
  const inst = (key: string, make: () => Mesh, parent: TransformNode, x: number, y: number, z: number, sy = 1) => {
    let src = sources.get(key);
    if (!src) {
      const given = imported?.get(key);
      src = given ?? make();
      if (!given) { src.isVisible = false; src.parent = root; }
      src.isPickable = false;
      sources.set(key, src);
    }
    const i = src.createInstance(`${key}_i`);
    i.parent = parent; i.position.set(x, y, z); i.scaling.y = sy; i.isPickable = false;
    return i;
  };

  /** Thin bar from (x0,y0) to (x1,y1) in the anchor's XY plane (bike frames, jack handles). */
  const bar = (name: string, x0: number, y0: number, x1: number, y1: number, t: number, mat: Material, parent: TransformNode, z = 0): Mesh => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const m = box(name, t, L, t, mat, parent, (x0 + x1) / 2, (y0 + y1) / 2, z);
    m.rotation.z = Math.atan2(-(x1 - x0), y1 - y0);
    return m;
  };
  /**
   * Overhead wire along local +Z, both ends at the anchor height, sagging `sag` in the middle
   * (segments follow the curve). `bulbs` hangs a warm bulb under every joint (string lights).
   */
  const sagWire = (len: number, sag: number, parent: TransformNode, bulbs: boolean) => {
    const segs = Math.max(4, Math.min(14, Math.round(len / 1.3)));
    const yAt = (z: number) => -sag * (1 - (2 * z / len) ** 2);
    for (let i = 0; i < segs; i++) {
      const z0 = -len / 2 + i * len / segs, z1 = z0 + len / segs;
      const y0 = yAt(z0), y1 = yAt(z1);
      const seg = box(`wire${i}`, 0.018, 0.018, Math.hypot(z1 - z0, y1 - y0) + 0.01, M.black(), parent, 0, (y0 + y1) / 2, (z0 + z1) / 2);
      seg.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
      if (bulbs && i > 0) inst("bulb", () => { const b = MeshBuilder.CreateBox("bulb", { width: 0.06, height: 0.09, depth: 0.06 }, scene); b.material = M.bulb(); return b; }, parent, 0, y0 - 0.07, z0);
    }
  };
  /** Deterministic 0..1 jitter from a hint position, so litter and notes look scattered but never move between builds. */
  const jitter = (h: PropHint, i: number) => { const s = Math.sin(h.x * 12.9898 + h.z * 78.233 + i * 37.719) * 43758.5453; return s - Math.floor(s); };

  const anchor = (h: PropHint, name: string): TransformNode => {
    const t = new TransformNode(name, scene);
    t.position.set(h.x, h.y, h.z);
    t.rotation.y = h.yaw ?? 0;
    if (h.scale) t.scaling.setAll(h.scale);
    t.parent = root;
    return t;
  };

  let n = 0;
  for (const h of hints) {
    const a = anchor(h, `prop_${h.kind}_${n++}`);
    const w = h.w ?? 1, hh = h.h ?? 1;
    switch (h.kind) {
      case "barber_chair": {
        // Hydraulic base, seat, back, armrests, footrest. Chair faces +Z in local space.
        cyl("base", 0.6, 0.06, M.chrome(), a, 0, -0.52);
        cyl("column", 0.12, 0.4, M.chrome(), a, 0, -0.3);
        box("seat", 0.62, 0.14, 0.6, M.leather(), a, 0, 0);
        box("seatTrim", 0.64, 0.03, 0.62, M.chrome(), a, 0, -0.085);
        box("back", 0.6, 0.7, 0.14, M.leather(), a, 0, 0.38, -0.28);
        box("headrest", 0.3, 0.16, 0.1, M.leather(), a, 0, 0.82, -0.26);
        box("armL", 0.08, 0.06, 0.5, M.chrome(), a, -0.34, 0.24, -0.02);
        box("armR", 0.08, 0.06, 0.5, M.chrome(), a, 0.34, 0.24, -0.02);
        box("footrest", 0.4, 0.05, 0.22, M.chrome(), a, 0, -0.2, 0.45);
        break;
      }
      case "mirror": {
        // Frame, glass, LED strip behind (emissive halo).
        box("frame", w + 0.08, hh + 0.08, 0.04, M.black(), a, 0, 0, -0.01);
        plane("glass", w, hh, M.mirror(), a, 0, 0, 0.012);
        box("strip", w + 0.16, 0.03, 0.02, M.mirrorStrip(), a, 0, hh / 2 + 0.06, -0.02, true);
        box("strip2", w + 0.16, 0.03, 0.02, M.mirrorStrip(), a, 0, -hh / 2 - 0.06, -0.02, true);
        break;
      }
      case "shelf": {
        box("plank", w, 0.03, 0.28, M.wood(), a, 0, 0, 0);
        box("bracketL", 0.03, 0.2, 0.26, M.darkmetal(), a, -w / 2 + 0.1, -0.11, 0);
        box("bracketR", 0.03, 0.2, 0.26, M.darkmetal(), a, w / 2 - 0.1, -0.11, 0);
        break;
      }
      case "bottle_row": {
        const count = Math.max(2, Math.round(w / 0.11));
        const small = h.variant === "small";
        for (let i = 0; i < count; i++) {
          const key = i % 3 === 0 ? "bottle_amber" : i % 3 === 1 ? "bottle_black" : "bottle_clear";
          const mat = i % 3 === 0 ? M.amber() : i % 3 === 1 ? M.plastic() : M.clear();
          inst(key, () => { const b = MeshBuilder.CreateCylinder(key, { diameter: 0.06, height: 0.2, tessellation: 8 }, scene); b.material = mat; return b; }, a, -w / 2 + 0.06 + i * (w - 0.12) / Math.max(1, count - 1), (small ? 0.06 : 0.1) + 0.01 * (i % 2), 0, small ? 0.6 : 0.8 + (i % 4) * 0.12);
        }
        break;
      }
      case "towel_stack": {
        for (let i = 0; i < 4; i++) box(`towel${i}`, 0.34, 0.06, 0.24, M.towel(), a, (i % 2) * 0.01, 0.03 + i * 0.065, 0);
        break;
      }
      case "clippers": {
        box("body", 0.05, 0.03, 0.14, M.black(), a, 0, 0.015, 0);
        box("blade", 0.05, 0.012, 0.03, M.chrome(), a, 0, 0.02, 0.08);
        break;
      }
      case "terminal": {
        box("stand", 0.08, 0.14, 0.08, M.darkmetal(), a, 0, 0.07, 0);
        box("screenBack", 0.34, 0.24, 0.02, M.black(), a, 0, 0.26, 0);
        plane("screen", 0.3, 0.2, pal.text("terminal", "NEXT: 09:00", { w: 3, h: 2, color: "#8fd3ff", bg: "#0c1620", size: 44, glow: true }), a, 0, 0.26, 0.012, true);
        break;
      }
      case "receipt": {
        plane("paper", 0.09, 0.16, pal.text("receipt", "FRANKIBARBER", { w: 2, h: 3.5, color: "#333", bg: "#f2eee6", size: 40 }), a, 0, 0.002, 0).rotation.x = Math.PI / 2;
        break;
      }
      case "counter_top": {
        box("top", w, 0.03, hh, M.black(), a, 0, 0, 0);
        break;
      }
      case "sign": {
        box("plate", w, hh, 0.06, M.black(), a, 0, 0, 0);
        plane("text", w - 0.1, hh - 0.1, pal.text("sign", h.text ?? "FRANKIBARBER", { w, h: hh, color: "#e9d9b0", bg: "rgba(0,0,0,0)", glow: true }), a, 0, 0, 0.035, true);
        // Two small brass gooseneck lamps above the sign (emissive heads).
        box("lampArmL", 0.03, 0.03, 0.3, M.brass(), a, -w / 3, hh / 2 + 0.15, 0.12);
        box("lampArmR", 0.03, 0.03, 0.3, M.brass(), a, w / 3, hh / 2 + 0.15, 0.12);
        box("lampHeadL", 0.12, 0.06, 0.12, M.pendant(), a, -w / 3, hh / 2 + 0.12, 0.26, true);
        box("lampHeadR", 0.12, 0.06, 0.12, M.pendant(), a, w / 3, hh / 2 + 0.12, 0.26, true);
        break;
      }
      case "neon": {
        // Buy stations (drop 2) glow money-green on a black plate so they read from across the map.
        const station = h.variant === "station";
        const color = station ? "#7dff9a" : "#c9a7ff";
        if (station) box("neonPlate", (w || 1.6) + 0.12, (hh || 0.4) + 0.12, 0.05, M.black(), a, 0, 0, -0.035);
        plane(station ? "neon_station" : "neon", w || 1.6, hh || 0.4, pal.text(station ? "neonStation" : "neon", h.text ?? "AFTER HOURS", { w: w || 1.6, h: hh || 0.4, color, bg: "rgba(0,0,0,0)", glow: true, font: station ? "bold" : "normal" }), a, 0, 0, 0, true);
        break;
      }
      case "board": {
        box("boardBack", w || 0.9, hh || 0.6, 0.03, M.black(), a, 0, 0, 0);
        plane("boardText", (w || 0.9) - 0.06, (hh || 0.6) - 0.06, pal.text("board", h.text ?? "TEAM", { w: w || 0.9, h: hh || 0.6, color: "#d9a441", bg: "#141416", size: 56 }), a, 0, 0, 0.02);
        break;
      }
      case "poster": {
        const variant = h.variant ?? "0";
        // Named variants are the map's vocabulary (hours / cuts / gig); numbers index the same list.
        const texts: Record<string, string> = { "0": "FADE OR TAPER", "1": "WALK-INS", "2": "NIGHT SHIFT", hours: "OPEN\nTILL LATE", cuts: "FADE OR TAPER", gig: "LIVE\nSAT 23:00" };
        plane("poster", w || 0.5, hh || 0.7, pal.text(`poster${variant}`, texts[variant] ?? texts[String(Number(variant) % 3)] ?? "NIGHT SHIFT", { w: 5, h: 7, color: "#e8e2d6", bg: "#232126", size: 70 }), a, 0, 0, 0);
        break;
      }
      case "graffiti": {
        plane("graffiti", w || 1.4, hh || 0.6, pal.text("graffiti", h.text ?? "FRESH CUTS", { w: 14, h: 6, color: "#8f76e0", bg: "rgba(0,0,0,0)", font: "italic bold", size: 120 }), a, 0, 0, 0);
        break;
      }
      case "sticker": {
        plane("sticker", 0.16, 0.16, pal.text("sticker", "FB", { w: 1, h: 1, color: "#0b0b0d", bg: "#d9a441", size: 300 }), a, 0, 0, 0);
        break;
      }
      case "lamp": {
        if (h.variant === "head") {
          // Head only: the post is a solid in the map (collision). Arm + housing + glow at the anchor.
          box("arm", 0.06, 0.06, 0.7, M.darkmetal(), a, 0, 0, 0.3);
          box("head", 0.36, 0.12, 0.5, M.darkmetal(), a, 0, -0.02, 0.6);
          box("glow", 0.3, 0.03, 0.44, M.pendant(), a, 0, -0.09, 0.6, true);
        } else if (h.variant === "wall") {
          box("bracket", 0.06, 0.06, 0.28, M.darkmetal(), a, 0, 0, 0.14);
          box("shade", 0.28, 0.12, 0.28, M.darkmetal(), a, 0, -0.04, 0.3);
          box("bulb", 0.2, 0.03, 0.2, M.pendant(), a, 0, -0.1, 0.3, true);
        } else {
          cyl("post", 0.1, hh || 3.4, M.darkmetal(), a, 0, (hh || 3.4) / 2, 0);
          box("arm", 0.06, 0.06, 0.7, M.darkmetal(), a, 0, hh || 3.4, 0.3);
          box("head", 0.36, 0.12, 0.5, M.darkmetal(), a, 0, (hh || 3.4) - 0.02, 0.6);
          box("glow", 0.3, 0.03, 0.44, M.pendant(), a, 0, (hh || 3.4) - 0.09, 0.6, true);
        }
        break;
      }
      case "tube_light": {
        const len = w || 1.2;
        box("housing", len, 0.06, 0.1, M.darkmetal(), a, 0, 0.03, 0);
        box("tube", len - 0.08, 0.03, 0.05, h.variant === "cool" ? M.tubeCool() : M.tube(), a, 0, -0.01, 0, true);
        break;
      }
      case "pendant": {
        cyl("cord", 0.008, hh || 0.6, M.black(), a, 0, (hh || 0.6) / 2, 0, 6);
        const shade = MeshBuilder.CreateCylinder("shade", { diameterTop: 0.1, diameterBottom: 0.34, height: 0.22, tessellation: 14 }, scene);
        shade.material = M.black(); shade.parent = a; shade.position.y = -0.1; shade.isPickable = false; meshes.push(shade);
        box("bulb", 0.14, 0.05, 0.14, M.pendant(), a, 0, -0.2, 0, true);
        break;
      }
      case "trash": {
        cyl("bin", 0.5, 0.9, M.rust(), a, 0, 0.45, 0, 10);
        cyl("rim", 0.54, 0.05, M.darkmetal(), a, 0, 0.9, 0, 10);
        break;
      }
      case "crate": {
        box("crate", 0.9, 0.9, 0.9, M.wood(), a, 0, 0.45, 0);
        box("bandA", 0.92, 0.05, 0.92, M.darkmetal(), a, 0, 0.2, 0);
        box("bandB", 0.92, 0.05, 0.92, M.darkmetal(), a, 0, 0.7, 0);
        break;
      }
      case "dumpster": {
        box("body", 1.6, 1.2, 1.1, M.rust(), a, 0, 0.6, 0);
        box("lid", 1.62, 0.08, 1.12, M.darkmetal(), a, 0, 1.24, 0);
        break;
      }
      case "pole": { cyl("pole", 0.12, hh || 3, M.darkmetal(), a, 0, (hh || 3) / 2, 0); break; }
      case "barber_pole": {
        // The classic: a lit striped cylinder between two brass caps on a wall bracket (drop 6).
        const ph = hh || 0.7;
        box("bracket", 0.08, 0.06, 0.14, M.darkmetal(), a, 0, 0, -0.07);
        cyl("cap_b", 0.2, 0.06, M.brass(), a, 0, -ph / 2 - 0.03, 0, 12);
        cyl("stripes", 0.16, ph, pal.stripes("barber"), a, 0, 0, 0, 16);
        cyl("cap_t", 0.2, 0.06, M.brass(), a, 0, ph / 2 + 0.03, 0, 12);
        cyl("finial", 0.1, 0.1, M.brass(), a, 0, ph / 2 + 0.11, 0, 10);
        break;
      }
      case "sink": {
        box("basin", 0.5, 0.25, 0.4, pal.pbr("ceramic", "#e8e6e0", 0.2), a, 0, 0.12, 0);
        cyl("tap", 0.03, 0.25, M.chrome(), a, 0, 0.35, -0.12, 8);
        break;
      }
      case "vent": {
        box("vent", w || 0.6, hh || 0.4, 0.06, M.darkmetal(), a, 0, 0, 0);
        for (let i = 0; i < 4; i++) box(`slat${i}`, (w || 0.6) - 0.08, 0.02, 0.02, M.black(), a, 0, -(hh || 0.4) / 2 + 0.08 + i * ((hh || 0.4) - 0.16) / 3, 0.035);
        break;
      }
      case "ac_unit": {
        box("ac", 0.9, 0.7, 0.4, M.darkmetal(), a, 0, 0, 0);
        cyl("fan", 0.5, 0.04, M.black(), a, 0, 0, 0.21, 16).rotation.x = Math.PI / 2;
        break;
      }
      case "pipe": { cyl("pipe", 0.12, hh || 3, M.rust(), a, 0, (hh || 3) / 2, 0, 10); break; }
      case "wheel": { cyl("tyre", 0.62, 0.22, pal.pbr("rubber", "#141414", 0.95), a, 0, 0.31, 0, 18).rotation.z = Math.PI / 2; cyl("rim", 0.36, 0.24, M.chrome(), a, 0, 0.31, 0, 12).rotation.z = Math.PI / 2; break; }
      case "cable": { const c = box("cable", 0.02, 0.02, w || 3, M.black(), a, 0, 0, 0); c.rotation.z = 0.06; break; }

      // ---------- 2.2 district dressing (districtDressing.ts) ----------
      // Floor props anchor at the floor; counter-top props at the counter top; wall props 2–4 cm off
      // the wall with local -Z into the wall (text reads from the anchor's +Z side, see `plane`).
      case "cafe_table": {
        // Round bistro table with two chairs facing it (local ±X).
        cyl("foot", 0.42, 0.02, M.darkmetal(), a, 0, 0.01, 0, 12);
        cyl("stem", 0.05, 0.72, M.darkmetal(), a, 0, 0.37, 0, 8);
        cyl("top", 0.72, 0.03, M.wood(), a, 0, 0.74, 0, 16);
        for (const sx of [-1, 1]) {
          const cx = sx * 0.62;
          box("seat", 0.4, 0.04, 0.4, M.wood(), a, cx, 0.45, 0);
          box("back", 0.04, 0.42, 0.38, M.wood(), a, cx + sx * 0.18, 0.66, 0);
          for (const [lx, lz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) box("leg", 0.025, 0.44, 0.025, M.darkmetal(), a, cx + lx, 0.22, lz);
        }
        break;
      }
      case "coffee_machine": {
        // Two-group espresso machine: body, chrome top, group heads, portafilters, steam wand, a red LED.
        box("body", 0.56, 0.4, 0.42, M.darkmetal(), a, 0, 0.2, -0.02);
        box("top", 0.58, 0.04, 0.44, M.chrome(), a, 0, 0.42, -0.02);
        box("tray", 0.5, 0.02, 0.14, M.chrome(), a, 0, 0.01, 0.22);
        for (const gx of [-0.14, 0.14]) {
          box("group", 0.1, 0.08, 0.1, M.chrome(), a, gx, 0.17, 0.22);
          box("handle", 0.02, 0.02, 0.12, M.black(), a, gx, 0.13, 0.31);
        }
        const wand = cyl("wand", 0.018, 0.3, M.chrome(), a, 0.3, 0.2, 0.16, 6); wand.rotation.x = 0.35;
        box("led", 0.03, 0.02, 0.01, M.led(), a, -0.22, 0.34, 0.195, true);
        inst("cup", () => { const c = MeshBuilder.CreateCylinder("cup", { diameter: 0.08, height: 0.09, tessellation: 10 }, scene); c.material = M.ceramic(); return c; }, a, -0.16, 0.485, -0.06);
        inst("cup", () => { const c = MeshBuilder.CreateCylinder("cup", { diameter: 0.08, height: 0.09, tessellation: 10 }, scene); c.material = M.ceramic(); return c; }, a, 0.12, 0.485, -0.02);
        break;
      }
      case "cups": {
        // A cluster of mugs (instanced), one upside down; `w` sets the spread.
        const count = Math.max(2, Math.round((w || 0.3) / 0.11));
        for (let i = 0; i < count; i++) {
          const x = -(w || 0.3) / 2 + 0.05 + i * ((w || 0.3) - 0.1) / Math.max(1, count - 1), z = (jitter(h, i) - 0.5) * 0.12;
          inst("cup", () => { const c = MeshBuilder.CreateCylinder("cup", { diameter: 0.08, height: 0.09, tessellation: 10 }, scene); c.material = M.ceramic(); return c; }, a, x, 0.045, z);
          if (i % 2 === 0) inst("cup_handle", () => { const c = MeshBuilder.CreateBox("cup_handle", { width: 0.02, height: 0.05, depth: 0.03 }, scene); c.material = M.ceramic(); return c; }, a, x + 0.05, 0.045, z);
          else inst("coffee", () => { const c = MeshBuilder.CreateCylinder("coffee", { diameter: 0.065, height: 0.005, tessellation: 10 }, scene); c.material = M.coffee(); return c; }, a, x, 0.088, z);
        }
        break;
      }
      case "napkins": {
        box("dispenser", 0.12, 0.16, 0.09, M.chrome(), a, 0, 0.08, 0);
        box("paper", 0.1, 0.05, 0.06, M.paper(), a, 0, 0.18, 0);
        break;
      }
      case "menu_board": {
        // Chalk menu in a wood frame; text lines come from the hint ("\n" separated).
        const bw = w || 1.6, bh = hh || 0.8;
        box("frame", bw + 0.08, bh + 0.08, 0.025, M.wood(), a, 0, 0, -0.012);
        box("slate", bw, bh, 0.02, M.black(), a, 0, 0, 0.005);
        plane("menu", bw - 0.08, bh - 0.08, pal.text("menu", h.text ?? "ESPRESSO 2.50\nFLAT WHITE 3.20\nNIGHT OWL BLEND 3.80", { w: bw, h: bh, color: "#efe4c9", bg: "#16191a", font: "normal", align: "left" }), a, 0, 0, 0.02);
        break;
      }
      case "wall_clock": {
        const ring = cyl("ring", 0.42, 0.03, M.black(), a, 0, 0, 0, 20); ring.rotation.x = Math.PI / 2;
        plane("dial", 0.37, 0.37, pal.clockFace(), a, 0, 0, 0.018);
        const hr = box("hourHand", 0.02, 0.11, 0.008, M.black(), a, 0, 0, 0.028); hr.position.y = 0.045; hr.rotation.z = -0.5;
        hr.position.x = 0.03;
        const mn = box("minHand", 0.014, 0.16, 0.008, M.black(), a, 0, 0.07, 0.03);
        mn.rotation.z = 0.25; mn.position.x = -0.02;
        cyl("pin", 0.02, 0.012, M.brass(), a, 0, 0, 0.035, 8).rotation.x = Math.PI / 2;
        break;
      }
      case "plant": {
        // Terracotta pot with a fan of leaves. Scale the hint (0.45) for a table-top version.
        const pot = MeshBuilder.CreateCylinder("pot", { diameterTop: 0.36, diameterBottom: 0.27, height: 0.32, tessellation: 12 }, scene);
        pot.material = M.terracotta(); pot.parent = a; pot.position.y = 0.16; pot.isPickable = false; meshes.push(pot);
        cyl("soil", 0.33, 0.02, M.rust(), a, 0, 0.32, 0, 12);
        for (let i = 0; i < 7; i++) {
          const phi = i * Math.PI * 2 / 7 + jitter(h, i) * 0.5, len = 0.45 + jitter(h, i + 9) * 0.25;
          const leaf = box(`leaf${i}`, 0.09, len, 0.015, M.foliage(), a, Math.sin(phi) * 0.12, 0.3 + len / 2 - 0.02, Math.cos(phi) * 0.12);
          leaf.rotation.set(0, phi, -0.45 - jitter(h, i + 3) * 0.3);
        }
        break;
      }
      case "pinboard": {
        // Cork board with pinned notes; one readable note.
        const bw = w || 0.9, bh = hh || 0.6;
        box("frame", bw + 0.05, bh + 0.05, 0.015, M.wood(), a, 0, 0, -0.005);
        box("cork", bw, bh, 0.02, M.cork(), a, 0, 0, 0.005);
        const papers = [M.paper(), M.paperY(), M.paperP(), M.paper(), M.paperG(), M.paperY()];
        for (let i = 0; i < 6; i++) {
          const px = -bw / 2 + 0.12 + (i % 3) * (bw - 0.24) / 2 + (jitter(h, i) - 0.5) * 0.06;
          const py = bh / 4 - Math.floor(i / 3) * bh / 2 + (jitter(h, i + 7) - 0.5) * 0.05;
          if (i === 4) plane("note", 0.16, 0.13, pal.text("note", h.text ?? "BACK IN 5\n- FRANKI", { w: 1.6, h: 1.3, color: "#2a2620", bg: "#f2ecdc", font: "normal", size: 42 }), a, px, py, 0.018);
          else box(`note${i}`, 0.11 + (i % 2) * 0.03, 0.13, 0.004, papers[i], a, px, py, 0.017).rotation.z = (jitter(h, i + 20) - 0.5) * 0.3;
          box(`pin${i}`, 0.014, 0.014, 0.008, i % 2 ? M.paintRed() : M.led(), a, px, py + 0.055, 0.022);
        }
        break;
      }
      case "tool_board": {
        // Pegboard with wrenches, a hammer, pliers and a lower shelf with two cans.
        const bw = w || 1.6, bh = hh || 0.9;
        box("peg", bw, bh, 0.02, M.pegboard(), a, 0, 0, 0.01);
        const n = Math.max(3, Math.floor(bw / 0.2));
        for (let i = 0; i < n; i++) {
          const x = -bw / 2 + 0.16 + i * (bw - 0.32) / (n - 1), s = 1 - (i % 4) * 0.12;
          if (i % 5 === 3) { box("hHandle", 0.03, 0.32, 0.02, M.wood(), a, x, 0.06, 0.03); box("hHead", 0.11, 0.045, 0.04, M.darkmetal(), a, x, 0.25, 0.03); }
          else if (i % 5 === 4) { box("pA", 0.02, 0.24, 0.012, M.black(), a, x - 0.015, 0.1, 0.03).rotation.z = 0.18; box("pB", 0.02, 0.24, 0.012, M.black(), a, x + 0.015, 0.1, 0.03).rotation.z = -0.18; }
          else { box("wHandle", 0.024, 0.3 * s, 0.012, M.chrome(), a, x, 0.08, 0.03); box("wJaw", 0.06 * s, 0.05, 0.012, M.chrome(), a, x, 0.08 + 0.15 * s, 0.03); }
        }
        box("ledge", bw - 0.1, 0.025, 0.14, M.darkmetal(), a, 0, -bh / 2 + 0.02, 0.08);
        for (const cx of [-bw / 2 + 0.2, bw / 2 - 0.2]) inst("spraycan", () => { const c = MeshBuilder.CreateCylinder("spraycan", { diameter: 0.065, height: 0.18, tessellation: 8 }, scene); c.material = M.paintRed(); return c; }, a, cx, -bh / 2 + 0.12, 0.08);
        break;
      }
      case "tyre_stack": {
        const count = h.variant === "tall" ? 4 : 3;
        for (let i = 0; i < count; i++) {
          const jx = (jitter(h, i) - 0.5) * 0.08, jz = (jitter(h, i + 5) - 0.5) * 0.08;
          inst("tyre", () => { const t = MeshBuilder.CreateCylinder("tyre", { diameter: 0.64, height: 0.2, tessellation: 14 }, scene); t.material = M.rubber(); return t; }, a, jx, 0.1 + i * 0.205, jz);
          inst("tyre_hole", () => { const t = MeshBuilder.CreateCylinder("tyre_hole", { diameter: 0.38, height: 0.21, tessellation: 12 }, scene); t.material = M.black(); return t; }, a, jx, 0.1 + i * 0.205, jz);
        }
        break;
      }
      case "jack": {
        // Trolley jack: red chassis, lifting arm, saddle, long handle leaning back.
        box("chassis", 0.6, 0.09, 0.22, M.paintRed(), a, 0, 0.045, 0);
        for (const [cx, cz] of [[-0.24, -0.13], [-0.24, 0.13], [0.22, -0.13], [0.22, 0.13]]) cyl("caster", 0.07, 0.03, M.black(), a, cx, 0.035, cz, 8).rotation.x = Math.PI / 2;
        box("arm", 0.5, 0.06, 0.12, M.paintRed(), a, 0.06, 0.14, 0).rotation.z = 0.22;
        cyl("saddle", 0.11, 0.03, M.black(), a, 0.3, 0.22, 0, 10);
        bar("handle", -0.27, 0.09, -0.85, 0.75, 0.03, M.darkmetal(), a);
        box("grip", 0.03, 0.03, 0.2, M.black(), a, -0.85, 0.75, 0);
        break;
      }
      case "oil_cans": {
        const count = Math.max(1, Math.round((w || 0.3) / 0.17));
        for (let i = 0; i < count; i++) {
          const x = -(w || 0.3) / 2 + 0.08 + i * Math.max(0, (w || 0.3) - 0.16) / Math.max(1, count - 1), z = (jitter(h, i) - 0.5) * 0.1;
          inst("oilcan", () => { const c = MeshBuilder.CreateCylinder("oilcan", { diameter: 0.14, height: 0.24, tessellation: 10 }, scene); c.material = M.darkmetal(); return c; }, a, x, 0.12, z);
          inst("oilcan_label", () => { const c = MeshBuilder.CreateCylinder("oilcan_label", { diameter: 0.143, height: 0.08, tessellation: 10 }, scene); c.material = i % 2 ? M.paintYellow() : M.paintRed(); return c; }, a, x, 0.12, z);
          inst("oilcan_cap", () => { const c = MeshBuilder.CreateCylinder("oilcan_cap", { diameter: 0.04, height: 0.03, tessellation: 8 }, scene); c.material = M.black(); return c; }, a, x + 0.03, 0.255, z);
        }
        break;
      }
      case "shelf_rack": {
        // Steel shelving with cardboard boxes and a few cans; back to the wall (local -Z).
        const rw = w || 2.0, rh = hh || 1.9;
        for (const [ux, uz] of [[-rw / 2, -0.22], [rw / 2, -0.22], [-rw / 2, 0.22], [rw / 2, 0.22]]) box("upright", 0.04, rh, 0.04, M.darkmetal(), a, ux, rh / 2, uz);
        const levels = [0.08, rh * 0.38, rh * 0.68, rh - 0.02];
        levels.forEach((ly, li) => {
          box("shelf", rw, 0.03, 0.5, M.darkmetal(), a, 0, ly, 0);
          if (li === levels.length - 1) return;
          const nb = 2 + (li % 2);
          for (let b = 0; b < nb; b++) {
            const bw = 0.3 + jitter(h, li * 4 + b) * 0.25, bhh = 0.22 + jitter(h, li * 4 + b + 30) * 0.16;
            const bx = -rw / 2 + 0.25 + b * (rw - 0.5) / Math.max(1, nb - 1) + (jitter(h, li + b + 50) - 0.5) * 0.1;
            box("box", bw, bhh, 0.34 + jitter(h, b + 60) * 0.1, M.cardboard(), a, bx, ly + 0.015 + bhh / 2, 0.02).rotation.y = (jitter(h, li + b + 70) - 0.5) * 0.25;
          }
          if (li === 1) inst("oilcan", () => { const c = MeshBuilder.CreateCylinder("oilcan", { diameter: 0.14, height: 0.24, tessellation: 10 }, scene); c.material = M.darkmetal(); return c; }, a, rw / 2 - 0.2, ly + 0.135, 0.12);
        });
        break;
      }
      case "work_lamp": {
        // Caged inspection lamp hanging from its cord (anchor = lamp, cord goes up `h`).
        cyl("cord", 0.008, hh || 0.8, M.black(), a, 0, (hh || 0.8) / 2, 0, 6);
        const hood = MeshBuilder.CreateCylinder("hood", { diameterTop: 0.05, diameterBottom: 0.2, height: 0.09, tessellation: 12 }, scene);
        hood.material = M.darkmetal(); hood.parent = a; hood.position.y = -0.04; hood.isPickable = false; meshes.push(hood);
        for (let i = 0; i < 6; i++) cyl("cageBar", 0.006, 0.2, M.darkmetal(), a, Math.sin(i * Math.PI / 3) * 0.08, -0.18, Math.cos(i * Math.PI / 3) * 0.08, 4);
        cyl("cageRing", 0.16, 0.01, M.darkmetal(), a, 0, -0.28, 0, 12);
        box("bulb", 0.07, 0.1, 0.07, M.bulb(), a, 0, -0.16, 0, true);
        break;
      }
      case "hazard_tape": {
        // Striped strip `w` long along local X: on the ground by default, or "hung" at the anchor height.
        const len = w || 2;
        if (h.variant === "hung") box("tape", len, 0.07, 0.004, pal.hazard(), a, 0, 0, 0);
        else box("strip", len, 0.006, 0.12, pal.hazard(), a, 0, 0.003, 0);
        break;
      }
      case "calendar": {
        box("sheet", 0.3, 0.44, 0.006, M.white(), a, 0, 0, 0.003);
        box("photo", 0.26, 0.15, 0.004, pal.pbr("calPhoto", "#2b6f7a", 0.6), a, 0, 0.12, 0.008);
        plane("grid", 0.27, 0.22, pal.text("cal", h.text ?? "SEPT 2026\n1  2  3  4  5  6  7\n8  9 10 11 12 13 14\n15 16 17 18 19 20 21", { w: 2.7, h: 2.2, color: "#2a2a2e", bg: "#f4f1ea", font: "normal" }), a, 0, -0.095, 0.009);
        box("clip", 0.06, 0.02, 0.02, M.darkmetal(), a, 0, 0.225, 0.006);
        break;
      }
      case "coat_rack": {
        cyl("foot", 0.42, 0.03, M.darkmetal(), a, 0, 0.015, 0, 12);
        cyl("pole", 0.04, 1.8, M.darkmetal(), a, 0, 0.9, 0, 8);
        for (let i = 0; i < 4; i++) { const hk = box(`hook${i}`, 0.02, 0.02, 0.2, M.brass(), a, Math.sin(i * Math.PI / 2) * 0.09, 1.7, Math.cos(i * Math.PI / 2) * 0.09); hk.rotation.y = i * Math.PI / 2; }
        box("coat", 0.36, 0.78, 0.14, M.cloth(), a, 0.1, 1.28, 0.1).rotation.y = 0.4;
        box("collar", 0.2, 0.06, 0.16, M.cloth(), a, 0.1, 1.66, 0.1).rotation.y = 0.4;
        cyl("hat", 0.28, 0.09, M.leather(), a, 0, 1.85, 0, 12);
        cyl("hatTop", 0.18, 0.06, M.leather(), a, 0, 1.92, 0, 10);
        break;
      }
      case "magazines": {
        const covers = [M.paperY(), M.paper(), M.paperP(), M.paperG(), M.paper()];
        for (let i = 0; i < 5; i++) box(`mag${i}`, 0.22, 0.012, 0.3, covers[i], a, (jitter(h, i) - 0.5) * 0.05, 0.006 + i * 0.013, (jitter(h, i + 8) - 0.5) * 0.05).rotation.y = (jitter(h, i + 3) - 0.5) * 0.5;
        break;
      }
      case "certificate": {
        const cw = w || 0.42, ch = hh || 0.32;
        box("frame", cw + 0.06, ch + 0.06, 0.025, M.brass(), a, 0, 0, 0);
        plane("paper", cw, ch, pal.text("cert", h.text ?? "MASTER BARBER\nCERTIFIED 2019\nFRANKIBARBER ACADEMY", { w: cw, h: ch, color: "#3a2e1e", bg: "#f1e9d2", font: "normal" }), a, 0, 0, 0.014);
        break;
      }
      case "cash_tray": {
        box("tray", 0.34, 0.03, 0.24, M.black(), a, 0, 0.015, 0);
        for (let i = 0; i < 7; i++) inst("coin", () => { const c = MeshBuilder.CreateCylinder("coin", { diameter: 0.028, height: 0.004, tessellation: 8 }, scene); c.material = M.brass(); return c; }, a, -0.1 + jitter(h, i) * 0.2, 0.032 + (i % 3) * 0.004, -0.08 + jitter(h, i + 11) * 0.16);
        box("note", 0.14, 0.004, 0.07, M.paperG(), a, 0.08, 0.032, 0.06).rotation.y = 0.2;
        box("note2", 0.14, 0.004, 0.07, M.paperG(), a, 0.06, 0.036, 0.05).rotation.y = -0.15;
        break;
      }
      case "jars": {
        const count = Math.max(2, Math.round((w || 0.4) / 0.11));
        for (let i = 0; i < count; i++) {
          const x = -(w || 0.4) / 2 + 0.05 + i * ((w || 0.4) - 0.1) / Math.max(1, count - 1), z = (jitter(h, i) - 0.5) * 0.06;
          inst(i % 2 ? "jar_amber" : "jar_clear", () => { const j = MeshBuilder.CreateCylinder("jar", { diameter: 0.08, height: 0.07, tessellation: 10 }, scene); j.material = i % 2 ? M.amber() : M.clear(); return j; }, a, x, 0.035, z);
          inst("jar_lid", () => { const j = MeshBuilder.CreateCylinder("jar_lid", { diameter: 0.085, height: 0.02, tessellation: 10 }, scene); j.material = M.black(); return j; }, a, x, 0.08, z);
        }
        break;
      }
      case "broom": {
        // Leaning against a wall behind it (local -Z): head on the floor, handle tilted back.
        box("head", 0.3, 0.05, 0.05, M.wood(), a, 0, 0.1, 0);
        box("bristles", 0.28, 0.09, 0.045, M.hessian(), a, 0, 0.045, 0);
        const handle = cyl("handle", 0.025, 1.3, M.wood(), a, 0, 0.12 + 0.65 * Math.cos(0.24), -0.65 * Math.sin(0.24), 6);
        handle.rotation.x = -0.24;
        break;
      }
      case "laundry_basket": {
        cyl("basket", 0.5, 0.55, M.plastic(), a, 0, 0.275, 0, 12);
        cyl("rim", 0.54, 0.03, M.plastic(), a, 0, 0.55, 0, 12);
        box("towelA", 0.3, 0.08, 0.2, M.towel(), a, 0.05, 0.57, 0.02).rotation.y = 0.5;
        box("towelB", 0.26, 0.07, 0.18, pal.pbr("towelGrey", "#9aa0a6", 0.95), a, -0.06, 0.62, -0.04).rotation.set(0.2, -0.4, 0.1);
        box("towelC", 0.22, 0.06, 0.16, M.towel(), a, 0.12, 0.63, -0.1).rotation.set(-0.1, 1.1, 0.25);
        break;
      }
      case "mop_bucket": {
        cyl("bucket", 0.36, 0.34, M.paintYellow(), a, 0, 0.17, 0, 10);
        box("wringer", 0.2, 0.12, 0.16, M.paintYellow(), a, 0, 0.4, -0.05);
        const handle = cyl("mop", 0.025, 1.3, M.wood(), a, 0, 0.3 + 0.65 * Math.cos(0.28), -0.05 - 0.65 * Math.sin(0.28), 6);
        handle.rotation.x = -0.28;
        box("mophead", 0.16, 0.18, 0.12, pal.pbr("towelGrey", "#9aa0a6", 0.95), a, 0, 0.3, 0.02);
        break;
      }
      case "fuse_box": {
        box("cabinet", 0.42, 0.52, 0.12, M.grey(), a, 0, 0, 0.06);
        box("seam", 0.006, 0.46, 0.004, M.black(), a, 0.16, 0, 0.122);
        box("handle", 0.03, 0.08, 0.02, M.black(), a, 0.15, 0, 0.13);
        box("warning", 0.09, 0.09, 0.004, M.paintYellow(), a, -0.09, 0.12, 0.122);
        box("warnTri", 0.05, 0.05, 0.003, M.black(), a, -0.09, 0.12, 0.125).rotation.z = Math.PI / 4;
        for (const cx of [-0.12, 0.02]) cyl("conduit", 0.03, 0.9, M.grey(), a, cx, 0.7, 0.05, 8);
        cyl("conduitOut", 0.03, 0.5, M.grey(), a, -0.05, -0.5, 0.05, 8);
        break;
      }
      case "cone": {
        inst("cone_base", () => { const b = MeshBuilder.CreateBox("cone_base", { width: 0.38, height: 0.04, depth: 0.38 }, scene); b.material = M.black(); return b; }, a, 0, 0.02, 0);
        inst("cone_body", () => { const c = MeshBuilder.CreateCylinder("cone_body", { diameterTop: 0.06, diameterBottom: 0.28, height: 0.62, tessellation: 10 }, scene); c.material = M.orange(); return c; }, a, 0, 0.35, 0);
        inst("cone_band", () => { const c = MeshBuilder.CreateCylinder("cone_band", { diameterTop: 0.15, diameterBottom: 0.19, height: 0.09, tessellation: 10 }, scene); c.material = M.white(); return c; }, a, 0, 0.41, 0);
        break;
      }
      case "puddle": {
        // Flat glossy disc, slightly stretched along local X; sits 6 mm over the ground.
        const d = MeshBuilder.CreateDisc("puddle", { radius: (w || 1.2) / 2, tessellation: 9 }, scene);
        d.material = M.puddle(); d.parent = a; d.position.y = 0.006; d.rotation.x = Math.PI / 2; d.scaling.y = 0.6; d.isPickable = false; meshes.push(d);
        break;
      }
      case "litter": {
        // Papers, a can and a fallen cup scattered within ~0.5 m (deterministic per anchor).
        for (let i = 0; i < 3; i++) box(`paper${i}`, 0.12 + jitter(h, i) * 0.08, 0.003, 0.16, i === 1 ? M.paperY() : M.paper(), a, (jitter(h, i + 1) - 0.5) * 0.9, 0.002, (jitter(h, i + 4) - 0.5) * 0.9).rotation.y = jitter(h, i + 9) * 3;
        const can = cyl("can", 0.065, 0.12, M.darkmetal(), a, (jitter(h, 12) - 0.5) * 0.6, 0.033, (jitter(h, 13) - 0.5) * 0.6, 8); can.rotation.z = Math.PI / 2; can.rotation.y = jitter(h, 14) * 3;
        const cup = inst("cup", () => { const c = MeshBuilder.CreateCylinder("cup", { diameter: 0.08, height: 0.09, tessellation: 10 }, scene); c.material = M.ceramic(); return c; }, a, (jitter(h, 15) - 0.5) * 0.7, 0.04, (jitter(h, 16) - 0.5) * 0.7);
        cup.rotation.x = Math.PI / 2; cup.rotation.y = jitter(h, 17) * 3;
        break;
      }
      case "wire":
      case "string_lights": {
        // Overhead run along local +Z (anchor = midpoint at the attachment height); sags in the middle.
        const len = w || 8;
        sagWire(len, hh || Math.min(0.9, 0.045 * len), a, h.kind === "string_lights");
        break;
      }
      case "banner": {
        // Cloth banner hung from a wall bar (local -Z into the wall). "blade": sticks out perpendicular, reads along the street.
        const tint = h.variant === "blue" ? pal.pbr("bannerBlue", "#2f5f9e", 0.8) : h.variant === "green" ? pal.pbr("bannerGreen", "#2d6b4a", 0.8) : h.variant === "blade" ? pal.pbr("bannerBlade", "#8f2d2a", 0.8) : pal.pbr("bannerRed", "#a8322e", 0.8);
        const bw = w || 0.6, bh = hh || 1.4;
        if (h.variant === "blade") {
          box("bar", 0.03, 0.03, bw + 0.15, M.darkmetal(), a, 0, 0, (bw + 0.15) / 2);
          box("cloth", 0.015, bh, bw, tint, a, 0, -bh / 2 - 0.02, 0.1 + bw / 2);
          for (const s of [-1, 1]) {
            const t = plane(`text${s}`, bw - 0.08, bh - 0.16, pal.text("bannerBlade", h.text ?? "CUTS\nSHAVES\nCOFFEE", { w: bw, h: bh, color: "#f1e6c8", bg: "rgba(0,0,0,0)", font: "normal" }), a, s * 0.012, -bh / 2 - 0.02, 0.1 + bw / 2);
            t.rotation.y = s * Math.PI / 2;
          }
        } else {
          box("bar", bw + 0.1, 0.03, 0.03, M.darkmetal(), a, 0, 0, 0.12);
          for (const s of [-1, 1]) box("bracket", 0.03, 0.03, 0.12, M.darkmetal(), a, s * bw / 2, 0, 0.06);
          box("cloth", bw, bh, 0.015, tint, a, 0, -bh / 2 - 0.02, 0.12);
          plane("text", bw - 0.08, bh - 0.16, pal.text(`banner${h.variant ?? ""}`, h.text ?? "NIGHT\nDISTRICT", { w: bw, h: bh, color: "#f1e6c8", bg: "rgba(0,0,0,0)", font: "normal" }), a, 0, -bh / 2 - 0.02, 0.13);
        }
        break;
      }
      case "a_frame": {
        // Sandwich board: two leaning plates hinged at the top, text on both outer faces.
        const bw = w || 0.6, bh = hh || 0.9, tilt = 0.22;
        for (const s of [-1, 1]) {
          const side = new TransformNode(`side${s}`, scene);
          side.parent = a; side.position.set(0, bh / 2 * Math.cos(tilt), s * bh / 2 * Math.sin(tilt));
          side.rotation.set(-s * tilt, s < 0 ? Math.PI : 0, 0);
          box("plate", bw, bh, 0.02, M.black(), side, 0, 0, 0);
          box("edge", bw + 0.03, 0.03, 0.03, M.wood(), side, 0, -bh / 2, 0);
          plane("text", bw - 0.08, bh - 0.12, pal.text("aframe", h.text ?? "COFFEE\nOPEN LATE", { w: bw, h: bh, color: "#f0e6d2", bg: "#1d1f22", font: "normal" }), side, 0, 0, 0.012);
        }
        box("hinge", bw + 0.02, 0.03, 0.05, M.wood(), a, 0, bh * Math.cos(tilt), 0);
        break;
      }
      case "bicycle": {
        // Leaning on a wall behind it (local -Z): wheels roll along local X; the whole bike tilts back.
        const bike = new TransformNode("bike", scene); bike.parent = a; bike.rotation.x = -0.16;
        for (const wx of [-0.5, 0.5]) {
          cyl("tyre", 0.66, 0.035, M.rubber(), bike, wx, 0.33, 0, 16).rotation.x = Math.PI / 2;
          cyl("rim", 0.5, 0.045, M.chrome(), bike, wx, 0.33, 0, 12).rotation.x = Math.PI / 2;
        }
        const fr = h.variant === "blue" ? pal.pbr("bikeBlue", "#2a5a9a", 0.5, 0.3) : pal.pbr("bikeGreen", "#3f7a4a", 0.5, 0.3);
        bar("top", -0.22, 0.86, 0.36, 0.82, 0.03, fr, bike);
        bar("down", 0.05, 0.3, 0.4, 0.8, 0.03, fr, bike);
        bar("seatTube", 0.05, 0.3, -0.18, 0.9, 0.03, fr, bike);
        bar("stay", 0.05, 0.3, -0.5, 0.33, 0.02, fr, bike);
        bar("seatStay", -0.18, 0.86, -0.5, 0.33, 0.02, fr, bike);
        bar("fork", 0.4, 0.8, 0.5, 0.33, 0.02, M.chrome(), bike);
        bar("stem", 0.4, 0.8, 0.44, 0.95, 0.025, M.chrome(), bike);
        box("handlebar", 0.03, 0.03, 0.46, M.chrome(), bike, 0.44, 0.95, 0);
        box("seat", 0.24, 0.05, 0.1, M.leather(), bike, -0.18, 0.93, 0);
        cyl("crank", 0.16, 0.02, M.black(), bike, 0.05, 0.3, 0.02, 10).rotation.x = Math.PI / 2;
        break;
      }
      case "chalk": {
        // Chalk writing flat on the ground, readable from the anchor's +Z side.
        const p = plane("chalk", w || 1.0, hh || 0.4, pal.text("chalk", h.text ?? "OPEN LATE", { w: w || 1.0, h: hh || 0.4, color: "rgba(240,238,230,0.85)", bg: "rgba(0,0,0,0)", font: "italic normal" }), a, 0, 0.008, 0);
        p.rotation.x = Math.PI / 2;
        break;
      }
      case "pallet_sacks": {
        for (const bx of [-0.5, 0, 0.5]) box("bearer", 0.1, 0.1, 0.8, M.wood(), a, bx, 0.05, 0);
        for (let i = 0; i < 5; i++) box("plank", 1.2, 0.025, 0.1, M.wood(), a, 0, 0.11, -0.35 + i * 0.175);
        const sacks: [number, number, number, number][] = [[-0.28, 0.25, -0.2, 0.1], [0.28, 0.25, -0.2, -0.08], [-0.28, 0.25, 0.2, -0.05], [0.28, 0.25, 0.2, 0.12], [0, 0.48, 0, 1.5]];
        sacks.forEach(([sx, sy, sz, ry], i) => box(`sack${i}`, 0.5, 0.22, 0.36, M.hessian(), a, sx, sy, sz).rotation.y = ry);
        break;
      }
      case "tarp_heap": {
        box("heapA", 2.0, 0.5, 1.4, M.tarp(), a, 0, 0.25, 0);
        box("heapB", 1.4, 0.45, 1.0, M.tarp(), a, 0.2, 0.62, -0.1).rotation.y = 0.3;
        box("heapC", 0.9, 0.4, 0.8, M.tarp(), a, -0.3, 0.92, 0.15).rotation.y = -0.4;
        for (const [cx, cz] of [[-0.9, -0.6], [0.9, -0.55], [-0.85, 0.6], [0.95, 0.62]]) box("brick", 0.2, 0.1, 0.1, M.concrete(), a, cx, 0.05, cz);
        box("strap", 0.04, 0.01, 1.5, M.black(), a, 0.1, 0.51, 0);
        break;
      }
      case "fire_barrel": {
        cyl("drum", 0.58, 0.88, M.rust(), a, 0, 0.44, 0, 12);
        cyl("rim", 0.6, 0.04, M.darkmetal(), a, 0, 0.88, 0, 12);
        for (let i = 0; i < 4; i++) { const hole = box(`hole${i}`, 0.07, 0.09, 0.03, M.fire(), a, Math.sin(i * Math.PI / 2 + 0.4) * 0.285, 0.5, Math.cos(i * Math.PI / 2 + 0.4) * 0.285, true); hole.rotation.y = i * Math.PI / 2 + 0.4; }
        const flame = MeshBuilder.CreateCylinder("flame", { diameterTop: 0.05, diameterBottom: 0.34, height: 0.5, tessellation: 8 }, scene);
        flame.material = M.fire(); flame.parent = a; flame.position.y = 1.08; flame.isPickable = false; meshes.push(flame); emissive.push(flame);
        const core = MeshBuilder.CreateCylinder("flameCore", { diameterTop: 0.03, diameterBottom: 0.18, height: 0.34, tessellation: 8 }, scene);
        core.material = M.flame(); core.parent = a; core.position.set(0.02, 1.02, -0.02); core.isPickable = false; meshes.push(core); emissive.push(core);
        box("stickA", 0.04, 0.04, 0.7, M.wood(), a, 0.1, 0.92, 0).rotation.set(0.5, 0.3, 0);
        box("stickB", 0.04, 0.04, 0.6, M.wood(), a, -0.12, 0.9, 0.05).rotation.set(-0.4, -1.1, 0);
        break;
      }
      case "stencil": {
        plane("stencil", w || 0.7, hh || 0.5, pal.text("stencil", h.text ?? "07", { w: w || 0.7, h: hh || 0.5, color: h.variant === "yellow" ? "rgba(240,205,60,0.9)" : "rgba(238,236,228,0.88)", bg: "rgba(0,0,0,0)" }), a, 0, 0, 0);
        break;
      }
    }
  }

  for (const s of sources.values()) s.freezeWorldMatrix();
  const merged = mergeStatic(meshes);
  for (const m of merged) { m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true; }

  return {
    root, meshes: merged, emissive,
    dispose() { for (const m of merged) m.dispose(); root.dispose(false, true); pal.dispose(); },
  };
}

/**
 * MEASURED (1.0 beta profiling): props were ~300 loose meshes (a barber chair alone is 9 draw
 * calls). Everything here is static, so meshes sharing a material are merged per 12 m zone,
 * matching the map's zoning so light culling stays local. Text planes keep unique materials and
 * therefore stay single; instances are never merged (their source is invisible).
 */
function mergeStatic(meshes: Mesh[]): Mesh[] {
  const ZONE = 12; // props are small: coarser zones than the map's 8 m structural tiles
  const groups = new Map<string, Mesh[]>();
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    const p = m.getAbsolutePosition();
    const key = `${m.material?.uniqueId ?? "none"}_${Math.floor(p.x / ZONE)}_${Math.floor(p.z / ZONE)}`;
    const g = groups.get(key);
    if (g) g.push(m); else groups.set(key, [m]);
  }
  const out: Mesh[] = [];
  for (const [key, list] of groups) {
    if (list.length === 1) { out.push(list[0]); continue; }
    const mat = list[0].material;
    const receive = list[0].receiveShadows;
    const mm = Mesh.MergeMeshes(list, true, true, undefined, false, false);
    if (!mm) { out.push(...list); continue; }
    mm.name = `props_${key}`;
    mm.material = mat;
    mm.isPickable = false;
    mm.receiveShadows = receive;
    out.push(mm);
  }
  return out;
}
