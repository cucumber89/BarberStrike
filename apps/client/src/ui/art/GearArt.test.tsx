import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ARMOR, GRENADES, PERKS, WEAPONS, type ArmorId, type GrenadeId, type PerkId, type WeaponId } from "@frankibarber/shared";
import { ArmorArt, GrenadeArt, PerkArt, WeaponArt } from "./GearArt";

/** Every shop item has a drawing, and none of them is an empty placeholder. */

const SHAPE = /<(path|circle|rect|line|ellipse|polygon|polyline)\b/g;
const shapeCount = (html: string): number => (html.match(SHAPE) ?? []).length;

function expectDrawing(html: string, id: string, viewBox: string) {
  expect(html.startsWith("<svg")).toBe(true);
  expect(html).toContain(`data-art="${id}"`);
  expect(html).toContain(`viewBox="${viewBox}"`);
  expect(html).toContain('stroke="currentColor"');
  expect(shapeCount(html)).toBeGreaterThanOrEqual(4);
}

describe("GearArt", () => {
  it("draws every weapon in the shared 240×100 frame", () => {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      expectDrawing(renderToStaticMarkup(<WeaponArt id={id} />), id, "0 0 240 100");
    }
  });

  it("draws every grenade (including the launcher shell)", () => {
    for (const id of Object.keys(GRENADES) as GrenadeId[]) {
      expectDrawing(renderToStaticMarkup(<GrenadeArt id={id} />), id, "0 0 100 100");
    }
  });

  it("draws every perk", () => {
    for (const id of Object.keys(PERKS) as PerkId[]) {
      expectDrawing(renderToStaticMarkup(<PerkArt id={id} />), id, "0 0 100 100");
    }
  });

  it("draws every armour tier", () => {
    for (const id of Object.keys(ARMOR) as ArmorId[]) {
      expectDrawing(renderToStaticMarkup(<ArmorArt id={id} />), id, "0 0 100 100");
    }
  });

  it("is decorative by default and labelled when given a title", () => {
    const plain = renderToStaticMarkup(<WeaponArt id="pistol" className="art" />);
    expect(plain).toContain('aria-hidden="true"');
    expect(plain).toContain('class="art"');
    expect(plain).not.toContain("<title>");
    const named = renderToStaticMarkup(<WeaponArt id="pistol" title="P9 Straight Razor" />);
    expect(named).toContain("<title>P9 Straight Razor</title>");
    expect(named).toContain('role="img"');
    expect(named).not.toContain("aria-hidden");
  });
});
