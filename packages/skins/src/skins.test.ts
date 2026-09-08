import { describe, expect, it } from "vitest";
import { hashString } from "@frankibarber/shared";
import { catalog, GENERATORS, RecordingCanvas, renderSkin, roleFor } from "./index";

describe("skin recipe contract", () => {
  it("pins exact operation streams for three seeds per generator", () => {
    const hashes: Record<string, number[]> = {};
    for (const generator of Object.keys(GENERATORS)) hashes[generator] = [0, 1987, 4294967295].map(seed => {
      const def = { ...catalog.find(s => s.generator === generator)!, seed };
      const a = new RecordingCanvas(), b = new RecordingCanvas();
      renderSkin(def, "rifle", "pattern", a, .21); renderSkin(def, "rifle", "pattern", b, .21);
      expect(a.serialize()).toBe(b.serialize()); return hashString(a.serialize());
    });
    expect(hashes).toMatchSnapshot();
  });
  it("validates every recipe and keeps scope glass regardless of overrides", () => {
    expect(new Set(catalog.map(s => s.id)).size).toBe(catalog.length);
    for (const s of catalog) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/); expect(s.name.length).toBeLessThanOrEqual(22); expect(s.blurb.length).toBeLessThanOrEqual(64);
      expect(GENERATORS[s.generator]).toBeTypeOf("function"); expect(["pospolity", "rzadki", "epicki", "legendarny", "zloty"]).toContain(s.rarity);
      if (s.params.crude) expect(s.nsfw).toBe(true);
      expect(roleFor({ ...s, mats: { lens: "pattern" } }, "lens")).toBe("keep");
      const original = JSON.stringify(s); renderSkin(s, "sniper", "pattern", new RecordingCanvas()); expect(JSON.stringify(s)).toBe(original);
    }
  });
});
