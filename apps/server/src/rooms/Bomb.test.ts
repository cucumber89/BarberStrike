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
  const { a, b, c } = await match(); const site = BOMB_SITES[0];
  // 2.2: the charge goes to a RANDOM attacker, so hold with whoever got it.
  const carrier = h.state.bomb.carrier === a.sessionId ? a : c;
  await h.place(carrier.sessionId, { ...site, yaw: 0, team: 0 });
  await h.advance(300);
  h.send(carrier, "objective", true); await h.advance(700);
  expect(h.state.bomb.progress).toBe(0); expect(h.state.bomb.stage).toBe("carried");
  await hold(carrier, BOMB.plantMs + 300); expect(h.state.bomb.stage).toBe("planted");
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
it("2.2: the carrier can hand the charge over, and cannot scoop it straight back", async () => {
  const { a, b, c } = await match();
  const carrier = h.state.bomb.carrier;
  const other = [a, c].find((x) => x.sessionId !== carrier)!;
  const holder = [a, c].find((x) => x.sessionId === carrier)!;
  await h.place(carrier, { x: 0, y: 0, z: 30, yaw: 0, team: 0 });
  await h.place(other.sessionId, { x: 0, y: 0, z: 36, yaw: Math.PI, team: 0 });
  h.send(b, C2S.DropBomb, {}); await h.tick();
  expect(h.state.bomb.stage, "a defender holds nothing to drop").toBe("carried");
  h.send(holder, C2S.DropBomb, {}); await h.tick();
  expect(h.state.bomb.stage).toBe("dropped");
  expect(h.state.bomb.droppedBy).toBe(carrier);
  await h.advance(200);
  expect(h.state.bomb.stage, "the dropper stands on it and may not take it back yet").toBe("dropped");
  await h.place(other.sessionId, { x: h.state.bomb.x, y: 0, z: h.state.bomb.z, yaw: 0, team: 0 });
  await h.advance(150);
  expect(h.state.bomb.stage).toBe("carried");
  expect(h.state.bomb.carrier).toBe(other.sessionId);
});
it("2.2: a defuse kit is a defender's buy in the buy phase, halves the defuse and dies with them", async () => {
  h = await RoomHarness.create({ room: "bomb-kit", mode: "bomb", bots: 0 });
  const a = await h.join("Alpha"), b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  expect(h.state.bomb.stage).toBe("buy");
  h.send(a, C2S.Buy, { item: "kit" });
  expect(h.player(a.sessionId).kit, "attackers cannot buy a kit").toBe(false);
  h.send(b, C2S.Buy, { item: "kit" });
  expect(h.player(b.sessionId).kit).toBe(true);
  expect(h.player(b.sessionId).money).toBe(800 - BOMB.kitPrice);
  await h.until(MatchPhase.Playing);
  const site = BOMB_SITES[0];
  await h.place(a.sessionId, { ...site, yaw: 0, team: 0 });
  await h.advance(300);
  await hold(a, BOMB.plantMs + 300); expect(h.state.bomb.stage).toBe("planted");
  await h.place(b.sessionId, { ...site, x: site.x + 0.8, yaw: 0, team: 1 });
  await hold(b, BOMB.defuseKitMs + 300);
  expect(h.state.bomb.result).toBe("BOMB DEFUSED");
  await h.advance(BOMB.breakMs + BOMB.buyMs + 300);
  expect(h.player(b.sessionId).kit, "a kit survives the round while its owner lives").toBe(true);
  (h.room as unknown as { applyDamage(p: ReturnType<typeof h.player>, id: string, n: number, head: boolean, client: undefined): void })
    .applyDamage(h.player(a.sessionId), b.sessionId, 999, false, undefined);
  expect(h.player(b.sessionId).kit, "lost on death").toBe(false);
});
it("2.3: the detonation is a c4 boom that kills whoever is near the site and spares the far", async () => {
  const { a, b, c } = await match(); const site = BOMB_SITES[0];
  const carrier = h.state.bomb.carrier;
  const who = h.clients.find((x) => x.sessionId === carrier) ?? a;
  const other = [a, c].find((x) => x.sessionId !== carrier)!;
  await h.place(carrier, { ...site, yaw: 0, team: 0 });
  await h.place(b.sessionId, { ...site, x: site.x + 4, z: site.z + 2, yaw: 0, team: 1 });
  await h.place(other.sessionId, { x: 0, y: 0, z: -18, yaw: 0, team: 0 });
  await h.advance(300);
  await hold(who, BOMB.plantMs + 300); expect(h.state.bomb.stage).toBe("planted");
  await h.advance(BOMB.fuseMs + 200);
  expect(h.state.bomb.result).toBe("BOMB DETONATED");
  expect(h.broadcastsOf("boom").some((m) => (m.payload as { kind: string }).kind === "c4")).toBe(true);
  expect(h.player(b.sessionId).alive, "a defender next to the charge").toBe(false);
  expect(h.player(carrier).alive, "the planter standing on it").toBe(false);
  expect(h.player(other.sessionId).alive, "an attacker 45 m away").toBe(true);
  expect(h.broadcastsOf("kill").some((m) => (m.payload as { weapon: string; victim: string }).weapon === "c4" && (m.payload as { victim: string }).victim === b.sessionId)).toBe(true);
});
it("2.2: a plant lands where the planter stood, anywhere inside the zone", async () => {
  const { a } = await match(); const site = BOMB_SITES[1];
  const carrier = h.state.bomb.carrier;
  await h.place(carrier, { x: site.x + site.hw - 0.6, y: 0, z: site.z - site.hd + 0.6, yaw: 0, team: 0 });
  await h.advance(300);
  const who = h.clients.find((c) => c.sessionId === carrier) ?? a;
  await hold(who, BOMB.plantMs + 300);
  expect(h.state.bomb.stage).toBe("planted"); expect(h.state.bomb.site).toBe("B");
  expect(h.state.bomb.x).toBeCloseTo(site.x + site.hw - 0.6, 0);
  expect(h.state.bomb.z).toBeCloseTo(site.z - site.hd + 0.6, 0);
});
