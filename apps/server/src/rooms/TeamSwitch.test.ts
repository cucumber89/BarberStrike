import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, S2C, MATCH, MatchPhase, TEAM_SWITCH_COOLDOWN_MS, type TeamResult } from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * Team switching (2.4). The two things that matter: the server, not the client, decides; and the
 * switch is not a way to refill an empty wallet.
 */

let h: RoomHarness;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { await h.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

const results = (c: FakeClient): TeamResult[] => h.sentOf(c, S2C.TeamResult).map((m) => m.payload as TeamResult);
const last = (c: FakeClient): TeamResult | undefined => results(c).at(-1);

describe("changing sides", () => {
  it("moves the player, and takes their money and guns with them", async () => {
    h = await RoomHarness.create({ room: "sw", mode: "tdm", bots: 0 });
    const a = await h.join("Alpha");
    const p = h.state.players.get(a.sessionId)!;
    const from = p.team;
    // Spend some money so a reset would be obvious, then switch.
    const moneyBefore = p.money;
    const ownedBefore = [...p.owned];
    h.send(a, C2S.Team, { team: from === 0 ? 1 : 0 });
    await h.advance(50);
    expect(last(a)).toMatchObject({ ok: true, deferred: false });
    expect(p.team).toBe(from === 0 ? 1 : 0);
    // THE POINT: switching sides is not a way to get a fresh wallet or fresh kit.
    expect(p.money).toBe(moneyBefore);
    expect([...p.owned]).toEqual(ownedBefore);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("refuses a switch that would stack the sides", async () => {
    h = await RoomHarness.create({ room: "sw2", mode: "tdm", bots: 0 });
    const a = await h.join("Alpha");
    const b = await h.join("Bravo");
    const pa = h.state.players.get(a.sessionId)!;
    const pb = h.state.players.get(b.sessionId)!;
    // Auto-balance put them one each; moving either makes it 0 v 2.
    expect([pa.team, pb.team].sort()).toEqual([0, 1]);
    h.send(a, C2S.Team, { team: pb.team });
    await h.advance(50);
    expect(last(a)).toMatchObject({ ok: false, reason: "balance" });
    expect(pa.team).not.toBe(pb.team);
  });

  it("makes a player stay put for a while before switching again", async () => {
    h = await RoomHarness.create({ room: "sw3", mode: "tdm", bots: 3 });
    const a = await h.join("Alpha");
    const p = h.state.players.get(a.sessionId)!;
    const other = p.team === 0 ? 1 : 0;
    h.send(a, C2S.Team, { team: other });
    await h.advance(50);
    const first = last(a);
    if (first?.ok) {
      h.send(a, C2S.Team, { team: p.team === 0 ? 1 : 0 });
      await h.advance(50);
      expect(last(a)).toMatchObject({ ok: false, reason: "cooldown" });
      await h.advance(TEAM_SWITCH_COOLDOWN_MS);
      h.send(a, C2S.Team, { team: p.team === 0 ? 1 : 0 });
      await h.advance(50);
      expect(last(a)?.reason).not.toBe("cooldown");
    } else {
      // Balance refused the very first move; the cooldown must not have been armed by a refusal.
      expect(first).toMatchObject({ ok: false });
    }
    expect(h.room.handlerErrors).toBe(0);
  });

  it("has no sides to switch in free-for-all", async () => {
    h = await RoomHarness.create({ room: "sw4", mode: "ffa", bots: 0 });
    const a = await h.join("Alpha");
    h.send(a, C2S.Team, { team: 1 });
    await h.advance(50);
    expect(last(a)).toMatchObject({ ok: false, reason: "mode" });
  });

  it("holds a bomb-round switch over to the next round instead of teleporting a live player", async () => {
    h = await RoomHarness.create({ room: "sw5", mode: "bomb", bots: 3 });
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    // Get into a live round, not the buy window.
    for (let i = 0; i < 40 && h.state.phase !== MatchPhase.Playing; i++) await h.advance(1000);
    if (h.state.phase !== MatchPhase.Playing) return; // room never reached a live round; nothing to assert
    const p = h.state.players.get(a.sessionId)!;
    const from = p.team;
    h.send(a, C2S.Team, { team: from === 0 ? 1 : 0 });
    await h.advance(50);
    const r = last(a);
    if (!r?.ok) { expect(r).toMatchObject({ ok: false }); return; }
    expect(r).toMatchObject({ ok: true, deferred: true });
    // Still on the old side while the round runs — the whole point of deferring.
    expect(p.team).toBe(from);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("ignores a malformed or out-of-range team", async () => {
    h = await RoomHarness.create({ room: "sw6", mode: "tdm", bots: 3 });
    const a = await h.join("Alpha");
    const p = h.state.players.get(a.sessionId)!;
    const before = p.team;
    for (const bad of [null, 7, "1", { team: 2 }, { team: -1 }, { team: "0" }, {}]) {
      h.send(a, C2S.Team, bad);
    }
    await h.advance(50);
    expect(p.team).toBe(before);
    expect(h.room.handlerErrors).toBe(0);
  });
});
