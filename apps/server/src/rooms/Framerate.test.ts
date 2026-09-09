import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Btn, InputDt, MAX_INPUT_RATE, PLAYER, TICK_MS, C2S, packInput, type PlayerInput } from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * The room must play the same game at every framerate.
 *
 * Both faults here were framerate-shaped: the room simulated MORE time than had passed for a player
 * whose frames were longer than a tick, and refused input from a player whose frames were shorter.
 * Neither is visible at 60 fps on a fast machine, which is why they lasted — so the tests below name
 * the refresh rate in the assertion, not a tolerance.
 */
let h: RoomHarness;
const input = (seq: number, dt: number, buttons = 0, yaw = 0): PlayerInput => ({ seq, dt, buttons, yaw, pitch: 0 });

/** Feeds `seconds` of real time as a client running at `hz` would: one input per rendered frame. */
async function play(c: FakeClient, hz: number, seconds: number, buttons = 0, seq0 = 1): Promise<number> {
  const dtq = new InputDt();
  const frameMs = 1000 / hz;
  const frames = Math.round(hz * seconds);
  let seq = seq0;
  let owed = 0;
  for (let i = 0; i < frames; i++) {
    h.send(c, C2S.Input, [packInput(input(seq++, dtq.step(frameMs), buttons))]);
    // Advance the room by the frame's worth of real time, in whole ticks, carrying the remainder.
    owed += frameMs;
    const ticks = Math.floor(owed / TICK_MS);
    if (ticks > 0) { owed -= ticks * TICK_MS; await h.tick(ticks); }
  }
  return seq;
}

describe("framerate fairness", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

  it("never simulates more time than has passed, at any framerate", async () => {
    // Free fall is the sharpest probe there is. Gravity is velocity-Verlet, so `vy` is exactly
    // `gravity x simulated time` however the time was sliced up — read it back and you know how much
    // simulation the room actually ran, with no tolerance to argue about.
    //
    // Before the fix a 30 fps player fell at 1.5 g: the room takes 60 steps a second whatever the
    // client's framerate, and every step that found nothing to consume stepped gravity for free.
    const simulated: Record<number, number> = {};
    for (const hz of [30, 60, 144]) {
      h = await RoomHarness.create({ room: `fall${hz}`, mode: "tdm", bots: 0 });
      const c = await h.join("FALLER");
      const s = h.session(c.sessionId);
      // Off a ledge, from rest, with nothing under it for the whole test.
      s.body.y += 40; s.body.vy = 0; s.body.grounded = false;
      const t0 = h.now();
      await play(c, hz, 0.5);
      const realMs = h.now() - t0;
      simulated[hz] = (-s.body.vy / -PLAYER.gravity) * 1000;
      expect(simulated[hz], `${hz} Hz never left the ground`).toBeGreaterThan(50);
      // THE invariant. Half a tick of slack for the step the fake clock's 17 ms granularity adds.
      expect(simulated[hz], `${hz} Hz over-simulated`).toBeLessThanOrEqual(realMs + TICK_MS);
      await h.dispose();
    }
    // And the three framerates land on the same fall, which is the player-facing half of the claim.
    for (const hz of [30, 144]) {
      expect(simulated[hz] / simulated[60], `${hz} Hz vs 60`).toBeGreaterThan(0.9);
      expect(simulated[hz] / simulated[60], `${hz} Hz vs 60`).toBeLessThan(1.1);
    }
  }, 180000);

  it("still applies gravity to a body whose client has gone quiet", async () => {
    // The queue test must not turn the idle-gravity step off for the case it exists for.
    h = await RoomHarness.create({ room: "quiet", mode: "tdm", bots: 0 });
    const c = await h.join("QUIET");
    await h.tick(2);
    const s = h.session(c.sessionId);
    s.body.y += 20; s.body.vy = 0; s.body.grounded = false;
    const y0 = s.body.y;
    await h.tick(12); // no input at all
    expect(s.body.y).toBeLessThan(y0 - 0.1);
    expect(s.body.vy).toBeLessThan(-1);
    void c;
  }, 60000);

  it("consumes every input a 144 Hz client sends, for seconds on end", async () => {
    h = await RoomHarness.create({ room: "fast", mode: "tdm", bots: 0 });
    const c = await h.join("FAST");
    await h.tick(2);
    const s = h.session(c.sessionId);
    const last = await play(c, 144, 3, Btn.Forward);
    // Not one refused: at 90 * 1.5 = 135/s the room dropped nine a second and abandoned the rest of
    // the batch with them, and the player rubber-banded on the boundary of every window.
    expect(h.room.inputDropped).toBe(0);
    expect(s.lastSeq).toBe(last - 1);
    // And the room kept up: the queue is not a growing backlog at the end of three seconds.
    expect(s.inputs.length).toBeLessThanOrEqual(2);
    expect(MAX_INPUT_RATE).toBeGreaterThanOrEqual(240);
  }, 120000);

  it("keeps the time bank solvent for a minute of 60 Hz play", async () => {
    // The bank is 120 ms of slack. The old client rounded 16.6667 up to 16.7 every frame, which
    // spent that slack in about a minute and then stalled a tick at a time for the rest of the match.
    h = await RoomHarness.create({ room: "solvent", mode: "tdm", bots: 0 });
    const c = await h.join("SOLVENT");
    await h.tick(2);
    const s = h.session(c.sessionId);
    await play(c, 60, 60, Btn.Forward);
    expect(h.room.inputDropped).toBe(0);
    expect(s.inputs.length).toBeLessThanOrEqual(2); // not a backlog
    expect(s.bank).toBeGreaterThanOrEqual(0);
  }, 180000);

  it("refuses a genuine flood", async () => {
    h = await RoomHarness.create({ room: "flood", mode: "tdm", bots: 0 });
    const c = await h.join("FLOOD");
    await h.tick(2);
    for (let i = 0; i < 40; i++) {
      const batch = [];
      for (let k = 0; k < 12; k++) batch.push(packInput(input(i * 12 + k + 1, 1, 0)));
      h.send(c, C2S.Input, batch);
    }
    expect(h.room.inputDropped).toBeGreaterThan(0);
    expect(h.room.handlerErrors).toBe(0);
  }, 60000);
});
