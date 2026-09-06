import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Btn, C2S, S2C, DOM, MATCH, aimDirection, packInput, type PlayerInput } from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/** Codex handoff P1 (network fairness): shot direction vs the named input, Fire packet cap, ghosts and flags. */

let h: RoomHarness;

beforeEach(() => { vi.useFakeTimers(); });

afterEach(async () => {
  await h.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const input = (seq: number, buttons: number, yaw: number, pitch = 0): PlayerInput => ({ seq, dt: 16, buttons, yaw, pitch });
const shots = () => h.broadcastsOf(S2C.Shot).length;

async function duel(): Promise<{ a: FakeClient; b: FakeClient }> {
  h = await RoomHarness.create({ room: "handoff", mode: "tdm" });
  const a = await h.join("Alpha");
  const b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  await h.settle();
  await h.arm(a, "rifle");
  return { a, b };
}

describe("shot direction vs the input it names", () => {
  it("accepts a shot along the aim of its seq, rejects one 20° off, tolerates an unknown seq only loosely", async () => {
    const { a, b } = await duel();
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    const yaw = Math.atan2(aim.d[0], aim.d[2]);
    const pitch = -Math.asin(aim.d[1]);
    // Input 7 carries the aim; a shot naming seq 7 along that aim goes through.
    h.send(a, C2S.Input, [packInput(input(7, 0, yaw, pitch))]);
    await h.tick();
    const n0 = shots();
    h.send(a, C2S.Fire, { seq: 7, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(shots()).toBe(n0 + 1);
    // 20° off the named aim: dropped.
    await h.advance(300);
    const off: [number, number, number] = [0, 0, 0];
    aimDirection(yaw + 0.35, pitch, off);
    h.send(a, C2S.Fire, { seq: 7, weapon: "rifle", o: aim.o, d: off, t: h.now() });
    await h.tick();
    expect(shots()).toBe(n0 + 1);
    // 2° off with the seq known: dropped too (the client's inputs carry recoil, so aim IS the input).
    aimDirection(yaw + 0.09, pitch, off);
    h.send(a, C2S.Fire, { seq: 7, weapon: "rifle", o: aim.o, d: off, t: h.now() });
    await h.tick();
    expect(shots()).toBe(n0 + 1);
    // Unknown seq (never sent): only the wide tolerance against the last simulated angles applies.
    aimDirection(yaw + 0.09, pitch, off);
    h.send(a, C2S.Fire, { seq: 9999, weapon: "rifle", o: aim.o, d: off, t: h.now() });
    await h.tick();
    expect(shots()).toBe(n0 + 2);
    aimDirection(yaw + 0.6, pitch, off);
    await h.advance(300);
    h.send(a, C2S.Fire, { seq: 9999, weapon: "rifle", o: aim.o, d: off, t: h.now() });
    await h.tick();
    expect(shots()).toBe(n0 + 2);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("caps Fire packets per second regardless of the weapon cooldown", async () => {
    const { a, b } = await duel();
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    for (let i = 0; i < 80; i++) h.send(a, C2S.Fire, { seq: 0, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    expect(h.room.fireDropped).toBeGreaterThanOrEqual(50);
    await h.advance(1100);
    const before = h.room.fireDropped;
    h.send(a, C2S.Fire, { seq: 0, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    expect(h.room.fireDropped).toBe(before); // a fresh second: read again
  });
});

describe("dropped players", () => {
  it("a ghost standing on a flag neither captures nor contests it", async () => {
    h = await RoomHarness.create({ room: "ghost", mode: "dom" });
    const a = await h.join("Alpha");
    const b = await h.join("Bravo");
    await h.advance(MATCH.countdownMs + 100);
    const flag = h.map.flags[0];
    await h.place(a.sessionId, { x: flag.x, y: flag.y, z: flag.z, yaw: 0, team: 0 });
    a.drop(1006); // network drop: the player stays for the reconnection grace, flagged disconnected
    await h.advance(200);
    expect(h.player(a.sessionId).connected).toBe(false);
    await h.advance(DOM.captureMs + 500);
    expect(h.state.flags[0].owner).toBe(-1);
    expect(h.state.flags[0].cap).toBe(0);
    // The living enemy takes it unopposed despite the ghost.
    await h.place(b.sessionId, { x: flag.x + 1, y: flag.y, z: flag.z, yaw: 0, team: 1 });
    await h.advance(DOM.captureMs + 200);
    expect(h.state.flags[0].owner).toBe(1);
    expect(Btn.Fire).toBeGreaterThan(0);
  });
});
