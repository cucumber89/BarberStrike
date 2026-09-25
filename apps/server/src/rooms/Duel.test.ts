import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DUEL, DUEL_MAP_ID, MAPS, MATCH, MatchPhase, S2C, duelSpawnSide } from "@frankibarber/shared";
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

it("is played on the arena built for it, whatever the lobby asked for", async () => {
  // GÓRA has been the duel arena since it was built, and nothing pinned the mode to it: a room
  // created from the lobby carried whatever map was selected there, and the default is the 100 m
  // night district — two people, one life, sixty seconds, and a quarter of a kilometre of streets
  // to find each other in.
  h = await RoomHarness.create({ room: "duel-map", mode: "duel", map: "night_district", bots: 0 });
  expect(h.state.mapId).toBe(DUEL_MAP_ID);
  expect(h.room.metadata.map).toBe(DUEL_MAP_ID);
  await h.join("Alpha"); await h.join("Bravo");
  await h.until(MatchPhase.Prep);
  for (const p of h.state.players.values()) {
    expect(GORA.spawns.some((sp) => sp.team === p.team && sp.x === p.x && sp.z === p.z),
      `a duellist must start on one of GÓRA's own spawns, not (${p.x}, ${p.z})`).toBe(true);
  }
  // And the other modes still take the lobby's word.
  await h.dispose();
  h = await RoomHarness.create({ room: "tdm-map", mode: "tdm", map: "night_district", bots: 0 });
  expect(h.state.mapId).toBe("night_district");
});

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
  // One human seat and the bot in the other: `slots` is the room's BODIES, which is what the
  // browser divides its (bot-inclusive) player count by, so a practice duel reads 1 / 2 empty and
  // 2 / 2 once somebody is in it.
  expect(h.room.metadata.slots).toBe(2);
  const a = await h.join("Alpha");
  await expect(h.join("Bravo")).rejects.toThrow(/room full/);
  await h.until(MatchPhase.Prep);
  const bot = [...h.state.players.values()].find((p) => p.id !== a.sessionId)!;
  expect(bot.bot).toBe(true);
  expect(bot.team).not.toBe(P(a).team);
});

it("opens with the pistol round: CS money, both players on their side's first start", async () => {
  const { a, b } = await duel();
  expect(h.state.phase).toBe(MatchPhase.Prep);
  for (const c of [a, b]) {
    const p = P(c);
    // The first round of a half is the pistol round; the floor does not apply to it.
    expect(p.money).toBe(DUEL.economy.start);
    expect(p.alive).toBe(true);
    const s = start(duelSpawnSide(p.team as 0 | 1, 1));
    expect([p.x, p.z]).toEqual([s.x, s.z]);
  }
  // $800 buys a sidearm and not a rifle, exactly as it does in CS.
  h.send(a, "buy", { item: "rifle" });
  h.send(a, "buy", { item: "revolver" });
  await h.advance(50);
  expect(P(a).owned.includes("rifle"), "a rifle is out of reach on pistol money").toBe(false);
  expect(P(a).owned.includes("revolver")).toBe(true);
  expect(h.room.handlerErrors).toBe(0);
});

it("keeps the shop open for CS's buy time: the whole freeze and a few seconds into the round", async () => {
  const { a, b } = await duel();
  // The freeze is long enough to be worth calling one: fifteen seconds, not four.
  expect(DUEL.prepMs).toBeGreaterThanOrEqual(15000);
  expect(h.state.phaseEndsAt - h.now()).toBeGreaterThan(DUEL.prepMs - 500);
  P(a).money = 9000; P(b).money = 9000;
  h.send(a, "buy", { item: "rifle" });
  await h.advance(50);
  expect(P(a).owned.includes("rifle"), "buying in the freeze").toBe(true);

  await h.until(MatchPhase.Playing);
  // ...and still open a moment after the round goes live (mp_buytime past mp_freezetime).
  await h.advance(DUEL.buyTailMs - 1500);
  h.send(b, "buy", { item: "rifle" });
  await h.advance(50);
  expect(P(b).owned.includes("rifle"), "the tail after the release").toBe(true);

  // Then it shuts, and stays shut for the rest of the round.
  await h.advance(2000);
  h.send(b, "buy", { item: "heavy" });
  await h.advance(50);
  expect(P(b).armor, "the tail has run out").toBe(0);
  expect(h.room.handlerErrors).toBe(0);
});

it("pays like CS: the round award, the loss ladder, kill money by weapon, and the winner keeps the gun", async () => {
  const { a, b } = await duel();
  P(a).money = 6000; P(b).money = 6000;
  h.send(a, "buy", { item: "rifle" });
  h.send(a, "buy", { item: "heavy" });
  await h.advance(50);
  const spent = P(a).money;
  await h.until(MatchPhase.Playing);
  kill(P(a), P(b));
  await h.tick(2);
  // A rifle kill is $300, winning the round is $3250, and the loser gets the ladder's first rung.
  expect(P(a).money).toBe(spent + 300 + DUEL.economy.win);
  expect(P(b).money).toBe(6000 + DUEL.economy.lossBase);

  // Next round: the survivor still has the rifle and the plate, the casualty is back on the pistol.
  await h.advance(DUEL.breakMs + 100);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(P(a).owned.includes("rifle"), "the survivor keeps what they carried").toBe(true);
  expect(P(a).armor, "and the plate with it").toBeGreaterThan(0);
  expect(P(b).owned.includes("rifle"), "the casualty lost theirs").toBe(false);
  expect(h.room.handlerErrors).toBe(0);
});

it("never leaves a duellist below the floor, and resets both purses at the swap", async () => {
  const { a, b } = await duel();
  // Lose the first round broke: the ladder plus the floor decide what round two can afford.
  P(a).money = 0; P(b).money = 0;
  await h.until(MatchPhase.Playing);
  kill(P(a), P(b));
  await h.tick(2);
  await h.advance(DUEL.breakMs + 100);
  expect(P(b).money, "the floor, not the ladder, is what a duellist actually starts with").toBe(DUEL.economy.floor);
  expect(P(a).money).toBeGreaterThanOrEqual(DUEL.economy.floor);

  // Play out the rest of the half; the first round of the next one is a pistol round again.
  for (let round = 2; round <= DUEL.halfRounds; round++) {
    await h.until(MatchPhase.Playing);
    kill(P(a), P(b));
    await h.tick(2);
    await h.advance(DUEL.breakMs + 100);
  }
  expect(h.state.bomb.round).toBe(DUEL.halfRounds);
  for (const c of [a, b]) expect(P(c).money, "the swap resets the economy").toBe(DUEL.economy.start);
  expect(P(a).owned.includes("rifle"), "and nobody carries a gun across it").toBe(false);
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
  expect(P(b).money, "the loser's ladder, raised to the floor").toBe(DUEL.economy.floor);
  expect(P(a).health).toBe(100);
  expect(h.room.handlerErrors).toBe(0);
});

it("bomb.result is empty through the freeze and holds the reason through the break", async () => {
  // Drop U's break signal, with no new field: the freeze and the break are both a Prep, and a client
  // that joins or reconnects in one has only the replicated state to tell them apart.
  const { a, b } = await duel();
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(h.state.bomb.result, "round 1's freeze").toBe("");
  await h.until(MatchPhase.Playing);
  expect(h.state.bomb.result, "a live round").toBe("");
  kill(P(a), P(b));
  await h.tick(2);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(h.state.bomb.result, "the break names the round's reason").toBe("ELIMINATED");
  await h.advance(DUEL.breakMs - 200);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(P(b).alive, "still the break").toBe(false);
  expect(h.state.bomb.result, "for the whole break").toBe("ELIMINATED");
  // The same phase, the next window: round 2's freeze, and only `result` says which.
  await h.advance(400);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(P(b).alive, "the freeze has respawned both").toBe(true);
  expect(h.state.bomb.result, "round 2's freeze").toBe("");
  await h.advance(DUEL.prepMs - 1000);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(h.state.bomb.result, "for the whole freeze").toBe("");
  // A trade is a round too: its break says so rather than reading as a freeze.
  await h.until(MatchPhase.Playing);
  kill(P(a), P(b)); kill(P(b), P(a));
  await h.tick(2);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  expect(h.state.bomb.result).toBe("TRADE");
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

it("stocks a Counter-Strike shelf: no regeneration, no resistance, no launcher", async () => {
  // A CS player's objection, and a fair one: a duel where one side heals 6 HP/s or takes 20 % less
  // damage is not a duel. The rule is shared with the buy menu (`modeAllowsItem`), but it is the
  // SERVER that has to refuse it — the menu only decides which buttons exist.
  const { a } = await duel();
  P(a).money = 9000;
  for (const item of ["roids", "flask", "energy", "fade", "launcher"]) {
    h.send(a, "buy", { item });
    await h.advance(30);
    const answer = h.sentOf(a, S2C.Shop).at(-1)?.payload as { ok: boolean; item: string; reason?: string };
    expect(answer.ok, `${item} must not be for sale in a duel`).toBe(false);
    expect(answer.reason).toBe("mode");
  }
  expect(P(a).money, "and nothing was taken for any of them").toBe(9000);
  // What a duel IS made of is still on the shelf.
  h.send(a, "buy", { item: "rifle" });
  h.send(a, "buy", { item: "heavy" });
  h.send(a, "buy", { item: "flash" });
  await h.advance(50);
  expect(P(a).owned.includes("rifle")).toBe(true);
  expect(P(a).armor).toBeGreaterThan(0);
  expect(P(a).tacticalCount).toBeGreaterThan(0);
  expect(h.room.handlerErrors).toBe(0);
});
