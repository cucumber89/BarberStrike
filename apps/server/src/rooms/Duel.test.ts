import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DUEL, MAPS, MATCH, MatchPhase, S2C, duelSpawnSide } from "@frankibarber/shared";
import type { PlayerState } from "../schema";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * GÓRA's tournament pass — the 1 v 1 in the room. The round rule and the side swap are tested
 * pure in shared (`modes.test.ts`); here it is the room's side: two seats and no bot to fill the
 * second, the deterministic start on each side, the freeze-and-buy, one life a round, the score,
 * the swap, the match end and the rematch loop that follows it.
 */
let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

type Damage = { applyDamage(attacker: PlayerState, victimId: string, amount: number, headshot: boolean, client: undefined, weapon: string): void };
const GORA = MAPS.gora;
const start = (team: 0 | 1) => GORA.spawns.find((s) => s.team === team)!;

async function duel(opts: { bots?: number } = {}): Promise<{ a: FakeClient; b: FakeClient }> {
  h = await RoomHarness.create({ room: "duel-test", mode: "duel", map: "gora", bots: opts.bots ?? 0 });
  const a = await h.join("Alpha"), b = await h.join("Bravo");
  await h.until(MatchPhase.Prep);
  return { a, b };
}
const P = (c: FakeClient): PlayerState => h.player(c.sessionId);
function kill(killer: PlayerState, victim: PlayerState): void {
  victim.protectedUntil = 0;
  (h.room as unknown as Damage).applyDamage(killer, victim.id, 999, false, undefined, "rifle");
}

it("seats exactly two, refuses a third, and never fills a seat with a bot it was not asked for", async () => {
  const { a, b } = await duel();
  expect(h.room.metadata.slots).toBe(2);
  expect(h.room.metadata.bots).toBe(0);
  await expect(h.join("Charlie")).rejects.toThrow(/room full/);
  expect([P(a).team, P(b).team].sort()).toEqual([0, 1]);
  expect(h.room.handlerErrors).toBe(0);
});

it("clamps a bot request to one, so a practice duel is one human and one bot", async () => {
  h = await RoomHarness.create({ room: "duel-bot", mode: "duel", map: "gora", bots: 5 });
  expect(h.room.metadata.bots).toBe(1);
  expect(h.room.metadata.slots).toBe(1);
  const a = await h.join("Alpha");
  await expect(h.join("Bravo")).rejects.toThrow(/room full/);
  await h.until(MatchPhase.Prep);
  const bot = [...h.state.players.values()].find((p) => p.id !== a.sessionId)!;
  expect(bot.bot).toBe(true);
  expect(bot.team).not.toBe(P(a).team);
});

it("starts every round frozen with round money and both players on their side's first start", async () => {
  const { a, b } = await duel();
  expect(h.state.phase).toBe(MatchPhase.Prep);
  for (const c of [a, b]) {
    const p = P(c);
    expect(p.money).toBe(DUEL.roundMoney);
    expect(p.alive).toBe(true);
    const s = start(duelSpawnSide(p.team as 0 | 1, 1));
    expect([p.x, p.z]).toEqual([s.x, s.z]);
  }
  // The buy window is open in the freeze and shut when the round goes live.
  h.send(a, "buy", { item: "rifle" });
  await h.advance(50);
  expect(P(a).owned.includes("rifle")).toBe(true);
  await h.until(MatchPhase.Playing);
  h.send(b, "buy", { item: "rifle" });
  await h.advance(50);
  expect(P(b).owned.includes("rifle")).toBe(false);
  expect(h.room.handlerErrors).toBe(0);
});

it("scores a kill as a round, keeps the dead player down until the next round, then respawns both", async () => {
  const { a, b } = await duel();
  await h.until(MatchPhase.Playing);
  kill(P(a), P(b));
  expect(P(b).alive).toBe(false);
  await h.tick(2);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(h.state.bomb.round).toBe(1);
  expect(P(a).team === 0 ? h.state.scoreA : h.state.scoreB).toBe(1);
  // The break is a Prep too: nobody comes back in it.
  await h.advance(DUEL.breakMs - 100);
  expect(P(b).alive).toBe(false);
  await h.advance(300);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(P(b).alive).toBe(true);
  expect(P(b).money).toBe(DUEL.roundMoney);
  expect(P(a).health).toBe(100);
  expect(h.room.handlerErrors).toBe(0);
});

it("settles the clock on health and scores nothing on an even round", async () => {
  const { a, b } = await duel();
  await h.until(MatchPhase.Playing);
  P(b).protectedUntil = 0;
  (h.room as unknown as Damage).applyDamage(P(a), b.sessionId, 30, false, undefined, "pistol");
  await h.advance(DUEL.roundMs + 100);
  expect(h.state.bomb.round).toBe(1);
  expect(P(a).team === 0 ? h.state.scoreA : h.state.scoreB).toBe(1);
  expect(h.state.bomb.result).toContain("TIME");
  // Next round, nobody touches anybody: even health, no score.
  await h.until(MatchPhase.Playing);
  await h.advance(DUEL.roundMs + 100);
  expect(h.state.bomb.round).toBe(2);
  expect(h.state.scoreA + h.state.scoreB).toBe(1);
});

it("swaps the sides after halfRounds, first to wins ends it, and the room loops back for the rematch", async () => {
  const { a, b } = await duel();
  const first = duelSpawnSide(P(a).team as 0 | 1, 1);
  for (let round = 1; round <= DUEL.wins; round++) {
    await h.until(MatchPhase.Playing);
    kill(P(a), P(b));
    await h.tick(2);
    if (round < DUEL.wins) {
      expect(h.state.phase).toBe(MatchPhase.Prep);
      await h.advance(DUEL.breakMs + 100);
      // Where each player stands for the NEXT round follows the swap rule.
      const side = duelSpawnSide(P(a).team as 0 | 1, round + 1);
      expect([P(a).x, P(a).z]).toEqual([start(side).x, start(side).z]);
      if (round === DUEL.halfRounds) expect(side).not.toBe(first);
    }
  }
  expect(h.state.phase).toBe(MatchPhase.Ended);
  expect(h.state.winner).toBe(P(a).team);
  const ended = h.broadcastsOf(S2C.MatchEvent).map((m) => m.payload as { phase: string }).filter((m) => m.phase === MatchPhase.Ended);
  expect(ended.length).toBe(1);
  // The rematch: the result screen, Waiting, a countdown, and round 1 again with the score cleared.
  await h.advance(MATCH.endedMs + 100);
  expect(h.state.phase).toBe(MatchPhase.Countdown);
  await h.advance(MATCH.countdownMs + 100);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(h.state.scoreA + h.state.scoreB).toBe(0);
  expect(h.state.bomb.round).toBe(0);
  expect(h.room.handlerErrors).toBe(0);
});

it("ends the match on a walkover when the other player is gone for good", async () => {
  const { a, b } = await duel();
  await h.until(MatchPhase.Playing);
  kill(P(a), P(b));
  await h.tick(2);
  b.drop(1000);
  await h.tick(2);
  expect(h.state.phase).toBe(MatchPhase.Ended);
  expect(h.state.winner).toBe(P(a).team);
});
