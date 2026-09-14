import { describe, expect, it } from "vitest";
import { BOYS_CLASSES, MODES, PRIMARY_ORDER, boysAllows, type GameMode } from "@frankibarber/shared";
import { CAT_INFO, ITEM_ROLE, MAX_PER_CAT, SHOP_CATS, catForCode, itemName, itemStats, keyForPos, posForCode, shopCatalog } from "./shopCatalog";

describe("shop catalogue", () => {
  it("the tenth primary is reachable: its printed key and the handler agree on the 0 key", () => {
    // The bug: PRIMARY_ORDER has ten guns, the row printed 1·10 and the handler took Digit1–9.
    expect(PRIMARY_ORDER.length).toBe(10);
    expect(keyForPos(10)).toBe("0");
    expect(posForCode("Digit0")).toBe(10);
    expect(posForCode("Numpad0")).toBe(10);
    const cats = shopCatalog({ mode: "tdm" });
    expect(cats[1][posForCode("Digit0") - 1]).toBe("launcher");
    for (let p = 1; p <= 9; p++) expect(posForCode(`Digit${p}`)).toBe(p);
    expect(posForCode("KeyB")).toBe(0);
    expect(posForCode("Digit")).toBe(0);
  });

  it("digits 1–4 arm an aisle, 5–9 and 0 do not", () => {
    expect(catForCode("Digit1")).toBe(1);
    expect(catForCode("Digit4")).toBe(4);
    expect(catForCode("Digit5")).toBeNull();
    expect(catForCode("Digit0")).toBeNull();
    expect(catForCode("Escape")).toBeNull();
  });

  it("no aisle in any mode or role has more items than the keys can reach", () => {
    for (const mode of Object.keys(MODES) as GameMode[]) {
      const cats = shopCatalog({ mode });
      for (const c of SHOP_CATS) expect(cats[c].length, `${mode} aisle ${c}`).toBeLessThanOrEqual(MAX_PER_CAT);
    }
    for (const cls of BOYS_CLASSES) {
      const cats = shopCatalog({ mode: "boys", boysClass: cls });
      for (const c of SHOP_CATS) for (const id of cats[c]) expect(boysAllows(cls, id), `${cls} ${id}`).toBe(true);
    }
  });

  it("bomb mode drops the launcher and the perks, other modes keep them", () => {
    expect(shopCatalog({ mode: "bomb" })[1]).not.toContain("launcher");
    expect(shopCatalog({ mode: "bomb" })[4]).toEqual(["light", "heavy"]);
    expect(shopCatalog({ mode: "tdm" })[1]).toContain("launcher");
    expect(shopCatalog({ mode: "tdm" })[4]).toContain("flask");
  });

  it("every item on sale has a role line, a name and at least one stat", () => {
    const cats = shopCatalog({ mode: "tdm" });
    for (const c of SHOP_CATS) for (const id of cats[c]) {
      expect(ITEM_ROLE[id], id).toMatch(/\S/);
      expect(itemName(id)).not.toBe(id);
      expect(itemStats(id).length, id).toBeGreaterThan(0);
    }
    for (const c of SHOP_CATS) expect(CAT_INFO[c].label).toMatch(/\S/);
  });
});
