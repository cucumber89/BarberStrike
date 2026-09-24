import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BOMB, BOMB_SITES, C2S, MATCH, MatchPhase, TICK_MS, bombBreakMs } from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";
let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });
async function match() {
  h = await RoomHarness.create({ room: "bomb-test", mode: "bomb", bots: 0 });
  const a = await h.join("Alpha"), b = await h.join("Bravo"), c = await h.join("Charlie");
  await h.advance(MATCH.countdownMs + BOMB.buyMs + 200); return { a, b, c };
}
async function hold(c: FakeClient, ms: number) {
  for (let t = 0; t < ms; t += 100) { h.send(c, "objective", true); await h.advance(100); }
}
it("starts with pistol-round money and buys on Counter-Strike's clock", async () => {
  h = await RoomHarness.create({ room: "bomb-economy", mode: "bomb", bots: 0 });
  const a = await h.join("Alpha"); await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  expect(h.state.bomb.stage).toBe("buy");
  const p = h.player(a.sessionId); expect(p.money).toBe(800);
  h.send(a, C2S.Buy, { item: "revolver" }); expect(p.money).toBe(200);
  expect([...p.owned]).toContain("revolver");
  // The freeze is CS's fifteen seconds, not thirty.
  expect(BOMB.buyMs).toBe(15000);
  await h.until(MatchPhase.Playing);
  // ...and buying runs a few seconds past the release, the way `mp_buytime` runs past
  // `mp_freezetime`: leaving spawn without armour is a mistake you can still fix.
  p.money = 9000;
  await h.advance(BOMB.buyTailMs - 2000);
  h.send(a, C2S.Buy, { item: "rifle" }); await h.advance(20);
  expect([...p.owned], "the buy tail is open").toContain("rifle");
  // Then it shuts for the rest of the round.
  await h.advance(2500);
  const before = p.money;
  h.send(a, C2S.Buy, { item: "heavy" }); await h.advance(20);
  expect(p.money, "past the tail nothing is sold").toBe(before);
  expect(p.armor).toBe(0);
  expect(p.protectedUntil).toBe(0);
});
it("loses dead players' equipment, retains survivors' guns and pays escalating losses", async () => {
  const { a, b, c } = await match();
  const dead = h.player(a.sessionId), survivor = h.player(c.sessionId), enemy = h.player(b.sessionId);
  dead.owned.push("rifle"); survivor.owned.push("smg");
  (h.room as unknown as { applyDamage(p: typeof enemy, id: string, n: number, head: boolean, client: undefined): void }).applyDamage(enemy, dead.id, 999, false, undefined);
  expect([...dead.owned]).toEqual(["pistol"]); expect(dead.alive).toBe(false);
  enemy.alive = false; await h.tick();
  expect(enemy.money).toBe(800 + 300 + 1400); // kill reward plus first loss
  await h.advance(BOMB.breakMs + 100);
  expect([...survivor.owned]).toContain("smg");
  await h.until(MatchPhase.Playing); enemy.alive = false; await h.tick();
  expect(enemy.money).toBe(800 + 300 + 1400 + 1900);
});
it("switches attack and resets money and equipment at halftime", async () => {
  const { a, b } = await match(); h.state.bomb.round = BOMB.halfRounds;
  h.player(a.sessionId).owned.push("rifle"); h.player(a.sessionId).money = 12000;
  h.player(b.sessionId).alive = false; await h.tick(); await h.advance(bombBreakMs(BOMB.halfRounds) + 100);
  expect(h.state.bomb.round).toBe(7); expect(h.state.bomb.attackTeam).toBe(1); expect(h.state.bomb.stage).toBe("buy");
  expect(h.player(a.sessionId).money).toBe(800); expect([...h.player(a.sessionId).owned]).toEqual(["pistol"]);
});
it("the break after round BOMB.halfRounds lasts BOMB.halftimeMs", async () => {
  const { b } = await match();
  /** Kill the lone defender and wait tick by tick for the next freeze; how long did the break run? */
  const breakAfter = async (round: number): Promise<number> => {
    h.player(b.sessionId).alive = false; await h.tick();
    expect(h.state.phase).toBe(MatchPhase.Prep);
    expect(h.state.bomb.stage).toBe("resolved");
    expect(h.state.bomb.round).toBe(round);
    const left = h.state.phaseEndsAt - h.now();
    expect(left, "the break is armed on the round-end tick").toBeGreaterThan(bombBreakMs(round) - TICK_MS - 1);
    expect(left).toBeLessThanOrEqual(bombBreakMs(round));
    const ended = h.state.phaseEndsAt - bombBreakMs(round);
    while (h.state.bomb.round === round) await h.tick();
    expect(h.state.bomb.stage, "the break ends in the next round's freeze").toBe("buy");
    return h.now() - ended;
  };
  // An ordinary round: the plain break, and round 2 is on the board within a tick of it ending.
  const plain = await breakAfter(1);
  expect(plain).toBeGreaterThanOrEqual(BOMB.breakMs);
  expect(plain).toBeLessThanOrEqual(BOMB.breakMs + 2 * TICK_MS);
  // The half: the same kill, three times as long a break.
  await h.until(MatchPhase.Playing);
  h.state.bomb.round = BOMB.halfRounds;
  const half = await breakAfter(BOMB.halfRounds);
  expect(half).toBeGreaterThanOrEqual(BOMB.halftimeMs);
  expect(half).toBeLessThanOrEqual(BOMB.halftimeMs + 2 * TICK_MS);
  expect(h.state.bomb.round).toBe(BOMB.halfRounds + 1);
  expect(h.state.bomb.attackTeam, "and the sides have swapped").toBe(1);
  expect(h.room.handlerErrors).toBe(0);
});
it("keeps casualties dead until a round ends, preserves sides and adds a buy phase", async () => {
  const { a, b } = await match(); const deadline = h.state.matchEndsAt;
  h.player(a.sessionId).alive = false; h.session(a.sessionId).respawnAt = h.now() + 3000;
  await h.advance(3500); expect(h.player(a.sessionId).alive).toBe(false); expect(h.state.phase).toBe(MatchPhase.Playing);
  h.player(b.sessionId).alive = false; await h.tick();
  expect(h.state.phase).toBe(MatchPhase.Prep); expect(h.state.scoreA).toBe(1);
  await h.advance(BOMB.breakMs + 100);
  expect(h.state.phase).toBe(MatchPhase.Prep); expect(h.state.bomb.stage).toBe("buy");
  await h.advance(BOMB.buyMs + 100);
  expect(h.state.phase).toBe(MatchPhase.Playing); expect(h.player(a.sessionId).alive).toBe(true);
  expect(h.state.bomb.attackTeam).toBe(0); expect(h.state.bomb.round).toBe(2); expect(h.state.matchEndsAt).toBe(deadline);
});
it("plants and defuses through actual network handlers, cancelling a stale hold", async () => {
  const { a, b } = await match(); const site = BOMB_SITES[0];
  await h.place(a.sessionId, { ...site, yaw: 0, team: 0 });
  await h.advance(300);
  h.send(a, "objective", true); await h.advance(700);
  expect(h.state.bomb.progress).toBe(0); expect(h.state.bomb.stage).toBe("carried");
  await hold(a, BOMB.plantMs + 300); expect(h.state.bomb.stage).toBe("planted");
  await h.place(b.sessionId, { ...site, x: site.x + 0.8, yaw: 0, team: 1 });
  await hold(b, BOMB.defuseMs + 300);
  expect(h.state.bomb.result).toBe("BOMB DEFUSED"); expect(h.state.scoreB).toBe(1);
});
it("holds a mid-round join until the next round", async () => {
  await match(); const late = await h.join("Late");
  expect(h.player(late.sessionId).alive).toBe(false);
  await h.advance(5000); expect(h.player(late.sessionId).alive).toBe(false);
});
it("lets the bot carrier plant using the same timed objective rules", async () => {
  h = await RoomHarness.create({ room: "bomb-bot", mode: "bomb", bots: 1, seed: 7 });
  await h.join("Defender"); await h.advance(MATCH.countdownMs + BOMB.buyMs + 200);
  const id = h.state.bomb.carrier;
  expect(h.player(id).bot).toBe(true);
  await h.place(id, { ...BOMB_SITES[1], team: 0, yaw: Math.PI });
  await h.advance(3800);
  expect(h.state.bomb.stage).toBe("planted");
});
