import { describe, expect, it } from "vitest";
import { ECONOMY, WEAPON_PRICES, applyBuy, applySell, buyShortfall, buyWindowLeft, buyWindowOpen, canBuy, freshWallet, killReward, modeAllowsItem, takeGrenade, weaponForSlot, type BuyContext } from "./economy";
import { MatchPhase, type GameMode } from "./types";
import { BOMB } from "./bomb";
import { DUEL } from "./modes";
import { CS_ECONOMY, CS_KILL_REWARD_DEFAULT, CS_ROUND, csKillReward, csLossBonus } from "./cs";

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

  it("names the shortfall after the refund of the gun being replaced, and 0 for any other refusal", () => {
    const w = freshWallet(); // $2000, pistol only
    expect(buyShortfall(w, "dmr", open())).toBe(WEAPON_PRICES.dmr - ECONOMY.startMoney); // 900
    expect(buyShortfall(w, "smg", open())).toBe(0);                 // affordable
    expect(buyShortfall(w, "smg", closed())).toBe(0);               // refused for another reason
    expect(buyShortfall(w, "pistol", open())).toBe(0);
    // Swapping the SMG for the sniper: the refund counts towards the price.
    expect(applyBuy(w, "smg", open()).ok).toBe(true);               // $800 left
    const refund = Math.round(WEAPON_PRICES.smg * ECONOMY.sellRatio); // 840
    expect(buyShortfall(w, "sniper", open())).toBe(WEAPON_PRICES.sniper - refund - 800); // 1760
    // A grenade has nothing to refund.
    w.money = 100;
    expect(buyShortfall(w, "frag", open())).toBe(200);
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

/**
 * What a mode STOCKS, as opposed to when its shop is open. One rule for both ends: the buy menu
 * draws the shelf from it and the server sells from it, so a crafted message cannot buy what the
 * buttons do not offer.
 */
describe("the shelf a mode stocks", () => {
  const ctx = (mode: GameMode) => ({ now: 1000, spawnedAt: 0, phase: MatchPhase.Waiting, alive: true, nearStation: true, mode });
  it("keeps regeneration, resistance and the launcher out of Bomb and the 1 v 1", () => {
    for (const mode of ["bomb", "duel"] as const) {
      expect(modeAllowsItem(mode, "roids"), `${mode} regen`).toBe(false);
      expect(modeAllowsItem(mode, "flask"), `${mode} resist`).toBe(false);
      expect(modeAllowsItem(mode, "launcher"), `${mode} launcher`).toBe(false);
      // The things a duel IS made of stay on the shelf.
      for (const id of ["rifle", "sniper", "heavy", "light", "frag", "flash"] as const) {
        expect(modeAllowsItem(mode, id), `${mode} ${id}`).toBe(true);
      }
      // And the refusal reaches the buyer as its own reason, not as "closed".
      expect(canBuy({ ...freshWallet(), money: 9000 }, "roids", ctx(mode))).toEqual({ ok: false, reason: "mode" });
      expect(canBuy({ ...freshWallet(), money: 9000 }, "launcher", ctx(mode))).toEqual({ ok: false, reason: "mode" });
    }
  });

  it("leaves every other mode its whole catalogue", () => {
    for (const mode of ["tdm", "ffa", "dom", "boys", "ostrzyzeni"] as const) {
      expect(modeAllowsItem(mode, "roids"), mode).toBe(true);
      expect(modeAllowsItem(mode, "launcher"), mode).toBe(true);
    }
    // A caller with no mode at all (older call sites, tools) is not gated by this rule.
    expect(modeAllowsItem(undefined, "roids")).toBe(true);
  });
});

/**
 * The two CS modes pay the same way. This is the test that stops them drifting apart again: Bomb
 * and the 1 v 1 read one block (`cs.ts`), so a change to CS's table is a change to both.
 */
describe("Counter-Strike's economy, shared by Bomb and the 1 v 1", () => {
  it("is one set of numbers, not two", () => {
    expect(BOMB.startMoney).toBe(CS_ECONOMY.start);
    expect(BOMB.winMoney).toBe(CS_ECONOMY.win);
    expect(DUEL.economy.start).toBe(CS_ECONOMY.start);
    expect(DUEL.economy.win).toBe(CS_ECONOMY.win);
    expect(DUEL.economy.lossMax).toBe(CS_ECONOMY.lossMax);
    // One window, too: fifteen frozen and five more once the round is live.
    expect(BOMB.buyMs).toBe(CS_ROUND.freezeMs);
    expect(BOMB.buyTailMs).toBe(CS_ROUND.buyTailMs);
    expect(DUEL.prepMs).toBe(CS_ROUND.freezeMs);
    expect(DUEL.buyTailMs).toBe(CS_ROUND.buyTailMs);
    expect(CS_ROUND.freezeMs + CS_ROUND.buyTailMs, "mp_buytime, from the start of the round").toBe(20000);
  });

  it("climbs the loss ladder exactly as CS does and stops where CS stops", () => {
    expect(csLossBonus(0)).toBe(1400);
    expect(csLossBonus(1)).toBe(1900);
    expect(csLossBonus(2)).toBe(2400);
    expect(csLossBonus(3)).toBe(2900);
    expect(csLossBonus(4)).toBe(3400);
    expect(csLossBonus(5), "the ladder stops climbing").toBe(3400);
    expect(csLossBonus(99)).toBe(3400);
    expect(csLossBonus(-3), "a nonsense streak is the first rung").toBe(1400);
  });

  it("pays a kill by the weapon that made it", () => {
    expect(csKillReward("clippers")).toBe(1500);
    expect(csKillReward("shotgun")).toBe(900);
    expect(csKillReward("smg")).toBe(600);
    expect(csKillReward("sniper")).toBe(100);
    expect(csKillReward("rifle")).toBe(300);
    expect(csKillReward("")).toBe(CS_KILL_REWARD_DEFAULT);
  });
});
