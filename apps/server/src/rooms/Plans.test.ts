import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, S2C, MATCH, MatchPhase, PLANS, applyPlan, planOffer, NIGHT_DISTRICT, type PlanEvent } from "@frankibarber/shared";
import { RoomHarness } from "./testHarness";

/**
 * THE LIVING ARENA. The mechanic is only acceptable if the server decides everything and a client
 * can do nothing but name an index, so that is what these check.
 */

let h: RoomHarness;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { await h.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** S2C.Plan goes to everyone, so it lands in the harness's broadcast log, not a client's inbox. */
const plans = (): PlanEvent[] => h.broadcastsOf(S2C.Plan).map((m) => m.payload as PlanEvent);
const room = () => h.room as unknown as { world: { boxes: unknown[] }; planVotes: Map<string, number>; state: { planId: number } };

/**
 * Wind forward to a round that offers a vote, leaving the room inside its buy window. THROWS
 * rather than returning false: a test that quietly skipped itself would be worse than no test.
 */
async function reachPlanRound(max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    const r = h.state.bomb.round + 1;
    if (planOffer(r).length && h.state.phase === MatchPhase.Prep && h.state.bomb.stage === "buy") return;
    await h.advance(2000);
  }
  throw new Error(`no plan round reached in ${max} steps (round ${h.state.bomb.round}, phase ${h.state.phase})`);
}

/** Put this seat on the side that gets the vote, so the test does not depend on auto-balance. */
function makeAttacker(sessionId: string): void {
  h.state.players.get(sessionId)!.team = h.state.bomb.attackTeam;
}

describe("tactical plans", () => {
  it("offers a vote to both teams, and only the attackers may cast one", async () => {
    h = await RoomHarness.create({ room: "plan1", mode: "bomb", bots: 3 });
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    await reachPlanRound();
    makeAttacker(a.sessionId);
    const p = h.state.players.get(a.sessionId)!;
    const offer = planOffer(h.state.bomb.round + 1);
    // Both teams were told, which is what stops this being a surprise the defence cannot read.
    const announced = plans().at(-1);
    expect(announced?.options).toEqual(offer);
    expect(announced?.chosen).toBe(0);

    expect(p.team).toBe(h.state.bomb.attackTeam);
    h.send(a, C2S.Vote, { plan: offer[0] });
    await h.advance(30);
    expect(room().planVotes.get(a.sessionId), "an attacker's vote must be taken").toBe(offer[0]);
    // And the same seat on the other side must not be able to vote at all.
    room().planVotes.clear();
    h.state.players.get(a.sessionId)!.team = (h.state.bomb.attackTeam === 0 ? 1 : 0);
    h.send(a, C2S.Vote, { plan: offer[1] });
    await h.advance(30);
    expect(room().planVotes.size, "a defender must not be able to vote").toBe(0);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("takes nothing from a client but an index into a table it cannot change", async () => {
    h = await RoomHarness.create({ room: "plan2", mode: "bomb", bots: 3 });
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    await reachPlanRound();
    for (const bad of [null, 3, "1", { plan: "1" }, { plan: 1.5 }, { plan: -1 }, { plan: 99 },
                       { plan: 0 }, { removes: ["roller_door"] }, { plan: { id: 1 } }]) {
      h.send(a, C2S.Vote, bad);
    }
    await h.advance(50);
    // Not one of those is a legal vote; none may be recorded and none may crash a handler.
    expect(room().planVotes.size).toBe(0);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("applies the winning plan when the freeze lifts, and reverts it next round", async () => {
    h = await RoomHarness.create({ room: "plan3", mode: "bomb", bots: 3 });
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    await reachPlanRound();
    makeAttacker(a.sessionId);
    const offer = planOffer(h.state.bomb.round + 1);
    const want = offer[1];
    const before = room().world.boxes.length;
    h.send(a, C2S.Vote, { plan: want });
    await h.advance(30);
    // Nothing has moved yet: the world changes when the round starts, not when a vote lands.
    expect(room().world.boxes.length).toBe(before);
    expect(h.state.planId).toBe(0);

    for (let i = 0; i < 30 && h.state.phase !== MatchPhase.Playing; i++) await h.advance(1000);
    expect(h.state.planId).toBe(want);
    const expected = applyPlan(NIGHT_DISTRICT.solids, want).length;
    expect(room().world.boxes.length, "the server's own collision world must match the plan").toBe(expected);
    expect(expected).toBeLessThan(before);
    // Everyone was told the result.
    expect(plans().at(-1)).toMatchObject({ chosen: want });

    // One round only: the map both teams learned comes back.
    for (let i = 0; i < 200 && h.state.planId !== 0; i++) await h.advance(1000);
    expect(h.state.planId).toBe(0);
    expect(room().world.boxes.length).toBe(before);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("changes nothing in a round nobody voted in", async () => {
    h = await RoomHarness.create({ room: "plan4", mode: "bomb", bots: 3 });
    await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    const before = room().world.boxes.length;
    for (let i = 0; i < 40; i++) {
      await h.advance(2000);
      // Bots do not vote, so the world must stay exactly as it was, round after round.
      expect(h.state.planId).toBe(0);
    }
    expect(room().world.boxes.length).toBe(before);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("has no plans at all outside bomb mode", async () => {
    h = await RoomHarness.create({ room: "plan5", mode: "tdm", bots: 2 });
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 500);
    h.send(a, C2S.Vote, { plan: PLANS[0].id });
    await h.advance(50);
    expect(h.state.planId).toBe(0);
    expect(plans()).toEqual([]);
    expect(h.room.handlerErrors).toBe(0);
  });
});
