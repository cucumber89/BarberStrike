import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, MATCH, MatchPhase, RESPAWN_DELAY_MS, S2C, type MatchEventMessage } from "@frankibarber/shared";
import { RoomHarness } from "./testHarness";

let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h.dispose(); vi.useRealTimers(); });
async function match(mode = "tdm", bots = 0) {
  h = await RoomHarness.create({ room: `continuous-${mode}`, mode, bots, seed: 7 });
  const a = await h.join("Alpha"), b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  expect(h.state.phase).toBe(MatchPhase.Playing);
  return { a, b };
}

describe("continuous matches", () => {
  for (const mode of ["tdm", "ffa", "dom"]) {
    it(`${mode} keeps fighting past several former round boundaries`, async () => {
      await match(mode);
      const deadline = h.state.matchEndsAt;
      await h.advance(60000);
      expect(h.state.phase).toBe(MatchPhase.Playing);
      expect(h.state.matchEndsAt).toBe(deadline);
      expect(h.state.phaseEndsAt).toBe(deadline);
      const phases = h.broadcastsOf(S2C.MatchEvent).map(m => (m.payload as MatchEventMessage).phase);
      expect(phases).not.toContain(MatchPhase.Prep);
      expect(phases.filter(p => p === MatchPhase.Playing)).toHaveLength(1);
    });
  }
  it("a team wipe only respawns the victim and preserves the survivor and score", async () => {
    const { a, b } = await match();
    await h.settle(); await h.arm(a, "rifle");
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    const survivor = h.player(a.sessionId), victim = h.player(b.sessionId);
    survivor.health = 42; victim.health = 1;
    const pos = [survivor.x, survivor.z], deadline = h.state.matchEndsAt;
    h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(victim.alive).toBe(false);
    const score = [h.state.scoreA, h.state.scoreB];
    await h.advance(RESPAWN_DELAY_MS - 100);
    expect(victim.alive).toBe(false);
    await h.advance(150);
    expect(victim.alive).toBe(true);
    expect(h.state.phase).toBe(MatchPhase.Playing);
    expect(h.state.matchEndsAt).toBe(deadline);
    expect([h.state.scoreA, h.state.scoreB]).toEqual(score);
    expect(survivor.health).toBe(42);
    expect([survivor.x, survivor.z]).toEqual(pos);
  });
  it("players killed at different times return separately", async () => {
    const { a, b } = await match();
    h.player(a.sessionId).alive = false;
    h.session(a.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    await h.advance(1000);
    h.player(b.sessionId).alive = false;
    h.session(b.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    await h.advance(RESPAWN_DELAY_MS - 900);
    expect(h.player(a.sessionId).alive).toBe(true);
    expect(h.player(b.sessionId).alive).toBe(false);
    await h.advance(1000);
    expect(h.player(b.sessionId).alive).toBe(true);
  });
  it("bots use the same personal respawn delay", async () => {
    await match("tdm", 1);
    const bot = [...h.state.players.values()].find(p => p.bot)!;
    bot.alive = false;
    h.session(bot.id).respawnAt = h.now() + RESPAWN_DELAY_MS;
    await h.advance(RESPAWN_DELAY_MS - 100);
    expect(bot.alive).toBe(false);
    await h.advance(150);
    expect(bot.alive).toBe(true);
  });
  it("holds disconnected casualties until they reconnect", async () => {
    const { b } = await match();
    const p = h.player(b.sessionId);
    p.alive = false; p.connected = false;
    h.session(b.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    await h.advance(RESPAWN_DELAY_MS + 100);
    expect(p.alive).toBe(false);
    p.connected = true;
    await h.advance(50);
    expect(p.alive).toBe(true);
  });
  it("ends at the match deadline without respawning on the result screen", async () => {
    const { b } = await match();
    h.player(b.sessionId).alive = false;
    h.session(b.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    h.state.matchEndsAt = h.now() + 100;
    await h.advance(RESPAWN_DELAY_MS + 200);
    expect(h.state.phase).toBe(MatchPhase.Ended);
    expect(h.player(b.sessionId).alive).toBe(false);
  });
});