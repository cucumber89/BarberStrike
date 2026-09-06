import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BOMB, BOMB_SITES, C2S, MATCH, MatchPhase } from "@frankibarber/shared";
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
it("starts with pistol-round money and closes shopping when combat begins", async () => {
  h = await RoomHarness.create({ room: "bomb-economy", mode: "bomb", bots: 0 });
  const a = await h.join("Alpha"); await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  expect(h.state.bomb.stage).toBe("buy");
  const p = h.player(a.sessionId); expect(p.money).toBe(800);
  h.send(a, C2S.Buy, { item: "revolver" }); expect(p.money).toBe(200);
  expect([...p.owned]).toContain("revolver");
  await h.until(MatchPhase.Playing);
  p.money = 9000; h.send(a, C2S.Buy, { item: "rifle" });
  expect(p.money).toBe(9000); expect([...p.owned]).not.toContain("rifle");
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
  h.player(b.sessionId).alive = false; await h.tick(); await h.advance(BOMB.breakMs + 100);
  expect(h.state.bomb.round).toBe(7); expect(h.state.bomb.attackTeam).toBe(1); expect(h.state.bomb.stage).toBe("buy");
  expect(h.player(a.sessionId).money).toBe(800); expect([...h.player(a.sessionId).owned]).toEqual(["pistol"]);
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
