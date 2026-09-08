import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, MatchPhase, DOM } from "@frankibarber/shared";
import { RoomHarness } from "./testHarness";
let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { if (h) await h.dispose(); vi.useRealTimers(); });
describe("The Boys room", () => {
  it("queues class changes until respawn and rejects illegal purchases", async () => {
    h = await RoomHarness.create({ mode: "boys" });
    const a = await h.join("Alpha"); const p = h.player(a.sessionId);
    expect(p.health).toBe(85); expect([...p.owned]).toContain("smg");
    h.send(a, "boys:class", 3); h.send(a, "boys:class", 6);
    expect(p.boysClass).toBe(1); expect(p.nextClass).toBe(3);
    p.money = 9000; h.send(a, C2S.Buy, { item: "launcher" });
    expect(p.money).toBe(9000); expect([...p.owned]).not.toContain("launcher");
    p.alive = false; p.health = 0; h.session(a.sessionId).respawnAt = h.now() + 10;
    await h.advance(40);
    expect(p.boysClass).toBe(3); expect(p.health).toBe(150); expect([...p.owned]).toEqual(["pistol", "lmg"]);
    expect(p.money).toBe(9000);
  });
  it("captures, pays the team and ends at the objective limit", async () => {
    h = await RoomHarness.create({ mode: "boys" });
    const a = await h.join("Alpha"); await h.join("Bravo");
    await h.until(MatchPhase.Playing);
    expect(h.state.flags.length).toBe(3);
    const f = h.map.flags[0]; await h.place(a.sessionId, { ...f, team: 0, yaw: 0 });
    await h.advance(4200); // scout takes 4s instead of a normal class's 6s
    expect(h.state.flags[0].owner).toBe(0);
    const cash = h.player(a.sessionId).money;
    await h.advance(DOM.tickMs + 50);
    expect(h.state.scoreA).toBeGreaterThan(0); expect(h.player(a.sessionId).money).toBeGreaterThan(cash);
    h.state.scoreA = DOM.scoreLimit - 1;
    await h.advance(DOM.tickMs + 50);
    expect(h.state.phase).toBe(MatchPhase.Ended); expect(h.state.winner).toBe(0);
  });
  it("medics heal allies in sight without stacking or healing enemies", async () => {
    h = await RoomHarness.create({ mode: "boys" });
    const a = await h.join("Medic"); const b = await h.join("Enemy"); const c = await h.join("Friend");
    await h.until(MatchPhase.Playing);
    const medic = h.player(a.sessionId); medic.boysClass = medic.nextClass = 4;
    const sp = h.openRun();
    for (const client of [a,b,c]) await h.place(client.sessionId, sp);
    const friend = h.player(c.sessionId), enemy = h.player(b.sessionId);
    friend.health = 40; enemy.health = 40;
    const money = medic.money; await h.advance(1050);
    expect(friend.health).toBe(50); expect(enemy.health).toBe(40); expect(medic.money).toBe(money + 20);
    Object.assign(h.session(c.sessionId), { lastDamageAt: h.now() });
    await h.advance(1000);
    expect(friend.health).toBe(56); // reduced healing during incoming fire
    await h.place(c.sessionId, { ...sp, x: sp.x + 25 });
    await h.advance(1000);
    expect(friend.health).toBe(56); // no healing outside the aura
  });
});
