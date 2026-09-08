import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAIRCUT, HAIRCUTS, MAX_SHAVES, SHAVE_STAGES,
  encodeHaircut, haircutDef, haircutLook, isHaircutId, isShave, newHaircuts,
  ownedHaircuts, parseHaircut, resetShaves, shaveOnce, worstHaircut,
} from "./haircuts";
import { emptyLifetime, type LifetimeStats } from "./progression";
import { MELEE, isBackstab } from "./weapons";

const life = (o: Partial<LifetimeStats> = {}): LifetimeStats => ({ ...emptyLifetime(), ...o });

describe("the shave rule", () => {
  it("is a clippers kill from behind and nothing else", () => {
    expect(isShave("clippers", true)).toBe(true);
    // The same swing to the face is a kill, not a shave: the humiliation is being caught out.
    expect(isShave("clippers", false)).toBe(false);
    // No other weapon shaves, from any angle.
    for (const w of ["pistol", "rifle", "sniper", "shotgun", "launcher", "frag"]) {
      expect(isShave(w, true)).toBe(false);
      expect(isShave(w, false)).toBe(false);
    }
  });

  it("agrees with the geometry the melee swing already runs", () => {
    // Victim facing +Z (yaw 0). The attacker's position decides it, exactly as `swing` asks.
    const behind = isBackstab(0, 0, -2, 0, 0);   // attacker to the south, victim looking north
    const infront = isBackstab(0, 0, 2, 0, 0);
    const side = isBackstab(0, 2, 0, 0, 0);
    expect(isShave("clippers", behind)).toBe(true);
    expect(isShave("clippers", infront)).toBe(false);
    expect(isShave("clippers", side)).toBe(false);
    // And the damage the room applies on that same flag is still the one-hit kill.
    expect(MELEE.backstabDamage).toBe(100);
  });
});

describe("the one field", () => {
  it("round-trips an id and a count", () => {
    expect(encodeHaircut("buzz", 0)).toBe("buzz");
    expect(encodeHaircut("buzz", 3)).toBe("buzz#3");
    expect(parseHaircut("buzz#3")).toEqual({ id: "buzz", shaves: 3 });
    expect(parseHaircut("buzz")).toEqual({ id: "buzz", shaves: 0 });
  });

  it("reads anything at all without throwing, defaulting to the cap", () => {
    for (const v of ["", undefined, null, "#", "#4", "nonsense", "nonsense#2", "buzz#", "buzz#-9", "buzz#x", "b#u#z#z"]) {
      const s = parseHaircut(v as string);
      expect(HAIRCUTS.some((h) => h.id === s.id) || s.id === DEFAULT_HAIRCUT).toBe(true);
      expect(s.shaves).toBeGreaterThanOrEqual(0);
    }
    // An id the client made up is dropped, but a real count beside it survives.
    expect(parseHaircut("nonsense#2")).toEqual({ id: DEFAULT_HAIRCUT, shaves: 2 });
    expect(isHaircutId("nonsense")).toBe(false);
    expect(isHaircutId("buzz")).toBe(true);
  });

  it("keeps the equipped look through a shave and gives it back on reset", () => {
    let v = encodeHaircut("pompadour", 0);
    v = shaveOnce(v); v = shaveOnce(v);
    expect(parseHaircut(v)).toEqual({ id: "pompadour", shaves: 2 });
    // The match ends; the player still owns the haircut they chose.
    expect(resetShaves(v)).toBe("pompadour");
  });

  it("clamps the count instead of overflowing the field", () => {
    let v = encodeHaircut("buzz", MAX_SHAVES);
    v = shaveOnce(v);
    expect(parseHaircut(v).shaves).toBe(MAX_SHAVES);
  });
});

describe("what gets drawn", () => {
  it("shows the equipped haircut until the first shave, then the stages in order", () => {
    expect(haircutLook("pompadour").id).toBe("pompadour");
    expect(haircutLook("pompadour#1").id).toBe(SHAVE_STAGES[0].id);
    expect(haircutLook("pompadour#2").id).toBe(SHAVE_STAGES[1].id);
    expect(haircutLook("pompadour#4").id).toBe(SHAVE_STAGES[3].id);
    // Saturates: a fifth shave cannot make a head worse than ruined.
    expect(haircutLook("pompadour#9").id).toBe(SHAVE_STAGES[SHAVE_STAGES.length - 1].id);
  });

  it("makes every shave stage read as damage, and none of them as a haircut somebody chose", () => {
    for (const s of SHAVE_STAGES) {
      // A track mown through the crown is what "bad" is; every stage has one, and it widens.
      expect(s.style.track).toBeGreaterThan(0);
      expect(s.style.cap).toBe(false);
      expect(s.unlockedBy(life({ matches: 999, kills: 999, shaves: 999 }))).toBe(false);
    }
    for (let i = 1; i < SHAVE_STAGES.length; i++) {
      expect(SHAVE_STAGES[i].style.track).toBeGreaterThan(SHAVE_STAGES[i - 1].style.track);
      expect(SHAVE_STAGES[i].style.sides).toBeLessThanOrEqual(SHAVE_STAGES[i - 1].style.sides);
    }
    // The default look is the cap, and it is the only one wearing it.
    expect(haircutDef(DEFAULT_HAIRCUT).style.cap).toBe(true);
    expect(HAIRCUTS.filter((h) => h.style.cap)).toHaveLength(1);
  });
});

describe("the catalog is cosmetic only (L1)", () => {
  it("gives a brand-new player a look and never nothing", () => {
    const owned = ownedHaircuts(emptyLifetime());
    expect(owned.map((h) => h.id)).toEqual([DEFAULT_HAIRCUT]);
    expect(HAIRCUTS.every((h) => h.id && h.name && h.requirement)).toBe(true);
    expect(new Set(HAIRCUTS.map((h) => h.id)).size).toBe(HAIRCUTS.length);
  });

  it("unlocks on lifetime counters alone — no level, no money, no ownership", () => {
    // Every requirement is reachable, and nothing unlocks that the counters do not justify.
    const everything = life({ matches: 999, kills: 999, headshots: 999, assists: 999, wins: 999, shaves: 999 });
    expect(ownedHaircuts(everything)).toHaveLength(HAIRCUTS.length);
    const after = life({ matches: 1 });
    expect(newHaircuts(emptyLifetime(), after)).toEqual(["buzz"]);
    expect(newHaircuts(after, after)).toEqual([]);
  });

  it("carries no number a fight could read", () => {
    // The style is geometry and a tone. If a stat ever appears here, this test is the alarm.
    const keys = new Set<string>();
    for (const h of [...HAIRCUTS, ...SHAVE_STAGES]) for (const k of Object.keys(h.style)) keys.add(k);
    expect([...keys].sort()).toEqual(["cap", "crown", "fringe", "sides", "tone", "track", "tuft"]);
  });
});

describe("Najgorsza fryzura", () => {
  const row = (id: string, haircut: string) => ({ id, name: id.toUpperCase(), haircut });

  it("is nobody when nobody was shaved", () => {
    expect(worstHaircut([row("a", "buzz"), row("b", ""), row("c", "pompadour")])).toBeNull();
    expect(worstHaircut([])).toBeNull();
  });

  it("names the most-shaved player and what they are wearing", () => {
    const w = worstHaircut([row("a", "buzz#1"), row("b", "pompadour#4"), row("c", "cap#2")]);
    expect(w).toMatchObject({ id: "b", name: "B", shaves: 4 });
    expect(w!.look.id).toBe(SHAVE_STAGES[3].id);
  });

  it("ranks by the count, not by the drawn stage, so ruined players still have an order", () => {
    const w = worstHaircut([row("a", "buzz#5"), row("b", "buzz#12")]);
    expect(w!.id).toBe("b");
    expect(haircutLook("buzz#5").id).toBe(haircutLook("buzz#12").id); // same picture, different rank
  });

  it("breaks ties the same way on every client", () => {
    const rows = [row("zed", "buzz#3"), row("abe", "buzz#3"), row("mid", "buzz#3")];
    expect(worstHaircut(rows)!.id).toBe("abe");
    expect(worstHaircut([...rows].reverse())!.id).toBe("abe");
  });
});
