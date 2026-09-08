import { describe, expect, it } from "vitest";
import { ECONOMY, WEAPON_PRICES, applyBuy, applySell, buyWindowLeft, buyWindowOpen, canBuy, freshWallet, killReward, takeGrenade, weaponForSlot, type BuyContext } from "./economy";
import { MatchPhase } from "./types";

const open = (over: Partial<BuyContext> = {}): BuyContext => ({ now: 5000, spawnedAt: 0, phase: MatchPhase.Playing, alive: true, nearStation: false, ...over });
const closed = (): BuyContext => open({ now: 50_000 });

describe("buy window", () => {
  it("gives a full 30 seconds and closes exactly at the deadline", () => {
    expect(ECONOMY.buyWindowMs).toBe(30000);
    expect(buyWindowLeft(open({ now: 29999 }))).toBe(1);
    expect(buyWindowOpen(open({ now: 30000 }))).toBe(false);
    expect(buyWindowLeft(open({ now: 30000 }))).toBe(0);
  });
  it("is open after a spawn, closes after buyWindowMs, reopens at a station, always open in warm-up", () => {
    expect(buyWindowOpen(open())).toBe(true);
    expect(buyWindowOpen(open({ now: ECONOMY.buyWindowMs + 1 }))).toBe(false);
    expect(buyWindowOpen(open({ now: 50_000, nearStation: true }))).toBe(true);
    expect(buyWindowOpen(open({ now: 50_000, phase: MatchPhase.Waiting }))).toBe(true);
    expect(buyWindowOpen(open({ alive: false, phase: MatchPhase.Waiting }))).toBe(false);
    expect(buyWindowLeft(open({ now: 4000 }))).toBe(ECONOMY.buyWindowMs - 4000);
    expect(buyWindowLeft(open({ now: 50_000, nearStation: true }))).toBe(Infinity);
  });

  it("never opens in a mode without a shop (Gun Game), not even in warm-up or at a station", () => {
    expect(buyWindowOpen(open({ mode: "gungame" }))).toBe(false);
    expect(buyWindowOpen(open({ mode: "gungame", now: 50_000, nearStation: true }))).toBe(false);
    expect(buyWindowOpen(open({ mode: "gungame", now: 50_000, phase: MatchPhase.Waiting }))).toBe(false);
    expect(buyWindowLeft(open({ mode: "gungame" }))).toBe(0);
    expect(buyWindowLeft(open({ mode: "gungame", now: 50_000, nearStation: true }))).toBe(0);
    // Modes with a shop are untouched by the field.
    expect(buyWindowOpen(open({ mode: "ffa" }))).toBe(true);
    expect(buyWindowLeft(open({ mode: "tdm", now: 4000 }))).toBe(ECONOMY.buyWindowMs - 4000);
    expect(canBuy(freshWallet(), "smg", open({ mode: "gungame" }))).toEqual({ ok: false, reason: "closed" });
  });

  it("in Ostrzyżeni the shop is the survivors' alone — the shaved side has none, anywhere", () => {
    expect(buyWindowOpen(open({ mode: "ostrzyzeni" }))).toBe(true);
    expect(buyWindowOpen(open({ mode: "ostrzyzeni", phase: MatchPhase.Prep }))).toBe(true);
    expect(buyWindowOpen(open({ mode: "ostrzyzeni", shaved: true }))).toBe(false);
    expect(buyWindowOpen(open({ mode: "ostrzyzeni", shaved: true, phase: MatchPhase.Prep }))).toBe(false);
    expect(buyWindowOpen(open({ mode: "ostrzyzeni", shaved: true, now: 50_000, nearStation: true }))).toBe(false);
    expect(buyWindowLeft(open({ mode: "ostrzyzeni", shaved: true, phase: MatchPhase.Prep }))).toBe(0);
    // The flag is only read where the mode says so: a shaved head in TDM (drop E) still shops.
    expect(buyWindowOpen(open({ mode: "tdm", shaved: true }))).toBe(true);
  });
});

describe("buying weapons", () => {
  it("starts with a free pistol and enough money for one cheap primary plus a grenade", () => {
    const w = freshWallet();
    expect(w.owned).toEqual(["pistol"]);
    expect(w.money).toBe(ECONOMY.startMoney);
    expect(applyBuy(w, "smg", open()).ok).toBe(true);
    expect(w.owned).toEqual(["pistol", "smg"]);
    expect(w.money).toBe(ECONOMY.startMoney - WEAPON_PRICES.smg);
    expect(applyBuy(w, "frag", open()).ok).toBe(true);
    expect(w.money).toBe(ECONOMY.startMoney - WEAPON_PRICES.smg - 300);
  });

  it("refuses without money, when closed, or when already owned", () => {
    const w = freshWallet();
    expect(canBuy(w, "dmr", open())).toEqual({ ok: false, reason: "money" });
    expect(canBuy(w, "smg", closed())).toEqual({ ok: false, reason: "closed" });
    expect(canBuy(w, "pistol", open())).toEqual({ ok: false, reason: "owned" });
  });

  it("replacing the primary refunds 70 % of the old one (only one primary is carried)", () => {
    const w = freshWallet();
    w.money = 5000;
    applyBuy(w, "smg", open());
    const before = w.money;
    const v = applyBuy(w, "rifle", open());
    expect(v.ok && v.refund).toBe(Math.round(WEAPON_PRICES.smg * ECONOMY.sellRatio));
    expect(w.owned).toEqual(["pistol", "rifle"]);
    expect(w.money).toBe(before + Math.round(WEAPON_PRICES.smg * 0.7) - WEAPON_PRICES.rifle);
  });

  it("sells only while the shop is open and never the pistol; money is capped", () => {
    const w = freshWallet();
    applyBuy(w, "shotgun", open());
    expect(applySell(w, "shotgun", closed())).toEqual({ ok: false, reason: "closed" });
    expect(applySell(w, "pistol", open())).toEqual({ ok: false, reason: "pistol" });
    expect(applySell(w, "shotgun", open())).toEqual({ ok: true, refund: Math.round(WEAPON_PRICES.shotgun * 0.7) });
    expect(w.owned).toEqual(["pistol"]);
    w.money = ECONOMY.maxMoney;
    applyBuy(w, "smg", open());
    applySell(w, "smg", open());
    expect(w.money).toBeLessThanOrEqual(ECONOMY.maxMoney);
  });

  it("maps keyboard slots to owned weapons", () => {
    const w = freshWallet();
    expect(weaponForSlot(w, 1)).toBeNull();
    expect(weaponForSlot(w, 2)).toBe("pistol");
    w.money = 5000;
    applyBuy(w, "rifle", open());
    expect(weaponForSlot(w, 1)).toBe("rifle");
  });
});

describe("grenade slots", () => {
  it("holds one kind per slot, up to the slot maximum, and is consumed by throws", () => {
    const w = freshWallet();
    w.money = 9999;
    expect(applyBuy(w, "frag", open()).ok).toBe(true);
    expect(applyBuy(w, "frag", open()).ok).toBe(true);
    expect(canBuy(w, "frag", open())).toEqual({ ok: false, reason: "full" });
    expect(canBuy(w, "molotov", open())).toEqual({ ok: false, reason: "slot" });   // lethal slot holds frags
    expect(applyBuy(w, "flash", open()).ok).toBe(true);                             // tactical slot is separate
    expect(w).toMatchObject({ lethal: "frag", lethalCount: 2, tactical: "flash", tacticalCount: 1 });
    expect(takeGrenade(w, "flash")).toBe(true);
    expect(takeGrenade(w, "flash")).toBe(false);
    expect(w.tactical).toBe("");
    expect(takeGrenade(w, "frag")).toBe(true);
    expect(w.lethalCount).toBe(1);
    // With the frags gone the lethal slot accepts another kind again.
    takeGrenade(w, "frag");
    expect(canBuy(w, "molotov", open()).ok).toBe(true);
  });
});

describe("rewards", () => {
  it("pays kills, more for head shots", () => {
    expect(killReward(false)).toBe(ECONOMY.killReward);
    expect(killReward(true)).toBe(ECONOMY.killReward + ECONOMY.headshotBonus);
  });
});
