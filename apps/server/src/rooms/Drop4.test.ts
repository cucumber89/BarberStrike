import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Btn, C2S, S2C, DOM, ECONOMY, LEAN, MATCH, MODES, MatchPhase, PLAYER, TAC, packInput,
  type FlagEvent, type MatchEventMessage, type MoneyEvent, type PlayerInput,
} from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/** Drop 4: FFA and Domination rooms, lean-aware origin checks, tactical sprint through the room. */

let h: RoomHarness;

beforeEach(() => { vi.useFakeTimers(); });

afterEach(async () => {
  await h.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const input = (seq: number, dt: number, buttons = 0, yaw = 0): PlayerInput => ({ seq, dt, buttons, yaw, pitch: 0 });

async function pair(mode: string): Promise<{ a: FakeClient; b: FakeClient }> {
  h = await RoomHarness.create({ room: `drop4-${mode}`, mode });
  const a = await h.join("Alpha");
  const b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  await h.settle();
  return { a, b };
}

/** Runs `ticks` inputs with `buttons` from an open spawn and returns the distance covered. */
async function sprintDistance(c: FakeClient, buttons: number, ticks: number, seq0 = 1): Promise<number> {
  const sp = h.openRun();
  await h.place(c.sessionId, sp);
  const s = h.session(c.sessionId);
  const x0 = s.body.x, z0 = s.body.z;
  for (let i = 0; i < ticks; i++) {
    h.send(c, C2S.Input, [packInput(input(seq0 + i, 16, buttons, sp.yaw))]);
    await h.tick();
  }
  return Math.hypot(s.body.x - x0, s.body.z - z0);
}

describe("free for all", () => {
  it("puts everyone on one side, lets anyone hurt anyone and crowns the top killer", async () => {
    const { a, b } = await pair("ffa");
    expect(h.room.metadata.mode).toBe("ffa");
    expect(h.state.mode).toBe("ffa");
    expect(h.player(a.sessionId).team).toBe(0);
    expect(h.player(b.sessionId).team).toBe(0);
    await h.arm(a, "rifle");
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(h.player(b.sessionId).health).toBeLessThan(PLAYER.maxHealth); // same team number, still an enemy
    // One kill short of the limit: the next kill ends the match with Alpha named the winner.
    h.player(a.sessionId).kills = MODES.ffa.scoreLimit - 1;
    h.player(b.sessionId).health = 5;
    await h.advance(200);
    h.send(a, C2S.Fire, { seq: 2, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(h.player(a.sessionId).kills).toBe(MODES.ffa.scoreLimit);
    expect(h.state.scoreA).toBe(0); // no team score in FFA
    expect(h.state.phase).toBe(MatchPhase.Ended);
    expect(h.state.winnerId).toBe(a.sessionId);
    expect(h.state.winnerName).toBe("Alpha");
    const ended = h.broadcastsOf(S2C.MatchEvent).map((m) => m.payload as MatchEventMessage).find((m) => m.phase === MatchPhase.Ended);
    expect(ended).toMatchObject({ winner: -1, winnerId: a.sessionId, winnerName: "Alpha" });
  });

  it("spawns newcomers away from everyone alive, whichever side the points belong to", async () => {
    const { a, b } = await pair("ffa");
    // Alpha and Bravo on the south pavement: the whole pool is in play, so every newcomer lands far from both.
    const south = h.map.spawns.filter((s) => s.team === 0);
    await h.place(a.sessionId, south[0]);
    await h.place(b.sessionId, south[3]);
    // One newcomer while the map is otherwise empty: every top candidate is ≥ 34 m from both (the
    // distance score caps at 40 m and ties are drawn at random, so a hard "north" assertion is wrong —
    // and a fourth or fifth body makes the pool tight enough that 18 m is not guaranteed either).
    const c = await h.join("Ghost");
    const p = h.player(c.sessionId);
    for (const q of [h.player(a.sessionId), h.player(b.sessionId)]) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(25);
  });
});

describe("domination", () => {
  it("captures by standing in the zone, pays the capturers and ticks the score", async () => {
    const { a, b } = await pair("dom");
    expect(h.state.flags.length).toBe(3);
    expect(h.state.flags.map((f) => f.id)).toEqual(["A", "B", "C"]);
    expect(h.player(a.sessionId).team).toBe(0);
    expect(h.player(b.sessionId).team).toBe(1);
    const flagA = h.map.flags[0];
    const moneyBefore = h.player(a.sessionId).money;
    await h.place(a.sessionId, { x: flagA.x, y: flagA.y, z: flagA.z, yaw: 0, team: 0 });
    await h.advance(DOM.captureMs / 2);
    expect(h.state.flags[0].owner).toBe(-1);
    expect(h.state.flags[0].capTeam).toBe(0);
    expect(h.state.flags[0].cap).toBeGreaterThan(0.3);
    await h.advance(DOM.captureMs / 2 + 100);
    expect(h.state.flags[0].owner).toBe(0);
    const ev = h.broadcastsOf(S2C.Flag).at(-1)?.payload as FlagEvent;
    expect(ev).toEqual({ flag: 0, team: 0, by: ["Alpha"] });
    expect(h.player(a.sessionId).money).toBe(moneyBefore + DOM.captureReward);
    expect((h.sentOf(a, S2C.Money).at(-1)?.payload as MoneyEvent).reason).toBe("capture");
    expect(h.player(a.sessionId).score).toBe(DOM.captureScore);
    // Held flag: one point per tick.
    const scoreBefore = h.state.scoreA;
    await h.advance(DOM.tickMs * 2 + 50);
    expect(h.state.scoreA).toBeGreaterThanOrEqual(scoreBefore + 1);
    expect(h.state.scoreB).toBe(0);
    // A kill does not move the team score in Domination.
    await h.arm(a, "rifle");
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    const sA = h.state.scoreA;
    h.player(b.sessionId).health = 5;
    h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(h.player(a.sessionId).kills).toBe(1);
    expect(h.state.scoreA).toBe(sA);
  });

  it("freezes a contested flag, lets the enemy take it once the owner leaves and ends on the score limit", async () => {
    const { a, b } = await pair("dom");
    const flagC = h.map.flags[2];
    const at = { x: flagC.x, y: flagC.y, z: flagC.z, yaw: 0, team: 0 as const };
    await h.place(a.sessionId, at);
    await h.advance(DOM.captureMs + 100);
    expect(h.state.flags[2].owner).toBe(0);
    await h.place(b.sessionId, { ...at, x: at.x + 1 });
    await h.advance(DOM.captureMs);
    expect(h.state.flags[2].owner).toBe(0);      // both inside: nothing moves
    expect(h.state.flags[2].contested).toBe(true);
    expect(h.state.flags[2].cap).toBe(0);
    await h.place(a.sessionId, h.map.spawns[0]);  // Alpha walks off
    await h.advance(DOM.captureMs + 100);
    expect(h.state.flags[2].owner).toBe(1);
    expect(h.state.flags[2].contested).toBe(false);
    // Score limit: the team holding the flag crosses it on the next tick.
    h.state.scoreB = DOM.scoreLimit - 1;
    await h.advance(DOM.tickMs + 50);
    expect(h.state.phase).toBe(MatchPhase.Ended);
    expect(h.state.winner).toBe(1);
  });
});

describe("lean and tactical sprint", () => {
  it("rejects a shot from inside a wall and accepts a leaned origin", async () => {
    const { a, b } = await pair("tdm");
    await h.arm(a, "rifle");
    // Inside the shop, one metre from the front wall (z 0..0.3), looking south at it.
    await h.place(a.sessionId, { x: 0, y: 0, z: 1.3, yaw: Math.PI, team: 0 });
    const shots = () => h.broadcastsOf(S2C.Shot).length;
    const n0 = shots();
    h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o: [0, PLAYER.eyeHeight, 0.15], d: [0, 0, -1], t: h.now() });
    await h.tick();
    expect(shots()).toBe(n0); // origin inside the wall: dropped
    await h.advance(200);
    // Lean right while facing south: right is -X. The origin moves with the lean and is accepted.
    h.send(a, C2S.Input, [packInput(input(1, 16, Btn.LeanR, Math.PI))]);
    await h.tick();
    expect(h.player(a.sessionId).lean).toBe(1);
    const s = h.session(a.sessionId);
    h.send(a, C2S.Fire, { seq: 2, weapon: "rifle", o: [s.body.x - LEAN.offset, s.body.y + PLAYER.eyeHeight - LEAN.drop, s.body.z], d: [0, 0, -1], t: h.now() });
    await h.tick();
    expect(shots()).toBe(n0 + 1);
    expect(h.room.handlerErrors).toBe(0);
    void b;
  });

  it("runs faster on a tactical sprint until the budget runs out; the pose is replicated", async () => {
    const { a } = await pair("tdm");
    const plain = await sprintDistance(a, Btn.Forward | Btn.Sprint, 60, 1);
    await h.advance(TAC.budgetMs); // let the budget refill fully
    const tac = await sprintDistance(a, Btn.Forward | Btn.Sprint | Btn.Tac, 60, 1000);
    expect(tac / plain).toBeGreaterThan(1.1);
    expect(tac / plain).toBeLessThan(1.3);
    expect(h.player(a.sessionId).tac).toBe(true);
    // Draining the whole budget: the last ticks are plain-sprint speed and `tac` reads false.
    await sprintDistance(a, Btn.Forward | Btn.Sprint | Btn.Tac, 300, 2000);
    expect(h.session(a.sessionId).body.tac).toBe(0);
    expect(h.player(a.sessionId).tac).toBe(false);
  });

  it("ignores button bits outside the mask", async () => {
    const { a } = await pair("tdm");
    h.send(a, C2S.Input, [packInput(input(1, 16, 1 << 14 | Btn.LeanL, 0))]);
    await h.tick();
    expect(h.player(a.sessionId).lean).toBe(-1);
    expect(h.room.handlerErrors).toBe(0);
    expect(ECONOMY.startMoney).toBeGreaterThan(0);
  });
});
