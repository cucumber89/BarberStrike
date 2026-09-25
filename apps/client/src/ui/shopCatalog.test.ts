import { describe, expect, it } from "vitest";
import { BOYS_CLASSES, ECONOMY, GRENADES, MODES, MatchPhase, PERK_EFFECT, PERK_ORDER, PRIMARY_ORDER, boysAllows, buyShortfall, canBuy, freshWallet,
  type BuyContext, type GameMode, type ShopItemId, type Wallet } from "@frankibarber/shared";
import { CAT_INFO, ITEM_ROLE, MAX_PER_CAT, SHOP_CATS, catForCode, itemName, itemStats, keyForPos, posForCode, shopCatalog, tileTag } from "./shopCatalog";

describe("shop catalogue", () => {
  it("every position printed in an aisle is a key the handler accepts", () => {
    // The bug this test was written for: PRIMARY_ORDER has ten guns, the row printed 1·10 and the
    // handler took Digit1–9. Splitting the guns CS2-style (mid-tier / rifles) means no aisle is
    // ten deep any more, but the printed key and the accepted key still have to be one rule.
    expect(PRIMARY_ORDER.length).toBe(10);
    expect(keyForPos(10)).toBe("0");
    expect(posForCode("Digit0")).toBe(10);
    expect(posForCode("Numpad0")).toBe(10);
    for (let p = 1; p <= 9; p++) expect(posForCode(`Digit${p}`)).toBe(p);
    expect(posForCode("KeyB")).toBe(0);
    expect(posForCode("Digit")).toBe(0);
    const cats = shopCatalog({ mode: "tdm" });
    for (const c of SHOP_CATS) cats[c].forEach((id, i) => {
      expect(posForCode(`Digit${keyForPos(i + 1)}`), `${id} prints ${c}·${keyForPos(i + 1)}`).toBe(i + 1);
    });
  });

  it("digits 1–5 arm an aisle (CS2's five), 6–9 and 0 do not", () => {
    expect(catForCode("Digit1")).toBe(1);
    expect(catForCode("Digit5")).toBe(5);
    expect(catForCode("Digit6")).toBeNull();
    expect(catForCode("Digit0")).toBeNull();
    expect(catForCode("Escape")).toBeNull();
  });

  it("sorts the guns the way CS2 does: pistols, the mid-tier, the rifles", () => {
    const cats = shopCatalog({ mode: "tdm" });
    expect(cats[1], "aisle 1 is the sidearms, and the pistol round can afford one").toContain("revolver");
    expect(cats[2], "the mid-tier is the cheap close-range answer").toEqual(["smg", "smg2", "shotgun", "autoshotgun"]);
    expect(cats[3], "and the rifles are what a won round buys").toContain("rifle");
    expect(cats[3]).toContain("sniper");
    expect(cats[2].concat(cats[3]).sort(), "between them they are every primary").toEqual([...PRIMARY_ORDER].sort());
    expect(cats[5], "grenades are the last aisle, as in CS2").toContain("frag");
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

  it("bomb and the 1 v 1 drop the launcher and the perks, other modes keep them", () => {
    // The 1 v 1 is Counter-Strike's mode: no health regeneration, no damage-resistance flask, no
    // rocket launcher. `modeAllowsItem` is the rule, and the server enforces the same one.
    for (const mode of ["bomb", "duel"] as const) {
      expect(shopCatalog({ mode })[3], mode).not.toContain("launcher");
      expect(shopCatalog({ mode })[4], mode).toEqual(["light", "heavy"]);
    }
    expect(shopCatalog({ mode: "tdm" })[3]).toContain("launcher");
    expect(shopCatalog({ mode: "tdm" })[4]).toContain("flask");
  });

  it("the launcher card quotes its blast, and no range it does not have", () => {
    // `WEAPONS.launcher.damage` is 0 — the damage is the SHELL's — so the most expensive gun in
    // the shop used to advertise no damage at all, under a "Zasięg 40 m" that means nothing for a
    // projectile: it flies until it hits something. Both were read straight off the weapon table.
    const rows = itemStats("launcher");
    const blast = rows.find((r) => r.label === "Wybuch");
    expect(blast, "the launcher says what its shell does").toBeTruthy();
    expect(blast!.value).toContain(String(GRENADES.shell.damage));
    expect(blast!.value).toContain("4,5 m");
    expect(rows.map((r) => r.label), "no hitscan range on a grenade").not.toContain("Zasięg");
    // The rows every gun shares are still there: this is one card's numbers, not a different card.
    expect(rows.map((r) => r.label)).toEqual(expect.arrayContaining(["Ogień", "Przeładowanie"]));
    // And a gun that DOES have a range keeps it.
    expect(itemStats("rifle").map((r) => r.label)).toContain("Zasięg");
  });

  it("a perk card says what the perk does, in the server's own numbers", () => {
    // It used to say "Czas: 25 s" and nothing else — how long, never for what.
    const val = (id: "flask" | "roids" | "energy" | "fade", label: string) =>
      itemStats(id).find((r) => r.label === label)?.value;
    expect(val("flask", "Obrażenia")).toBe(`−${Math.round(PERK_EFFECT.flaskResist * 100)} %`);
    expect(val("roids", "Regeneracja")).toBe(`${PERK_EFFECT.roidsRegenPerSec} HP/s`);
    expect(val("roids", "Rusza po"), "the two-second gate, which nothing used to mention").toBe("2 s bez trafienia");
    expect(val("energy", "Sprint")).toBe("+15 %");
    expect(val("fade", "Osłona")).toBe("3 s");
    // The fade has no duration of its own, so its last row is what triggers it, not a countdown.
    expect(itemStats("fade").at(-1)!.label).toBe("Działa");
    for (const id of PERK_ORDER) expect(itemStats(id).length, id).toBeGreaterThan(1);
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

describe("the tile's one tag (§5.2 #49)", () => {
  // The shop's own composition (Shop.tsx `verdict` + `tile`): a shut window is "closed" before
  // canBuy is asked; a grenade's "have" is „PEŁNO” only at the slot's max.
  const ctx: BuyContext = { now: 0, spawnedAt: 0, phase: MatchPhase.Prep, alive: true, nearStation: true, mode: "bomb" };
  const tagOf = (w: Wallet, id: ShopItemId, o: { open?: boolean; carried: boolean; have: string }) => {
    const v = o.open === false ? { ok: false as const, reason: "closed" as const } : canBuy(w, id, ctx);
    const reason = v.ok ? "" : v.reason;
    return tileTag({ reason, carried: o.carried, have: o.have, short: reason === "money" ? buyShortfall(w, id, ctx) : 0 });
  };
  const frags = (n: number, cash: number): Wallet => ({ ...freshWallet(), money: cash, lethal: "frag", lethalCount: n });
  const fragHave = (n: number) => (n >= ECONOMY.lethalMax ? "PEŁNO" : "");

  it("one Frag of two, short of money: the refusal with its amount, not „PEŁNO”", () => {
    const t = tagOf(frags(1, 100), "frag", { carried: true, have: fragHave(1) });
    expect(t).toEqual({ text: `Brakuje $${GRENADES.frag.price - 100}`, tone: "no", locked: true });
  });

  it("one Frag of two, window shut: no „PEŁNO” (the header says ZAMKNIĘTY once)", () => {
    const t = tagOf(frags(1, 5_000), "frag", { open: false, carried: true, have: fragHave(1) });
    expect(t.text).toBe("");
    expect(t.text).not.toBe("PEŁNO");
  });

  it("two Frags of two: „PEŁNO”, open or shut", () => {
    expect(ECONOMY.lethalMax).toBe(2);
    expect(tagOf(frags(2, 5_000), "frag", { carried: true, have: fragHave(2) })).toEqual({ text: "PEŁNO", tone: "have", locked: false });
    expect(tagOf(frags(2, 5_000), "frag", { open: false, carried: true, have: fragHave(2) }).text).toBe("PEŁNO");
  });

  it("one Frag of two with the money: no tag, it sells", () => {
    expect(tagOf(frags(1, 5_000), "frag", { carried: true, have: fragHave(1) })).toEqual({ text: "", tone: "", locked: false });
  });

  it("what you carry reads as yours: MASZ on the gun, nosisz on the plate; a refusal on the rest", () => {
    const w = { ...freshWallet(), money: 100 };
    expect(tagOf(w, "pistol", { carried: true, have: "MASZ" })).toEqual({ text: "MASZ", tone: "have", locked: false });
    expect(tagOf({ ...w, armor: 100 }, "light", { carried: true, have: "nosisz" }).text).toBe("nosisz");
    expect(tagOf(w, "rifle", { carried: false, have: "MASZ" }).text).toMatch(/^Brakuje \$[\d,]+$/);
    expect(tagOf({ ...w, money: 5_000 }, "smoke", { carried: false, have: "" }).text).toBe("");
    expect(tagOf({ ...w, money: 5_000, tactical: "flash", tacticalCount: 1 }, "smoke", { carried: false, have: "" })).toEqual({ text: "SLOT ZAJĘTY", tone: "no", locked: true });
  });
});
