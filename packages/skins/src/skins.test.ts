import { describe, expect, it } from "vitest";
import { hashString, WEAPON_ORDER } from "@frankibarber/shared";
import { Brush } from "./brush";
import { buildFrame, catalog, COLLECTIONS, fitsWeapon, frameUv, GENERATORS, genericFrame, MOTIFS, RecordingCanvas, renderSkin, roleFor, type SkinDef } from "./index";

/** The nineteen recipe ids that shipped before the layered generator; saved profiles refer to them. */
const LEGACY_IDS = ["warsztat", "stalowka", "talk", "slupek-frankiego", "szlaczek-babci", "osy", "beton", "oliwka", "rdza", "nocna-zmiana", "brzytwa", "landrynka", "fioletowy-dym", "tokio", "krolewski", "krwawy-zachod", "czarne-zloto", "zorza", "korona-frankiego"];
const RARITIES = ["pospolity", "rzadki", "epicki", "legendarny", "zloty"];

const record = (def: SkinDef, weapon: (typeof WEAPON_ORDER)[number] = "rifle", wear = 0, pass: "albedo" | "emissive" = "albedo") => {
  const frame = genericFrame(weapon); const c = new RecordingCanvas(frame.width, frame.height);
  renderSkin(def, weapon, "pattern", c, wear, { frame, pass }); return c;
};
/** The operation stream with every colour erased: two skins that only differ by palette collide here. */
const shapeSignature = (c: RecordingCanvas): number => hashString(c.serialize().replace(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/gi, "#"));

describe("skin recipe contract", () => {
  it("pins exact operation streams for three seeds per generator", () => {
    const hashes: Record<string, number[]> = {};
    for (const generator of Object.keys(GENERATORS)) hashes[generator] = [0, 1987, 4294967295].map(seed => {
      const def = { ...catalog.find(s => s.generator === generator)!, seed };
      const a = record(def, "rifle", .21), b = record(def, "rifle", .21);
      expect(a.serialize()).toBe(b.serialize()); return hashString(a.serialize());
    });
    expect(hashes).toMatchSnapshot();
  });
  it("validates every recipe and keeps scope glass regardless of overrides", () => {
    expect(new Set(catalog.map(s => s.id)).size).toBe(catalog.length);
    for (const s of catalog) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/); expect(s.name.length).toBeLessThanOrEqual(22); expect(s.blurb.length).toBeLessThanOrEqual(64);
      expect(GENERATORS[s.generator]).toBeTypeOf("function"); expect(RARITIES).toContain(s.rarity);
      expect(COLLECTIONS.map(c => c.id)).toContain(s.collection);
      if (s.params.crude) expect(s.nsfw).toBe(true);
      if (s.collection === "pogodzinach") expect(s.nsfw).toBe(true);
      if (s.weapons !== "all") { expect(s.weapons.length).toBeGreaterThan(0); for (const w of s.weapons) expect(WEAPON_ORDER).toContain(w); }
      for (const key of ["hero", "stockMotif", "frontMotif", "magMotif", "gripMotif"]) if (s.params[key]) expect(MOTIFS[String(s.params[key])], `${s.id}.${key}`).toBeDefined();
      expect(roleFor({ ...s, mats: { lens: "pattern" } }, "lens")).toBe("keep");
      const original = JSON.stringify(s); record(s, "sniper"); expect(JSON.stringify(s)).toBe(original);
    }
  });
  it("keeps every legacy id, so saved collections still resolve", () => {
    for (const id of LEGACY_IDS) expect(catalog.some(s => s.id === id), id).toBe(true);
    expect(catalog.length - LEGACY_IDS.length).toBeGreaterThanOrEqual(30);
  });
  it("gives every firearm at least two new finishes", () => {
    const fresh = catalog.filter(s => !LEGACY_IDS.includes(s.id));
    for (const weapon of WEAPON_ORDER) expect(fresh.filter(s => fitsWeapon(s, weapon)).length, weapon).toBeGreaterThanOrEqual(2);
  });
});

describe("layered art", () => {
  it("paints material, illustration and detail layers on every skin; none is a single colour", () => {
    const signatures = new Map<number, string>();
    for (const s of catalog) {
      const c = record(s); const { kinds, colors, texts, ops } = c.summary();
      expect(colors.size, `${s.id} colours`).toBeGreaterThanOrEqual(8);
      // A hero or part motif: curves, polygons or ellipses beyond what a flat finish would use.
      expect((kinds.curve ?? 0) + (kinds.poly ?? 0) + (kinds.ellipse ?? 0), `${s.id} illustration`).toBeGreaterThan(12);
      // Legends, stickers, serial or the collection mark: text is always present.
      expect(texts.length, `${s.id} text`).toBeGreaterThan(0);
      expect(kinds.text ?? 0).toBeGreaterThan(0);
      expect(ops).toBeGreaterThan(400);
      const signature = shapeSignature(c);
      expect(signatures.get(signature), `${s.id} differs from ${signatures.get(signature)} only by colour`).toBeUndefined();
      signatures.set(signature, s.id);
    }
  });
  it("draws the rarest skins with visibly more work than the common ones", () => {
    // Wear and grain are noise, not design: strip them so only drawn art is counted.
    const art = (s: SkinDef) => record({ ...s, params: { ...s.params, wear: 0, grain: 0 } }).operations.length;
    const load = (rarity: string) => { const list = catalog.filter(s => s.rarity === rarity); return list.reduce((n, s) => n + art(s), 0) / list.length; };
    expect(load("legendarny")).toBeGreaterThan(load("pospolity") * 1.15);
    expect(load("zloty")).toBeGreaterThan(load("pospolity") * 1.15);
  });
  it("renders an emissive pass only for skins that declare glow, on black", () => {
    const glowing = catalog.find(s => s.params.glow && s.params.heroGlow)!;
    const e = record(glowing, "rifle", 0, "emissive").summary();
    expect(e.colors.has("#000000")).toBe(true); expect(e.ops).toBeGreaterThan(2);
    const plain = catalog.find(s => !s.params.glow && !MOTIFS[String(s.params.hero)]?.emissive)!;
    const { kinds } = record(plain, "rifle", 0, "emissive").summary();
    expect(kinds.rect).toBe(2); // one black fill per flank
    for (const drawn of ["poly", "circle", "curve", "ellipse", "text", "line"]) expect(kinds[drawn] ?? 0, drawn).toBe(0);
  });
  it("adapts to every weapon frame and never touches keep roles", () => {
    for (const weapon of WEAPON_ORDER) {
      const c = new RecordingCanvas(); renderSkin(catalog[0], weapon, "keep", c); expect(c.operations).toEqual([]);
      expect(record(catalog[0], weapon).operations.length).toBeGreaterThan(400);
    }
  });
});

describe("frame and flanks", () => {
  it("lays the weapon out with a receiver, margins and a texture within eight megabytes", () => {
    const f = genericFrame("rifle");
    expect(f.width * f.height * 4).toBeLessThanOrEqual(8 << 20);
    expect(f.zSpan).toBeGreaterThan(f.body.z1 - f.body.z0); expect(f.ySpan).toBeGreaterThan(f.body.y1 - f.body.y0);
    expect(f.stock && f.front && f.magazine && f.grip).toBeTruthy();
    expect(f.stock!.z1).toBeLessThanOrEqual(f.receiver.z0 + .015); expect(f.front!.z0).toBeGreaterThanOrEqual(f.receiver.z1 - .015);
    expect(() => buildFrame("pistol", [])).toThrow();
  });
  it("maps the right flank to the upper band and the left to the lower, never wrapping", () => {
    const f = genericFrame("rifle");
    const [uR, vR] = frameUv(f, .02, .04, .1, 1, 0, 0), [uL, vL] = frameUv(f, -.02, .04, .1, -1, 0, 0);
    expect(uR).toBe(uL); expect(vR).toBeGreaterThan(.5); expect(vL).toBeLessThan(.5); expect(vR - .5).toBeCloseTo(vL, 6);
    const [uFar, vFar] = frameUv(f, 0, 9, 9, 0, 1, 0); expect(uFar).toBeLessThan(1); expect(vFar).toBeLessThan(1);
    const [, vTop] = frameUv(f, .01, .08, .1, 0, 1, 0); expect(vTop).toBeGreaterThan(.5);
    const [, vTopLeft] = frameUv(f, -.01, .08, .1, 0, 1, 0); expect(vTopLeft).toBeLessThan(.5);
  });
  it("re-reads text on the left flank so nothing runs backwards", () => {
    const f = genericFrame("rifle");
    const flank = (side: "right" | "left") => { const c = new RecordingCanvas(f.width, f.height); const b = Brush.forBand(c, f, side); b.text("KLATKA 13", .1, .04, .02, "#fff"); b.end(); return c.operations; };
    const right = flank("right"), left = flank("left");
    const textScale = (ops: unknown[][]) => ops.filter(op => op[0] === "scale").at(-1)!;
    expect((textScale(right)[1] as number) > 0).toBe(true); expect((textScale(left)[1] as number) < 0).toBe(true);
    expect(right.find(op => op[0] === "text")![1]).toBe("KLATKA 13"); expect(left.find(op => op[0] === "text")![1]).toBe("KLATKA 13");
  });
});
