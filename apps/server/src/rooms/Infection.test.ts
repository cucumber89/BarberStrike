/**
 * Drop D — Ostrzyżeni in the room. The conversion rule and the round winner are tested pure in
 * shared (`modes.ts`); here it is the room's side: one random chaser per round with the clippers
 * and the speed perk, a clippers kill that changes sides, survivors who stay down until the round
 * ends, the two ways a round can end, and the shop that only the unshaved may open.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { C2S, MODES, MatchPhase, NIGHT_DISTRICT, OSTRZYZENI, PERK_ARMED_MS, S2C } from "@frankibarber/shared";
import type { PlayerState } from "../schema";
import { RoomHarness, type FakeClient } from "./testHarness";

let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

type Damage = { applyDamage(attacker: PlayerState, victimId: string, amount: number, headshot: boolean, client: undefined, weapon: string): void };

/** A room in the buy window of round 1, with `n` players. */
async function round(n = 3): Promise<FakeClient[]> {
  h = await RoomHarness.create({ room: "infection-test", mode: "ostrzyzeni", bots: 0 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < n; i++) cs.push(await h.join(`P${i}`));
  await h.until(MatchPhase.Prep);
  return cs;
}
const shaved = (): PlayerState[] => [...h.state.players.values()].filter((p) => p.shaved);
const survivors = (): PlayerState[] => [...h.state.players.values()].filter((p) => !p.shaved);
/** A kill made with `weapon`, straight into the damage path (spawn protection is lifted first). */
function killWith(killer: PlayerState, victim: PlayerState, weapon: string): void {
  victim.protectedUntil = 0;
  (h.room as unknown as Damage).applyDamage(killer, victim.id, 999, false, undefined, weapon);
}
/** Past the buy window and into the live round. */
async function live(): Promise<void> { await h.until(MatchPhase.Playing); }

it("(a) a round starts with exactly one Ostrzyżony: clippers, the speed perk, no money; everyone else is a survivor with round money", async () => {
  await round();
  expect(shaved()).toHaveLength(1);
  const chaser = shaved()[0];
  expect(chaser.team).toBe(OSTRZYZENI.shavedTeam);
  expect(chaser.weapon).toBe("clippers");
  expect([...chaser.owned]).toEqual([]);
  expect(chaser.money).toBe(0);
  expect(chaser.perks.get(OSTRZYZENI.speedPerk)).toBe(PERK_ARMED_MS);
  expect(chaser.alive).toBe(true);
  for (const s of survivors()) {
    expect(s.team).toBe(OSTRZYZENI.survivorTeam);
    expect(s.shaved).toBe(false);
    expect(s.money).toBe(OSTRZYZENI.roundMoney);
    expect(s.alive).toBe(true);
  }
});

it("(b) a clippers kill shaves the victim onto the chasers' side, pays the killer a bonus over a plain kill, and the convert comes back shaved on the short timer", async () => {
  // Four players: two heads for the chaser and one left unshaved, so the round is still running
  // when the convert's respawn timer comes due.
  await round(4);
  await live();
  const chaser = shaved()[0];
  // Two kills by the same chaser: one that only kills, one that converts. The difference between
  // what they pay is the conversion bonus — measured, so the plain kill award can move without
  // this test lying about which part is the mode's.
  const [plainVictim, converted] = survivors();
  const s0 = chaser.score;
  killWith(chaser, plainVictim, "fire");
  const plainAward = chaser.score - s0;
  const s1 = chaser.score;
  killWith(chaser, converted, "clippers");
  expect(chaser.score - s1).toBe(plainAward + OSTRZYZENI.convertScore);
  expect(converted.shaved).toBe(true);
  expect(converted.team).toBe(OSTRZYZENI.shavedTeam);
  expect(converted.weapon).toBe("clippers");
  expect(converted.money).toBe(0);
  expect(converted.perks.get(OSTRZYZENI.speedPerk)).toBe(PERK_ARMED_MS);
  expect(plainVictim.shaved).toBe(false);
  await h.advance(OSTRZYZENI.shavedRespawnMs + 200);
  expect(converted.alive).toBe(true);
  expect(converted.shaved).toBe(true);
  expect(converted.weapon).toBe("clippers");
});

it("(c) a survivor killed by anything but the clippers stays a survivor and stays down until the round ends", async () => {
  await round();
  await live();
  const chaser = shaved()[0], victim = survivors()[0];
  killWith(chaser, victim, "fire");
  expect(victim.shaved).toBe(false);
  expect(victim.alive).toBe(false);
  await h.advance(OSTRZYZENI.shavedRespawnMs * 3);
  expect(victim.alive).toBe(false); // no respawn inside the round for the unshaved
});

it("(d) converting the last unshaved head ends the round for the chasers, and the next round reshuffles to exactly one", async () => {
  const cs = await round(3);
  await live();
  const chaser = shaved()[0];
  for (const s of [...survivors()]) killWith(chaser, s, "clippers");
  await h.tick(2);
  expect(h.state.scoreB).toBe(1);
  expect(h.state.scoreA).toBe(0);
  expect(h.state.phase).toBe(MatchPhase.Prep);
  await h.until(MatchPhase.Prep, 1000); // already there; the break runs next
  await h.advance(OSTRZYZENI.breakMs + 200);
  expect(shaved()).toHaveLength(1);
  expect(survivors()).toHaveLength(cs.length - 1);
  for (const s of survivors()) expect(s.alive).toBe(true);
});

it("(e) the clock running out with an unshaved head still standing gives the round to the survivors, and pays them for it", async () => {
  await round(3);
  await live();
  const before = survivors().map((p) => p.score);
  await h.advance(OSTRZYZENI.roundMs + 200);
  expect(h.state.scoreA).toBe(1);
  expect(h.state.scoreB).toBe(0);
  const after = [...h.state.players.values()].filter((p) => !p.shaved).map((p) => p.score);
  expect(after.every((v, i) => v >= before[i] + OSTRZYZENI.surviveScore)).toBe(true);
});

it("(f) the shop is the survivors' alone: a chaser's buy is refused, a survivor's buy in the buy window goes through", async () => {
  const cs = await round(3);
  const chaserId = shaved()[0].id;
  const chaser = cs.find((c) => c.sessionId === chaserId)!;
  const survivor = cs.find((c) => c.sessionId !== chaserId)!;
  h.broadcasts.length = 0;
  h.send(chaser, C2S.Buy, { item: "rifle" });
  h.send(survivor, C2S.Buy, { item: "smg" });
  await h.tick();
  const shopOf = (c: FakeClient) => h.sentOf(c, S2C.Shop).pop()?.payload as { ok: boolean; reason?: string } | undefined;
  expect(shopOf(chaser)?.ok).toBe(false);
  expect(shopOf(chaser)?.reason).toBe("shaved");
  expect(shopOf(survivor)?.ok).toBe(true);
  expect(h.player(survivor.sessionId).weapon).toBe("smg");
  expect(MODES.ostrzyzeni.shop).toBe("survivors");
});

it("(g) somebody who joins while a round is running joins the chasers", async () => {
  await round(2);
  await live();
  const late = await h.join("Late");
  await h.tick(2);
  const p = h.player(late.sessionId);
  expect(p.shaved).toBe(true);
  expect(p.team).toBe(OSTRZYZENI.shavedTeam);
});

it("(h) the match is over after the mode's rounds, and the result names the top score", async () => {
  const cs = await round(3);
  // Survivors who all outlast every round end level, and a dead heat has no winner by design —
  // so one of them is given a head start, which is what the result screen is supposed to read.
  const star = h.player(cs[0].sessionId);
  star.score += 10_000;
  for (let i = 0; i < OSTRZYZENI.rounds; i++) {
    if (h.state.phase === MatchPhase.Ended) break;
    await h.until(MatchPhase.Playing, 30000);
    await h.advance(OSTRZYZENI.roundMs + 200);   // the survivors run the clock out every round
    if (h.state.phase === MatchPhase.Prep) await h.advance(OSTRZYZENI.breakMs + 200);
  }
  expect(h.state.bomb.round).toBe(OSTRZYZENI.rounds);
  expect(h.state.phase).toBe(MatchPhase.Ended);
  expect(h.state.scoreA).toBe(OSTRZYZENI.rounds);
  const top = [...h.state.players.values()].sort((a, b) => b.score - a.score)[0];
  expect(top.id).toBe(star.id);
  expect(h.state.winnerId).toBe(star.id);
  expect(h.state.winnerName).toBe(star.name);
});

it("(i) bots play both sides: one can be the Ostrzyżony with the clippers, the rest survivors who bought", async () => {
  h = await RoomHarness.create({ room: "infection-bots", mode: "ostrzyzeni", bots: 3, seed: 3 });
  await h.join("Human");
  await h.until(MatchPhase.Prep);
  const bots = [...h.state.players.values()].filter((p) => p.bot);
  expect(bots).toHaveLength(3);
  expect(shaved()).toHaveLength(1);
  for (const b of bots) {
    if (b.shaved) { expect(b.weapon).toBe("clippers"); expect(b.money).toBe(0); expect(b.perks.get(OSTRZYZENI.speedPerk)).toBe(PERK_ARMED_MS); }
    else expect(b.money).toBeLessThanOrEqual(OSTRZYZENI.roundMoney); // a survivor bot may have spent it
  }
  // The round runs with bots thinking on both sides: no crash, still exactly one side per player.
  await h.until(MatchPhase.Playing);
  await h.advance(5000);
  for (const p of h.state.players.values()) expect(p.team).toBe(p.shaved ? OSTRZYZENI.shavedTeam : OSTRZYZENI.survivorTeam);
});

it("(j) a bot chaser actually converts: it swings the clippers at a survivor within reach", async () => {
  h = await RoomHarness.create({ room: "infection-swing", mode: "ostrzyzeni", bots: 2, seed: 11 });
  const human = await h.join("Human");
  await h.until(MatchPhase.Playing, 60000);
  // Force the roles rather than trusting the random pick: the thing under test is whether a BOT
  // with the clippers can close a swing on somebody, not which player the RNG shaved this time.
  const priv = h.room as unknown as { shave(p: PlayerState, s: unknown): void; unshave(p: PlayerState): void };
  const bot = [...h.state.players.values()].find((p) => p.bot)!;
  const prey = h.player(human.sessionId);
  for (const p of h.state.players.values()) if (p.shaved) priv.unshave(p);
  priv.shave(bot, h.session(bot.id));
  expect(bot.weapon).toBe("clippers");
  const sp = NIGHT_DISTRICT.spawns[0];
  for (let t = 0; t < 60 && !prey.shaved; t++) {
    // Hold the pair together at a spawn point: navigation has its own tests, this is the swing.
    await h.place(prey.id, { ...sp });
    await h.place(bot.id, { ...sp, x: sp.x + 1.4, z: sp.z });
    prey.protectedUntil = 0;
    await h.tick(6);
  }
  expect(prey.shaved, "a bot chaser should convert a survivor standing within the clippers' reach").toBe(true);
  expect(prey.team).toBe(OSTRZYZENI.shavedTeam);
});
