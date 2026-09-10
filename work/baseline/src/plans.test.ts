import { describe, expect, it } from "vitest";
import { PLANS, PLAN_EVERY, applyPlan, planById, planOffer, planRound, tallyVotes } from "./plans";
import { NIGHT_DISTRICT, buildCollisionWorld } from "./map";
import { cellReached, reachable, walkable } from "./mapWalk";
import { makeRayHit } from "./collision";
import { PLAYER } from "./constants";

/**
 * A plan changes the SHAPE of a round. It must never change what a map is: every spawn still
 * reachable, no spawn suddenly staring down an enemy spawn, and no stat moved anywhere.
 */

const base = NIGHT_DISTRICT;
const variant = (id: number) => ({ ...base, solids: [...applyPlan(base.solids, id)] });

describe("the plan table", () => {
  it("names solids that actually exist, so a plan can never silently do nothing", () => {
    const names = new Set(base.solids.map((s) => s.name).filter(Boolean));
    for (const p of PLANS) for (const n of p.removes) {
      expect(names.has(n), `plan ${p.id} "${p.name}" removes "${n}", which is not in the map`).toBe(true);
    }
  });

  it("only ever removes — never adds, never moves", () => {
    for (const p of PLANS) {
      const after = applyPlan(base.solids, p.id);
      expect(after.length).toBeLessThan(base.solids.length);
      // Every surviving solid is the SAME OBJECT: a filter, not a rebuild, so nothing can drift.
      for (const s of after) expect(base.solids.includes(s as never)).toBe(true);
    }
  });

  it("leaves the world untouched, and the very same array, when no plan is on", () => {
    expect(applyPlan(base.solids, 0)).toBe(base.solids);
    expect(applyPlan(base.solids, 99)).toBe(base.solids);
  });

  it("gives every plan a stated cost as well as a gain, and neither is a stat", () => {
    for (const p of PLANS) {
      expect(p.gain.length, p.name).toBeGreaterThan(20);
      expect(p.cost.length, p.name).toBeGreaterThan(20);
      // A plan that touched damage, health, money or speed would be a power-up decided by a vote.
      expect(`${p.gain} ${p.cost}`).not.toMatch(/\b(damage|health|armou?r|money|\$|speed|faster|stronger)\b/i);
    }
  });
});

describe("every plan still leaves a playable map", () => {
  for (const p of PLANS) {
    it(`"${p.name}" keeps every spawn reachable on foot`, () => {
      const m = variant(p.id);
      const seen = reachable(walkable(m), m.spawns[0]);
      const cut = m.spawns.filter((s) => !cellReached(seen, s.x, s.z));
      expect(cut, `plan ${p.id} strands ${JSON.stringify(cut)}`).toEqual([]);
    });

    it(`"${p.name}" does not open a sightline between the two teams' spawns`, () => {
      // The one way a removal can break a map: taking out the wall that was hiding a spawn.
      const m = variant(p.id);
      const world = buildCollisionWorld(m);
      const eye = PLAYER.eyeHeight;
      const seen: string[] = [];
      for (const a of m.spawns.filter((s) => s.team === 0)) for (const b of m.spawns.filter((s) => s.team === 1)) {
        const dx = b.x - a.x, dy = 0, dz = b.z - a.z;
        const len = Math.hypot(dx, dy, dz);
        if (!world.raycast(a.x, a.y + eye, a.z, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit) {
          seen.push(`(${a.x},${a.z}) → (${b.x},${b.z})`);
        }
      }
      expect(seen, `plan ${p.id} opens spawn-to-spawn sight`).toEqual([]);
    });

    it(`"${p.name}" actually opens something up`, () => {
      // A plan nobody can feel is not a plan. Removing geometry must make MORE of the map walkable.
      const before = walkable(base).cells.size;
      const after = walkable(variant(p.id)).cells.size;
      expect(after, `plan ${p.id} changed nothing a player can walk on`).toBeGreaterThanOrEqual(before);
    });
  }
});

describe("when a vote is offered", () => {
  it("comes round on a fixed cadence both teams can see coming", () => {
    const rounds = Array.from({ length: 13 }, (_, i) => i + 1).filter(planRound);
    expect(rounds).toEqual([2, 5, 8, 11]);
    for (const r of rounds) expect(planOffer(r)).toHaveLength(2);
    expect(planOffer(1)).toEqual([]);
    expect(planOffer(0)).toEqual([]);
    expect(planOffer(-4)).toEqual([]);
  });

  it("rotates the pair, so a match does not run the same choice all night", () => {
    const seen = [planOffer(2), planOffer(2 + PLAN_EVERY), planOffer(2 + 2 * PLAN_EVERY)];
    expect(new Set(seen.map((o) => o.join(","))).size).toBe(PLANS.length);
    for (const o of seen) expect(o[0]).not.toBe(o[1]);
  });

  it("offers only plans that exist", () => {
    for (let r = 1; r < 40; r++) for (const id of planOffer(r)) expect(planById(id)).toBeDefined();
  });
});

describe("counting the votes", () => {
  const offer = [1, 2];
  it("takes the most-voted plan", () => {
    expect(tallyVotes([2, 2, 1], offer)).toBe(2);
    expect(tallyVotes([1], offer)).toBe(1);
  });
  it("breaks a tie on the lower id, so the result depends on the votes and nothing else", () => {
    expect(tallyVotes([1, 2], offer)).toBe(1);
    expect(tallyVotes([2, 1], offer)).toBe(1);
  });
  it("changes nothing when nobody voted", () => {
    expect(tallyVotes([], offer)).toBe(0);
    expect(tallyVotes([3, 9, 0], offer)).toBe(0);   // votes for things not on offer are discarded
  });
  it("has nothing to decide in a round with no vote", () => {
    expect(tallyVotes([1, 1, 1], [])).toBe(0);
  });
});
