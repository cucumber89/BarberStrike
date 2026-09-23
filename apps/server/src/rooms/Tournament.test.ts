import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DUEL, DUEL_MAP_ID, MatchPhase, TOURNAMENT, parseBracket } from "@frankibarber/shared";
import type { PlayerState } from "../schema";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * The 1 v 1 TOURNAMENT: one room, four or eight entrants, a bracket played one pair at a time.
 *
 * What makes it a tournament rather than a long duel is entirely in this file's assertions: only
 * two of the eight are on the map at once, a pair's win sends somebody up the bracket rather than
 * ending the evening, and the room survives people leaving in the middle of it.
 */
let h: RoomHarness;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

type Damage = { applyDamage(attacker: PlayerState, victimId: string, amount: number, headshot: boolean, client: undefined, weapon: string): void };
const P = (c: FakeClient): PlayerState => h.player(c.sessionId);
const kill = (killer: PlayerState, victim: PlayerState): void => {
  victim.protectedUntil = 0;
  (h.room as unknown as Damage).applyDamage(killer, victim.id, 999, false, undefined, "rifle");
};
/** Everybody in the room, dead or alive. */
const all = (): PlayerState[] => [...h.state.players.values()];
/** The two the room has put on the map this pair. */
const onBoard = (): PlayerState[] => all().filter((p) => p.alive);
const bracket = () => parseBracket(h.state.bracket)!;

async function tournament(n: number): Promise<FakeClient[]> {
  h = await RoomHarness.create({ room: "tour", mode: "turniej", bots: 0, seed: 7 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < n; i++) cs.push(await h.join(`GRACZ${i}`));
  await h.until(MatchPhase.Prep);
  return cs;
}

/** Play the pair on the board out until somebody takes it, the given side always winning. */
async function winPair(side: 0 | 1): Promise<void> {
  for (let round = 0; round < DUEL.wins + 2; round++) {
    const done = h.state.scoreA >= DUEL.wins || h.state.scoreB >= DUEL.wins;
    if (done) break;
    await h.until(MatchPhase.Playing);
    const live = onBoard();
    const winner = live.find((p) => p.team === side), loser = live.find((p) => p.team !== side);
    if (!winner || !loser) break;
    kill(winner, loser);
    await h.tick(3);
    await h.advance(DUEL.breakMs + 100);
  }
}

it("seats the whole draw, not two chairs, and puts only one pair on the map", async () => {
  const cs = await tournament(4);
  expect(h.room.metadata.slots, "a tournament room holds the bracket").toBe(TOURNAMENT.maxSize);
  expect(h.state.mapId, "and it is played on the duel arena").toBe(DUEL_MAP_ID);
  expect(all()).toHaveLength(4);

  // Two of the four are playing; the other two are in the room with nothing to do yet.
  expect(onBoard(), "one pair on the board").toHaveLength(2);
  expect(onBoard().map((p) => p.team).sort()).toEqual([0, 1]);
  expect(all().filter((p) => !p.alive), "the rest wait their turn").toHaveLength(2);
  expect(h.room.handlerErrors).toBe(0);
  void cs;
});

it("draws a bracket every client can read, and says which pair is on", async () => {
  await tournament(4);
  const b = bracket();
  expect(b.size).toBe(4);
  expect(b.matches, "two semi-finals and a final").toHaveLength(3);
  expect(b.at, "the first pair is up").toBe(0);
  // The two on the map are the two the bracket's first match names.
  const names = onBoard().map((p) => p.name).sort();
  expect([b.matches[0].a, b.matches[0].b].sort()).toEqual(names);
  // The final has nobody in it yet.
  expect(b.matches[2].a).toBe("");
  expect(b.matches[2].b).toBe("");
});

it("a pair's win sends somebody up the bracket instead of ending the evening", async () => {
  await tournament(4);
  const first = onBoard().map((p) => p.name).sort();
  await winPair(0);

  // The bracket moved on, the score was recorded, and the room did NOT end.
  const b = bracket();
  expect(b.at, "the second pair is up").toBe(1);
  expect(b.matches[0].winner).toBe("a");
  expect(b.matches[0].scoreA).toBe(DUEL.wins);
  expect(h.state.phase, "a bracket card, not a result screen").toBe(MatchPhase.Prep);
  expect(h.state.winnerId).toBe("");

  // Nobody is on the map while the bracket is up; then the OTHER two come on, with a fresh score.
  expect(onBoard(), "the board is clear between pairs").toHaveLength(0);
  await h.advance(TOURNAMENT.breakMs + 100);
  const second = onBoard().map((p) => p.name).sort();
  expect(second, "the two who have not played yet").not.toEqual(first);
  expect(second).toHaveLength(2);
  expect(h.state.scoreA).toBe(0);
  expect(h.state.scoreB).toBe(0);
  expect(h.room.handlerErrors).toBe(0);
});

it("plays the whole draw out and ends on one champion", async () => {
  await tournament(4);
  for (let pair = 0; pair < 3; pair++) {
    await winPair(0);
    if (h.state.phase === MatchPhase.Ended) break;
    await h.advance(TOURNAMENT.breakMs + 100);
  }
  expect(h.state.phase, "the final is over").toBe(MatchPhase.Ended);
  expect(h.state.winnerId, "a tournament is won by a person").not.toBe("");
  expect(h.state.winnerName).not.toBe("");
  const b = bracket();
  expect(b.at, "every pair played").toBe(3);
  expect(b.matches[2].winner, "and the final decided it").not.toBe("");
  // The champion is the name the final's winning side carries.
  const final = b.matches[2];
  expect(h.state.winnerName).toBe(final.winner === "a" ? final.a : final.b);
  expect(h.room.handlerErrors).toBe(0);
});

it("a walkover in the pair being played, and a strike-out anywhere else", async () => {
  const cs = await tournament(4);
  const playing = onBoard().map((p) => p.id);
  const waiting = all().filter((p) => !playing.includes(p.id)).map((p) => p.id);

  // Somebody who is waiting leaves: the bracket loses them and the pair on the board carries on.
  const waitingClient = cs.find((c) => c.sessionId === waiting[0])!;
  waitingClient.drop(1000);   // gone for good, not a blip: the grace has to expire
  await h.tick(2);
  expect(bracket().at, "the pair being played is untouched").toBe(0);
  expect(onBoard(), "and the two on the map are still on it").toHaveLength(2);

  // Then one of the two playing leaves: that is a walkover, and the bracket moves on.
  const playingClient = cs.find((c) => c.sessionId === playing[0])!;
  playingClient.drop(1000);
  await h.tick(2);
  expect(bracket().at, "the pair was decided without being played out").toBeGreaterThan(0);
  expect(h.room.handlerErrors).toBe(0);
});

it("does not judge a round by the people waiting their turn", async () => {
  // The bug this is written for: the round judge reads every player in the room, and six waiting
  // bodies are dead on both sides — so every round would be scored the instant it went live.
  await tournament(4);
  await h.until(MatchPhase.Playing);
  const before = { a: h.state.scoreA, b: h.state.scoreB };
  await h.advance(3000);
  expect({ a: h.state.scoreA, b: h.state.scoreB }, "nothing happened, so nothing was scored").toEqual(before);
  expect(onBoard(), "both of the pair are still up").toHaveLength(2);
});
