import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Btn, C2S, ECONOMY, MATCH, MatchPhase, PERKS, PLAYER, RESPAWN_DELAY_MS, S2C, SPAWN_PROTECTION_MS, packInput,
  type MatchEventMessage, type PlayerInput, type ShopResult,
} from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * Drop 7: respawn waves and the frozen preparation window.
 *
 * The rule the owner asked for — "a countdown before both teams respawn, so you can calmly prepare"
 * — so these tests use the SHIPPED cadence rather than the harness's pinned long wave. What they
 * are for is the behaviour a player would notice: that nobody comes back alone, that nobody can act
 * or take a position during the countdown, and that the countdown is worth something (the shop is
 * open and the spawn shield has not been spent by the time the fighting resumes).
 */

let h: RoomHarness;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { await h.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

const input = (seq: number, dt: number, buttons = 0, yaw = 0): PlayerInput => ({ seq, dt, buttons, yaw, pitch: 0 });

/** A started match running the real wave cadence. */
async function match(mode = "tdm"): Promise<{ a: FakeClient; b: FakeClient }> {
  h = await RoomHarness.create({ room: `drop7-${mode}`, mode, waveMs: MATCH.waveMs, prepMs: MATCH.prepMs, seed: 7 });
  const a = await h.join("Alpha");
  const b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  expect(h.state.phase).toBe(MatchPhase.Playing);
  return { a, b };
}

describe("respawn waves", () => {
  it("alternates a live wave with a frozen preparation window, and keeps the match clock running through both", async () => {
    await match();
    const matchEndsAt = h.state.matchEndsAt;
    expect(matchEndsAt).toBeGreaterThan(h.now());
    // A wave is `waveMs`, not the whole match: the two clocks are separate.
    expect(h.state.phaseEndsAt - h.now()).toBeLessThanOrEqual(MATCH.waveMs + 50);

    await h.until(MatchPhase.Prep);
    expect(h.state.phaseEndsAt - h.now()).toBeLessThanOrEqual(MATCH.prepMs + 50);
    await h.until(MatchPhase.Playing);

    // The match deadline never moved: prep does not extend the match.
    expect(h.state.matchEndsAt).toBe(matchEndsAt);
    const phases = h.broadcastsOf(S2C.MatchEvent).map((m) => (m.payload as MatchEventMessage).phase);
    expect(phases).toContain(MatchPhase.Prep);
  });

  it("leaves the dead dead until the wave, then brings everyone back at the START of the countdown", async () => {
    const { a, b } = await match();
    // Two more casualties so the wave has a crowd to return.
    h.player(a.sessionId).alive = false;
    h.player(b.sessionId).alive = false;
    // Arm the OLD individual timer as well, so this test fails if the wave rule is removed rather
    // than quietly passing because nothing had asked for a respawn in the first place.
    h.session(a.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    h.session(b.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    const spawnsBefore = h.broadcastsOf(S2C.Spawn).length;

    await h.advance(MATCH.waveMs - 1000);
    expect(h.state.phase).toBe(MatchPhase.Playing);
    expect(h.player(a.sessionId).alive).toBe(false);
    expect(h.player(b.sessionId).alive).toBe(false);
    expect(h.broadcastsOf(S2C.Spawn).length).toBe(spawnsBefore);

    // Entering prep is the moment they come back — not the moment it ends. The countdown is meant
    // to be spent preparing, which is impossible from a death screen.
    await h.until(MatchPhase.Prep);
    expect(h.player(a.sessionId).alive).toBe(true);
    expect(h.player(b.sessionId).alive).toBe(true);
    expect(h.broadcastsOf(S2C.Spawn).length).toBe(spawnsBefore + 2);
    expect(h.player(a.sessionId).health).toBe(PLAYER.maxHealth);
  });

  it("freezes the body: pressing forward through the whole countdown moves nobody", async () => {
    const { a } = await match();
    const sp = h.openRun();
    await h.place(a.sessionId, sp);
    const s = h.session(a.sessionId);

    // A control run of the SAME input while live, so this measures the freeze and not a bad spawn.
    const liveFrom = { x: s.body.x, z: s.body.z };
    for (let i = 0; i < 30; i++) { h.send(a, C2S.Input, [packInput(input(1 + i, 16, Btn.Forward, sp.yaw))]); await h.tick(); }
    const liveMoved = Math.hypot(s.body.x - liveFrom.x, s.body.z - liveFrom.z);
    expect(liveMoved).toBeGreaterThan(1);

    await h.until(MatchPhase.Prep);
    await h.place(a.sessionId, sp);
    const from = { x: s.body.x, z: s.body.z };
    for (let i = 0; i < 60; i++) { h.send(a, C2S.Input, [packInput(input(500 + i, 16, Btn.Forward | Btn.Sprint, sp.yaw))]); await h.tick(); }
    // Not exactly zero: the mover still runs, so residual momentum is bled off by friction rather
    // than by a hard stop — which is what keeps client prediction in agreement. A tenth of a metre
    // against the metre-plus of the control run is the difference between skidding and walking.
    expect(Math.hypot(s.body.x - from.x, s.body.z - from.z)).toBeLessThan(0.1);
  });

  it("refuses to shoot or throw while frozen, and accepts both again the moment the wave is released", async () => {
    const { a, b } = await match();
    await h.arm(a, "rifle");
    await h.until(MatchPhase.Prep);

    const s = h.session(a.sessionId);
    const o: [number, number, number] = [s.body.x, s.body.y + PLAYER.eyeHeight, s.body.z];
    const shotsBefore = h.broadcastsOf(S2C.Shot).length;
    h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o, d: [0, 0, 1], t: h.now() });
    await h.tick();
    // `rejectFire` only logs (and only in dev), so the observable proof is that nothing was fired.
    expect(h.broadcastsOf(S2C.Shot).length).toBe(shotsBefore);

    const throwsBefore = h.broadcastsOf(S2C.Throw).length;
    h.send(a, C2S.Throw, { kind: "frag", o, d: [0, 0, 1], cookMs: 0 });
    await h.tick();
    expect(h.broadcastsOf(S2C.Throw).length).toBe(throwsBefore);

    await h.until(MatchPhase.Playing);
    h.send(a, C2S.Fire, { seq: 2, weapon: "rifle", o, d: [0, 0, 1], t: h.now() });
    await h.tick();
    expect(h.broadcastsOf(S2C.Shot).length).toBe(shotsBefore + 1);
    void b;
  });

  it("opens the shop for the whole countdown, long after the spawn window has closed", async () => {
    const { a } = await match();
    // Well past ECONOMY.buyWindowMs and nowhere near a buy station: normally shut. Asserted while
    // LIVE — the same instant during prep is the point of the test below.
    await h.advance(ECONOMY.buyWindowMs + 500);
    await h.until(MatchPhase.Playing);
    h.player(a.sessionId).money = 9000;
    h.send(a, C2S.Buy, { item: "rifle" });
    await h.tick();
    expect((h.sentOf(a, S2C.Shop).at(-1)?.payload as ShopResult)).toMatchObject({ ok: false, reason: "closed" });

    await h.until(MatchPhase.Prep);
    h.send(a, C2S.Buy, { item: "rifle" });
    await h.tick();
    expect((h.sentOf(a, S2C.Shop).at(-1)?.payload as ShopResult)).toMatchObject({ ok: true });
    expect(Array.from(h.player(a.sessionId).owned)).toContain("rifle");
  });

  it("hands the spawn shield over intact, so it is not spent standing still", async () => {
    const { a } = await match();
    h.player(a.sessionId).alive = false;
    await h.until(MatchPhase.Prep);
    const p = h.player(a.sessionId);
    expect(p.alive).toBe(true);
    // Respawned at the start of a 5 s freeze with a 1.5 s shield: measured from the respawn it
    // would already be gone by the release. It has to start when the fighting does.
    expect(p.protectedUntil - h.now()).toBeGreaterThan(MATCH.prepMs);
    await h.until(MatchPhase.Playing);
    expect(p.protectedUntil).toBeGreaterThan(h.now());
    expect(p.protectedUntil - h.now()).toBeLessThanOrEqual(SPAWN_PROTECTION_MS + 50);
  });

  it("clears anything already in the air when the freeze starts", async () => {
    const { a } = await match();
    await h.arm(a, "frag");
    const s = h.session(a.sessionId);
    const o: [number, number, number] = [s.body.x, s.body.y + PLAYER.eyeHeight, s.body.z];
    // Wait on the phase CLOCK rather than on a sum: `arm` advances time of its own, and every
    // draft of this that added milliseconds up was off by exactly that.
    while (h.state.phaseEndsAt - h.now() > 400) await h.tick();
    expect(h.state.phase).toBe(MatchPhase.Playing);
    h.send(a, C2S.Throw, { kind: "frag", o, d: [0, 0.2, 1], cookMs: 0 });
    await h.tick();
    expect(h.broadcastsOf(S2C.Throw).length).toBeGreaterThan(0);
    const boomsBefore = h.broadcastsOf(S2C.Boom).length;
    const heldBefore = h.player(a.sessionId).lethalCount;
    await h.until(MatchPhase.Prep);
    // A grenade landing on players who cannot move out of the way is not a fight, it is a coin
    // toss. The result screen already clears the air for the same reason.
    await h.until(MatchPhase.Playing);
    expect(h.broadcastsOf(S2C.Boom).length).toBe(boomsBefore);
    // …and it is given back, because it was paid for. Without this, throwing anywhere in the last
    // fuse-length of a wave silently costs a grenade — which is what an e2e run found.
    expect(h.player(a.sessionId).lethalCount).toBe(heldBefore + 1);
  });

  it("keeps warm-up on the old individual respawn, because a warm-up that stops is a queue", async () => {
    h = await RoomHarness.create({ room: "drop7-warmup", waveMs: MATCH.waveMs, prepMs: MATCH.prepMs });
    const a = await h.join("Alpha");
    expect(h.state.phase).toBe(MatchPhase.Waiting); // one player: no match yet
    h.player(a.sessionId).alive = false;
    h.session(a.sessionId).respawnAt = h.now() + 200;
    await h.advance(400);
    expect(h.player(a.sessionId).alive).toBe(true);
  });

  it("does not pay Domination for time nobody could contest", async () => {
    const { a } = await match("dom");
    // Park a player on a flag and let it capture, then run a full wave + freeze.
    const f = h.map.flags[0];
    await h.place(a.sessionId, { x: f.x, y: f.y, z: f.z, yaw: 0, team: 0 });
    await h.until(MatchPhase.Prep);
    const scoreBeforeFreeze = h.state.scoreA;
    await h.advance(MATCH.prepMs - 200); // still inside the freeze
    expect(h.state.phase).toBe(MatchPhase.Prep);
    expect(h.state.scoreA).toBe(scoreBeforeFreeze); // frozen time pays nothing
    // …and no catch-up burst on the way out: one freeze must not become several ticks at once.
    // The extra ticks matter — `until` returns on the tick the phase FLIPS, and the simulation for
    // that tick already ran while still frozen, so a burst could only show up afterwards. Without
    // them this assertion measured a moment when nothing could have happened yet and passed no
    // matter what the code did.
    await h.until(MatchPhase.Playing);
    await h.tick(4);
    expect(h.state.scoreA - scoreBeforeFreeze).toBeLessThanOrEqual(1);
  });

  it("brings back a player who reconnects INSIDE the countdown, not one wave later", async () => {
    const { a, b } = await match();
    h.player(a.sessionId).alive = false;
    // Drop the connection before the window opens: `refillWave` skips ghosts, and
    // `allowReconnection` does not call `onJoin`, so without a refill on every tick nothing would
    // ever bring this player back — they would sit out the wave they reconnected into as well.
    a.drop(1006);
    await h.until(MatchPhase.Prep);
    await h.tick(2);
    expect(h.player(a.sessionId).alive).toBe(false); // a ghost stays a ghost
    const a2 = await h.reconnect(a);
    await h.tick(3);
    expect(h.player(a2.sessionId).alive, "back inside the same countdown").toBe(true);
    expect(h.state.phase).toBe(MatchPhase.Prep);
    void b;
  });

  it("gives a player who arrives during the countdown a shield that outlives it", async () => {
    const { a } = await match();
    await h.until(MatchPhase.Prep);
    const c = await h.join("Charlie"); // joining spawns immediately, inside the freeze
    const p = h.player(c.sessionId);
    expect(p.alive).toBe(true);
    // The shield is granted from the RELEASE, not from the spawn: measured from now it must still
    // cover the rest of the freeze plus its own length, or it would be spent standing still.
    expect(p.protectedUntil - h.now()).toBeGreaterThan(MATCH.prepMs - 200);
    await h.until(MatchPhase.Playing);
    expect(p.protectedUntil, "still shielded when the fighting starts").toBeGreaterThan(h.now());
    void a;
  });

  it("does not burn a perk's clock while its buyer is frozen", async () => {
    const { a } = await match();
    await h.until(MatchPhase.Prep);
    const p = h.player(a.sessionId);
    p.money = 9000;
    h.send(a, C2S.Buy, { item: "flask" });
    await h.tick();
    const until = p.perks.get("flask") ?? 0;
    // The shop is open during the countdown precisely so it can be used. A timed perk armed from
    // the moment of purchase would spend the whole freeze — a fifth of it at these numbers — on a
    // player who cannot move, which is the opposite of what the window is for.
    //
    // Measured against the RELEASE, not against now: the flask runs for 25 s and the freeze is 5,
    // so "more than a freeze left" was true either way and proved nothing.
    expect(until - h.state.phaseEndsAt).toBeCloseTo(PERKS.flask.durationMs, -2);
    await h.until(MatchPhase.Playing);
    expect(until - h.now()).toBeGreaterThan(PERKS.flask.durationMs - 200);
  });

  it("does not dump a match's worth of stale respawns onto the result screen", async () => {
    const { a, b } = await match();
    // Every kill during a match arms `respawnAt` that the wave never consumes. Left set, they are
    // all in the past by the final whistle and fire together the moment the phase stops being one
    // the wave owns — a scoreboard with the whole lobby respawning behind it. Measured: 6 spawn
    // broadcasts where 4 is right.
    //
    // TWO GUARDS COVER THIS AND THEY MASK EACH OTHER: the respawn gate naming the warm-up phases
    // (rather than "not a wave phase", which lets the result screen through) and `endMatch`
    // clearing the timers. Reverting either ALONE leaves this test green, which is exactly the kind
    // of thing that reads as a test proving nothing. It does prove it — both have to go.
    h.player(a.sessionId).alive = false;
    h.session(a.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    h.player(b.sessionId).alive = false;
    h.session(b.sessionId).respawnAt = h.now() + RESPAWN_DELAY_MS;
    h.state.matchEndsAt = h.now(); // final whistle on the next tick
    await h.until(MatchPhase.Ended);
    const spawnsAtEnd = h.broadcastsOf(S2C.Spawn).length;
    await h.advance(RESPAWN_DELAY_MS * 2);
    expect(h.state.phase).toBe(MatchPhase.Ended);
    expect(h.broadcastsOf(S2C.Spawn).length, "nobody respawns on the result screen").toBe(spawnsAtEnd);
    expect(h.player(a.sessionId).alive).toBe(false);
  });

  it("freezes bots too", async () => {
    h = await RoomHarness.create({ room: "drop7-bots", mode: "tdm", bots: 2, botLevel: "normal", seed: 3, waveMs: MATCH.waveMs, prepMs: MATCH.prepMs });
    await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    const bots = Array.from(h.state.players.values()).filter((p) => p.bot);
    expect(bots.length).toBe(2);
    await h.until(MatchPhase.Prep);
    const atFreeze = bots.map((p) => ({ x: p.x, z: p.z }));

    // A body caught mid-stride keeps its momentum and is stopped by the mover's own friction rather
    // than by a hard stop — that is deliberate, because it is what keeps client prediction in
    // agreement. MEASURED on a bot running at 3.11 m/s when the freeze began: 0.18 m of skid, and
    // zero movement from 300 ms onwards. So the skid is bounded…
    await h.advance(1000);
    const skid = bots.map((p, i) => Math.hypot(p.x - atFreeze[i].x, p.z - atFreeze[i].z));
    for (const d of skid) expect(d).toBeLessThan(0.5);

    // …and after it, nothing moves at all. This half of the window is the real assertion: a fudged
    // threshold would pass a bot that simply walked slowly.
    const settled = bots.map((p) => ({ x: p.x, z: p.z }));
    await h.advance(MATCH.prepMs - 1500);
    expect(h.state.phase).toBe(MatchPhase.Prep); // never left the window: no free ticks measured
    for (const [i, p] of bots.entries()) {
      expect(p.x, `bot ${i} x`).toBe(settled[i].x);
      expect(p.z, `bot ${i} z`).toBe(settled[i].z);
    }
    expect(h.room.handlerErrors).toBe(0);
  });
});
