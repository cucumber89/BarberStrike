import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DUEL, MatchPhase } from "@frankibarber/shared";
import type { PlayerState } from "../schema";
import { RoomHarness, type FakeClient } from "./testHarness";
import { closeDb, useTestDb } from "../accounts/db";
import { createAccount } from "../accounts/store";
import { createSession } from "../accounts/session";

/**
 * Drop V (P3) — the tournament ARENA side of `TdmRoom`: the context-dependent reconnection grace, the
 * session→identity resolution, and the result the arena publishes back to the waiting room.
 *
 * These are the seams that make a `tdm mode="duel"` room a bracket arena when the lobby raises it with
 * a `tournamentId` — without touching the simulation tick, the damage model or the replicated schema.
 * The presence key and payload are pinned to EXACTLY what `TournamentLobbyRoom` subscribes to
 * (`tourn:<tournamentId>:<matchIndex>` = `{winner, scoreA, scoreB}`, winner = the entrant id).
 */
let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); closeDb(); });

type Damage = { applyDamage(attacker: PlayerState, victimId: string, amount: number, headshot: boolean, client: undefined, weapon: string): void };
const P = (c: FakeClient): PlayerState => h.player(c.sessionId);
const kill = (killer: PlayerState, victim: PlayerState): void => {
  victim.protectedUntil = 0;
  (h.room as unknown as Damage).applyDamage(killer, victim.id, 999, false, undefined, "rifle");
};
/** The private members P3 keeps (grace choice, identity map), reached the way the harness reaches in. */
interface ArenaPrivates { accountIds: Map<string, number>; arenaOfTournament: boolean; resultPublished: boolean }
const priv = (): ArenaPrivates => h.room as unknown as ArenaPrivates;

/** Play the pair out with `side` always winning, until the arena ends the match. */
async function winMatch(side: 0 | 1): Promise<void> {
  for (let round = 0; round < DUEL.wins + 2; round++) {
    if (h.state.phase === MatchPhase.Ended) break;
    await h.until(MatchPhase.Playing);
    const live = [...h.state.players.values()].filter((p) => p.alive);
    const winner = live.find((p) => p.team === side), loser = live.find((p) => p.team !== side);
    if (!winner || !loser) break;
    kill(winner, loser);
    await h.tick(3);
    if (h.state.phase !== MatchPhase.Ended) await h.advance(DUEL.breakMs + 100);
  }
}

it("gives a tournament arena the 60 s reconnection grace, not the TDM 15 s", async () => {
  // An arena is a `duel` raised with a tournamentId; the pair are the lobby's entrant ids.
  h = await RoomHarness.create({ room: "arena", mode: "duel", tournamentId: "lobbyX", matchIndex: 0, pair: ["ent-a", "ent-b"] });
  expect(priv().arenaOfTournament, "a tournamentId makes it an arena").toBe(true);
  const a = await h.join("Alpha"); await h.join("Bravo");
  await h.until(MatchPhase.Prep);

  a.drop(1006); // a network drop, not a consented leave — the grace applies
  await h.advance(200);
  expect(P(a).connected, "flagged offline for the grace").toBe(false);

  // At 16 s a plain TDM player would already be gone; a tournament arena still holds the seat.
  await h.advance(16_000);
  expect(h.state.players.has(a.sessionId), "still inside the 60 s grace at 16 s").toBe(true);

  // Past the full minute it is finally released.
  await h.advance(45_000);
  expect(h.state.players.has(a.sessionId), "released after 60 s").toBe(false);
});

it("keeps the plain TDM/duel grace at 15 s when there is no tournament context", async () => {
  h = await RoomHarness.create({ room: "plain", mode: "duel" });
  expect(priv().arenaOfTournament).toBe(false);
  const a = await h.join("Alpha"); await h.join("Bravo");
  await h.until(MatchPhase.Prep);
  a.drop(1006);
  await h.advance(200);
  expect(P(a).connected).toBe(false);
  await h.advance(16_000); // past 15 s: a plain duel releases the seat
  expect(h.state.players.has(a.sessionId), "a plain duel keeps the 15 s grace").toBe(false);
});

it("does not decide a result when a tournament-arena player leaves — the lobby times the walkover out", async () => {
  h = await RoomHarness.create({ room: "arena", mode: "duel", tournamentId: "lobbyY", matchIndex: 1, pair: ["ent-a", "ent-b"] });
  const published: unknown[] = [];
  await h.room.presence.subscribe("tourn:lobbyY:1", (d) => published.push(d));
  const a = await h.join("Alpha"); await h.join("Bravo");
  await h.until(MatchPhase.Playing);

  a.drop(1000); // gone for good (consented) — a plain duel would end here on a walkover
  await h.advance(200);
  // The arena must NOT end the match and must NOT publish: the waiting room owns the walkover (§5).
  expect(h.state.phase, "the arena does not end on a leave").not.toBe(MatchPhase.Ended);
  expect(priv().resultPublished, "nothing published on a leave").toBe(false);
  expect(published.length).toBe(0);
});

it("publishes the winner (an entrant id) and the score on the pair's presence topic when the match ends", async () => {
  h = await RoomHarness.create({ room: "arena", mode: "duel", tournamentId: "lobbyZ", matchIndex: 2, pair: ["ent-a", "ent-b"] });
  const got: { winner: string; scoreA: number; scoreB: number }[] = [];
  await h.room.presence.subscribe("tourn:lobbyZ:2", (d) => got.push(d as { winner: string; scoreA: number; scoreB: number }));
  const a = await h.join("Alpha"); const b = await h.join("Bravo");
  await h.until(MatchPhase.Prep);
  // Team 0 wins the match; team 0 is `pair[0]` = "ent-a".
  const zero = P(a).team === 0 ? a : b;
  await winMatch(0);
  expect(h.state.phase).toBe(MatchPhase.Ended);
  await h.tick(1);

  expect(got.length, "published exactly once").toBe(1);
  expect(got[0].winner, "the winner is the entrant id of team 0, not the arena session id").toBe("ent-a");
  expect(got[0].winner).not.toBe(zero.sessionId);
  expect(got[0].scoreA).toBe(DUEL.wins);
  expect(got[0].scoreB).toBe(0);
  expect(priv().resultPublished).toBe(true);
  expect(h.room.handlerErrors).toBe(0);
});

it("verifySession sets the account identity on join; a missing or bad token is a guest, no error", async () => {
  useTestDb();
  const accountId = createAccount("brzytwa", "scrypt$x$y");
  const token = createSession(accountId);

  h = await RoomHarness.create({ room: "arena", mode: "duel", tournamentId: "lobbyS", matchIndex: 0, pair: ["ent-a", "ent-b"] });
  const signed = await h.join("Alpha", { session: token });
  const guest = await h.join("Bravo", { session: "not-a-real-token" });

  expect(priv().accountIds.get(signed.sessionId), "a valid session names the account").toBe(accountId);
  expect(priv().accountIds.has(guest.sessionId), "an invalid token is a guest, silently").toBe(false);
  // A guest still joined and plays with no restriction (L1).
  expect(h.state.players.has(guest.sessionId)).toBe(true);
  expect(h.room.handlerErrors).toBe(0);
});
