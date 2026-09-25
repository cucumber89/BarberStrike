import { describe, expect, it } from "vitest";
import { WEAPONS, PRIMARY_ORDER, SECONDARY_ORDER, type WeaponId } from "./weapons";
import { WEAPON_ART, WEAPON_ART_IDS, weaponArtPath } from "./weaponArt";

describe("weaponArt (shop portrait metadata)", () => {
  it("covers every weapon and nothing else", () => {
    const weapons = new Set<WeaponId>([...SECONDARY_ORDER, ...PRIMARY_ORDER, "clippers"]);
    // Every real weapon has framing metadata.
    for (const id of weapons) expect(WEAPON_ART[id], `missing art for ${id}`).toBeTruthy();
    // The map has no stray keys the shop cannot draw.
    for (const id of WEAPON_ART_IDS) expect(WEAPONS[id], `art for unknown weapon ${id}`).toBeTruthy();
  });

  it("lists the fourteen shop weapons", () => {
    expect(WEAPON_ART_IDS).toHaveLength(14);
  });

  it("gives each weapon a usable 3/4 frame", () => {
    for (const id of WEAPON_ART_IDS) {
      const a = WEAPON_ART[id];
      expect(a.yawDeg).toBeGreaterThan(0);
      expect(a.pitchDeg).toBeGreaterThan(0);
      expect(a.zoom).toBeGreaterThanOrEqual(1); // never crops inside the fitted box
      expect(a.tint).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("points at the asset the bundler imports", () => {
    expect(weaponArtPath("rifle")).toBe("./assets/weapons/rifle.png");
  });
});
