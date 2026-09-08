import { describe, expect, it } from "vitest";
import { BOYS_CLASSES, BOYS, boysAllows, isBoysClass, boysHealRate, boysMedicGoal } from "./boys";
import { applyBuy, canSell, freshWallet, WEAPON_PRICES } from "./economy";
import { MatchPhase } from "./types";

describe("The Boys economy", () => {
  it("validates the five roles and their exclusive gear", () => {
    for (const bad of [0, 6, 1.5, "1", NaN, null]) expect(isBoysClass(bad)).toBe(false);
    for (const id of BOYS_CLASSES) expect(boysAllows(id, BOYS[id].starter)).toBe(true);
    expect(boysAllows(4, "launcher")).toBe(false);
    expect(boysAllows(3, "lmg")).toBe(true);
  });
  it("never refunds a free primary when selling or upgrading", () => {
    const w = freshWallet(); w.money = 9000; w.owned.push("smg");
    const ctx = { boysClass: 1, now: 0, spawnedAt: 0, phase: MatchPhase.Playing, alive: true, nearStation: true };
    expect(canSell(w, "smg", ctx).ok).toBe(false);
    expect(applyBuy(w, "smg2", ctx)).toMatchObject({ ok: true, refund: 0 });
    expect(w.money).toBe(9000 - WEAPON_PRICES.smg2);
    const paid = w.money;
    expect(applyBuy(w, "smg", ctx)).toMatchObject({ ok: true, cost: 0, refund: 0 });
    expect(w.money).toBe(paid);
    expect(canSell(w, "smg", ctx).ok).toBe(false);
    const before = structuredClone(w);
    expect(applyBuy(w, "launcher", ctx).ok).toBe(false);
    expect(w).toEqual(before);
  });
});

describe("support roles", () => {
  it("keeps healing useful in combat without matching safe recovery", () => {
    expect(boysHealRate(0)).toBe(6);
    expect(boysHealRate(2999)).toBe(6);
    expect(boysHealRate(3000)).toBe(10);
  });
  it("medics prefer a hurt ally and ignore healthy, distant, dead and enemy targets", () => {
    const me = { id: "medic", boysClass: 4, team: 0, alive: true, connected: true, health: 100, x: 0, y: 0, z: 0 };
    const hurt = { ...me, id: "hurt", boysClass: 3, x: 5, health: 60 };
    const invalid = [me, { ...hurt, id: "enemy", team: 1 }, { ...hurt, id: "dead", alive: false }, { ...hurt, id: "far", x: 30 }, { ...hurt, id: "healthy", health: 150 }, { ...hurt, id: "gone", connected: false }];
    expect(boysMedicGoal(me, invalid)).toBeUndefined();
    expect(boysMedicGoal(me, [...invalid, hurt])).toBe(hurt);
    expect(boysMedicGoal({ ...me, boysClass: 1 }, [hurt])).toBeUndefined();
  });
});
