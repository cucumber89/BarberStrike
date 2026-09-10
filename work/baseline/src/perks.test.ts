import { describe, expect, it } from "vitest";
import { ARMOR, PERKS, PERK_EFFECT, perkActive, perkSpeedScale, splitDamage, noPerks } from "./perks";
import { ECONOMY, WEAPON_PRICES, applyBuy, applySell, canBuy, canSell, carriedWeapons, freshWallet, isShopItemId, weaponForSlot, type BuyContext } from "./economy";
import { MELEE, WEAPONS, isBackstab } from "./weapons";
import { MatchPhase } from "./types";

// At a station, so the window never closes as the clock moves in the perk tests.
const open = (over: Partial<BuyContext> = {}): BuyContext => ({ now: 5000, spawnedAt: 0, phase: MatchPhase.Playing, alive: true, nearStation: true, ...over });

describe("armour and flask maths", () => {
  it("a plate takes half of every hit until it is gone; the flask shaves 20 % first", () => {
    expect(splitDamage(40, 50, false)).toEqual({ taken: 20, absorbed: 20, armorLeft: 30, broke: false });
    expect(splitDamage(40, 10, false)).toEqual({ taken: 30, absorbed: 10, armorLeft: 0, broke: true });
    expect(splitDamage(40, 0, false)).toEqual({ taken: 40, absorbed: 0, armorLeft: 0, broke: false });
    expect(splitDamage(40, 0, true).taken).toBe(32);
    expect(splitDamage(40, 100, true)).toEqual({ taken: 16, absorbed: 16, armorLeft: 84, broke: false });
    // A hit never rounds to nothing.
    expect(splitDamage(1, 0, true).taken).toBe(1);
  });

  it("perks time out; the energy drink boosts sprint more than walk", () => {
    const t = noPerks();
    expect(perkActive(t, "energy", 1000)).toBe(false);
    t.energy = 2000;
    expect(perkActive(t, "energy", 1999)).toBe(true);
    expect(perkActive(t, "energy", 2000)).toBe(false);
    expect(perkSpeedScale(t, 1000, true)).toBe(PERK_EFFECT.energySprint);
    expect(perkSpeedScale(t, 1000, false)).toBe(PERK_EFFECT.energyWalk);
    expect(perkSpeedScale(t, 3000, true)).toBe(1);
  });
});

describe("shop: perks, armour, sidearms, clippers", () => {
  it("buys a perk once while it is active, then again after it lapsed", () => {
    const w = freshWallet();
    w.money = 5000;
    expect(applyBuy(w, "flask", open({ now: 1000 })).ok).toBe(true);
    expect(w.perks.flask).toBe(1000 + PERKS.flask.durationMs);
    expect(canBuy(w, "flask", open({ now: 2000 }))).toEqual({ ok: false, reason: "owned" });
    expect(canBuy(w, "flask", open({ now: 1000 + PERKS.flask.durationMs + 1 })).ok).toBe(true);
    // The fade is armed until consumed (no duration).
    expect(applyBuy(w, "fade", open({ now: 1000 })).ok).toBe(true);
    expect(perkActive(w.perks, "fade", 1000 + 3_600_000)).toBe(true);
    expect(w.money).toBe(5000 - PERKS.flask.price - PERKS.fade.price);
  });

  it("armour: heavy over light, never a downgrade, lost points can be re-bought", () => {
    const w = freshWallet();
    w.money = 5000;
    expect(applyBuy(w, "light", open()).ok).toBe(true);
    expect(w.armor).toBe(ARMOR.light.armor);
    expect(canBuy(w, "light", open())).toEqual({ ok: false, reason: "owned" });
    expect(applyBuy(w, "heavy", open()).ok).toBe(true);
    expect(w.armor).toBe(ARMOR.heavy.armor);
    expect(canBuy(w, "light", open())).toEqual({ ok: false, reason: "owned" });
    w.armor = 20;
    expect(applyBuy(w, "light", open()).ok).toBe(true);
    expect(w.armor).toBe(50);
  });

  it("the revolver replaces the pistol in slot 2 and selling it brings the pistol back", () => {
    const w = freshWallet();
    w.money = 5000;
    expect(carriedWeapons(w)).toEqual(["pistol", "clippers"]);
    expect(applyBuy(w, "revolver", open()).ok).toBe(true);
    expect(w.owned).toEqual(["revolver"]);
    expect(weaponForSlot(w, 2)).toBe("revolver");
    expect(weaponForSlot(w, 3)).toBe("clippers");
    applyBuy(w, "rifle", open());
    expect(carriedWeapons(w)).toEqual(["revolver", "rifle", "clippers"]);
    // Buying the pistol back refunds the revolver (a sidearm swap), the primary is untouched.
    const before = w.money;
    const v = applyBuy(w, "pistol", open());
    expect(v.ok && v.refund).toBe(Math.round(WEAPON_PRICES.revolver * ECONOMY.sellRatio));
    expect(w.money).toBe(before + Math.round(WEAPON_PRICES.revolver * ECONOMY.sellRatio));
    expect(carriedWeapons(w)).toEqual(["pistol", "rifle", "clippers"]);
    applyBuy(w, "revolver", open());
    expect(applySell(w, "revolver", open()).ok).toBe(true);
    expect(w.owned).toEqual(["pistol", "rifle"]);
  });

  it("the clippers are always carried, never bought or sold", () => {
    const w = freshWallet();
    w.money = 5000;
    expect(canBuy(w, "clippers", open())).toEqual({ ok: false, reason: "owned" });
    expect(canSell(w, "clippers", open())).toEqual({ ok: false, reason: "pistol" });
    expect(WEAPON_PRICES.clippers).toBe(0);
  });

  it("the launcher shell is not a shop item", () => {
    expect(isShopItemId("shell")).toBe(false);
    expect(isShopItemId("frag")).toBe(true);
    expect(isShopItemId("flask")).toBe(true);
    expect(isShopItemId("heavy")).toBe(true);
  });
});

describe("melee", () => {
  it("a swing from behind is a backstab, from the front or the side it is not", () => {
    // Victim faces +Z (yaw 0). Attacker behind = at -Z.
    expect(isBackstab(0, 0, -2, 0, 0)).toBe(true);
    expect(isBackstab(0, 0, 2, 0, 0)).toBe(false);
    expect(isBackstab(0, 2, 0, 0, 0)).toBe(false);
    expect(isBackstab(Math.PI / 2, -2, 0, 0, 0)).toBe(true); // faces +X, attacker at -X
    expect(WEAPONS.clippers.range).toBe(MELEE.range);
    expect(MELEE.backstabDamage).toBeGreaterThanOrEqual(100);
  });
});
