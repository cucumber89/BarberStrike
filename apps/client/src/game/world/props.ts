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

  /** Text on a dark or transparent plate. */
  text(key: string, text: string, opts: { w: number; h: number; color: string; bg: string; font?: string; glow?: boolean; size?: number; align?: CanvasTextAlign }): StandardMaterial {
    const k = `txt_${key}_${text}`;
    let m = this.mats.get(k) as StandardMaterial | undefined;
    if (m) return m;
    const px = 512;
    const dt = new DynamicTexture(k, { width: px, height: Math.max(64, Math.round(px * opts.h / opts.w)) }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const W = dt.getSize().width, H = dt.getSize().height;
    ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, W, H);
    const size = opts.size ?? Math.floor(H * 0.62);
    ctx.font = `${opts.font ?? "bold"} ${size}px "Bebas Neue", "Oswald", Impact, "Arial Narrow", sans-serif`;
    ctx.textAlign = opts.align ?? "center"; ctx.textBaseline = "middle";
    if (opts.glow) { ctx.shadowColor = opts.color; ctx.shadowBlur = size * 0.35; }
    ctx.fillStyle = opts.color;
    ctx.fillText(text, W / 2, H / 2 + size * 0.05);
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
  };

  const box = (name: string, w: number, h: number, d: number, mat: Material, parent: TransformNode, x = 0, y = 0, z = 0, glow = false): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.material = mat; m.parent = parent; m.position.set(x, y, z); m.isPickable = false; m.receiveShadows = true;
    meshes.push(m); if (glow) emissive.push(m);
    return m;
  };
  const cyl = (name: string, dia: number, hgt: number, mat: Material, parent: TransformNode, x = 0, y = 0, z = 0, tess = 12): Mesh => {
    const m = MeshBuilder.CreateCylinder(name, { diameter: dia, height: hgt, tessellation: [6,8,10,12].includes(tess) ? tess : 12 }, scene);
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
    const fixture = () => h.color ? pal.pbr(`fixture_${h.color}`, h.color, .6, 0, h.color, 1.4) : M.pendant();
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
          inst(key, () => { const b = MeshBuilder.CreateCylinder(key, { diameter: 0.06, height: 0.2, tessellation: 8 }, scene); b.convertToFlatShadedMesh(); b.material = mat; return b; }, a, -w / 2 + 0.06 + i * (w - 0.12) / Math.max(1, count - 1), (small ? 0.06 : 0.1) + 0.01 * (i % 2), 0, small ? 0.6 : 0.8 + (i % 4) * 0.12);
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
        const color = h.color ?? (station ? "#7dff9a" : "#c9a7ff");
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
        const texts = ["FADE OR TAPER", "WALK-INS", "NIGHT SHIFT"];
        plane("poster", w || 0.5, hh || 0.7, pal.text(`poster${variant}`, texts[Number(variant) % texts.length], { w: 5, h: 7, color: "#e8e2d6", bg: "#232126", size: 70 }), a, 0, 0, 0);
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
          box("glow", 0.3, 0.03, 0.44, fixture(), a, 0, -0.09, 0.6, true);
        } else if (h.variant === "wall") {
          box("bracket", 0.06, 0.06, 0.28, M.darkmetal(), a, 0, 0, 0.14);
          box("shade", 0.28, 0.12, 0.28, M.darkmetal(), a, 0, -0.04, 0.3);
          box("bulb", 0.2, 0.03, 0.2, fixture(), a, 0, -0.1, 0.3, true);
        } else {
          cyl("post", 0.1, hh || 3.4, M.darkmetal(), a, 0, (hh || 3.4) / 2, 0);
          box("arm", 0.06, 0.06, 0.7, M.darkmetal(), a, 0, hh || 3.4, 0.3);
          box("head", 0.36, 0.12, 0.5, M.darkmetal(), a, 0, (hh || 3.4) - 0.02, 0.6);
          box("glow", 0.3, 0.03, 0.44, fixture(), a, 0, (hh || 3.4) - 0.09, 0.6, true);
        }
        break;
      }
      case "tube_light": {
        const len = w || 1.2;
        box("housing", len, 0.06, 0.1, M.darkmetal(), a, 0, 0.03, 0);
        box("tube", len - 0.08, 0.03, 0.05, h.color ? fixture() : h.variant === "cool" ? M.tubeCool() : M.tube(), a, 0, -0.01, 0, true);
        break;
      }
      case "pendant": {
        cyl("cord", 0.008, hh || 0.6, M.black(), a, 0, (hh || 0.6) / 2, 0, 6);
        const shade = MeshBuilder.CreateCylinder("shade", { diameterTop: 0.1, diameterBottom: 0.34, height: 0.22, tessellation: 12 }, scene);
        shade.convertToFlatShadedMesh();
        shade.material = M.black(); shade.parent = a; shade.position.y = -0.1; shade.isPickable = false; meshes.push(shade);
        box("bulb", 0.14, 0.05, 0.14, fixture(), a, 0, -0.2, 0, true);
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
 * calls). Everything here is static, so meshes sharing a material are merged per 24 m zone, matching the structural detail batcher.
 * Small surface details tolerate coarser light selection than structural walls; this reserves
 * draw-call headroom for the rebuilt facades. Text planes keep unique materials and
 * therefore stay single; instances are never merged (their source is invisible).
 */
function mergeStatic(meshes: Mesh[]): Mesh[] {
  const ZONE = 24;
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
