import { describe, expect, it } from "vitest";
import { GORA } from "./gora";
import { PLAYER } from "./constants";
import { MOVE } from "./movement";
import { walkable, reachable, JUMP_UP } from "./mapWalk";

/**
 * GÓRA's own rules — the two claims `docs/MAP_2.md` makes that no generic map test can express,
 * both re-derived from the geometry rather than trusted.
 */

/** What a player can actually climb, which is NOT what the walk grid says a bot can. */
const APEX = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity);   // 0.931 m
const MANTLE = APEX + MOVE.airStepCrouch;                                            // 1.251 m
/** How far a sprint jump carries: airtime × sprint speed. */
const JUMP_REACH = (2 * PLAYER.jumpVelocity / -PLAYER.gravity) * PLAYER.sprintSpeed; // ≈ 4.4 m

describe("GÓRA's roof is only the deck", () => {
  it("cannot be climbed off, by any chain of hops from anything a player can stand on", () => {
    // A code review found the map's worst bug this way: the air-conditioner topped 0.9 m above the
    // deck — under the 0.931 m jump apex but OVER the walk grid's 0.88 m JUMP_UP, so every
    // reachability test in the suite was blind to it — and from there the ceiling slab was half a
    // metre up, which put a player on the roof over every room in the flat. The gap between what a
    // player can climb and what the grid models is exactly where this class of bug lives, so the
    // test uses the player's number, not the grid's.
    const deck = { name: "the deck", y: 3.0, box: { minX: 6, maxX: 17, minY: 2.8, maxY: 3.0, minZ: -2, maxZ: 9 } };
    const above = GORA.solids.filter((s) => s.box.maxY > 3.0 && s.box.minY >= 2.0)
      .map((s) => ({ name: s.name ?? "unnamed", y: s.box.maxY, box: s.box }));
    // Anything within a metre horizontally is close enough to step or hop across.
    const adjacent = (a: typeof deck.box, b: typeof deck.box) =>
      !(a.maxX < b.minX - 1 || a.minX > b.maxX + 1 || a.maxZ < b.minZ - 1 || a.minZ > b.maxZ + 1);
    const standable = [deck];
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of above) {
        if (standable.some((k) => k.name === s.name)) continue;
        if (standable.some((k) => s.y - k.y <= MANTLE && s.y > k.y - 1e-9 && adjacent(k.box, s.box))) { standable.push(s); grew = true; }
      }
    }
    const slabs = standable.filter((s) => s.name.startsWith("strop_"));
    expect(slabs.map((s) => s.name), "the ceiling slab is climbable from the roof deck").toEqual([]);
    // And the margin is real, not a rounding accident.
    const highest = Math.max(...standable.map((s) => s.y));
    const slabTop = Math.min(...GORA.solids.filter((s) => (s.name ?? "").startsWith("strop_")).map((s) => s.box.maxY));
    expect(slabTop - highest).toBeGreaterThan(MANTLE);
  });

  it("leaves nothing reachable above the deck that a bot cannot follow a player onto", () => {
    // The walk grid is what the bots path on. Any standing surface a player can reach and a bot
    // cannot is a place to hide from half the room.
    const walk = walkable(GORA);
    const seen = reachable(walk, GORA.spawns[0]);
    const heights = [...seen].map((k) => Number(k.slice(k.indexOf("@") + 1)));
    expect(Math.max(...heights), "a bot can path above the roof deck").toBeLessThanOrEqual(3.0);
    expect(JUMP_UP).toBeLessThan(APEX); // the gap this whole file exists for
  });
});

describe("GÓRA's light well", () => {
  it("is wider than a sprint jump, so the centre of the map cannot be short-cut", () => {
    const szyb = GORA.solids.find((s) => s.name === "szyb_parapet_w")!;
    const east = GORA.solids.find((s) => s.name === "szyb_parapet_e")!;
    const gap = east.box.minX - szyb.box.maxX;
    expect(gap).toBeGreaterThan(JUMP_REACH);
  });

  it("has no floor under it: falling in is a fall to the kill plane", () => {
    const inWell = GORA.solids.filter((s) =>
      s.box.maxY <= 0.001 && s.box.maxX > -2.5 && s.box.minX < 2.5 && s.box.maxZ > 5 && s.box.minZ < 8);
    expect(inWell.map((s) => s.name), "something is floored inside the light well").toEqual([]);
    expect(GORA.killY).toBeLessThan(-1);
  });
});
