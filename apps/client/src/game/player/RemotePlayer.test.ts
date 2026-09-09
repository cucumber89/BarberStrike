import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { INTERP_DELAY_MS, SNAPSHOT_MS, quantAngle, quantVel } from "@frankibarber/shared";
import { RemotePlayer } from "./RemotePlayer";
import type { NetPlayer } from "../net/Connection";

/**
 * What another player looks like when the network misbehaves.
 *
 * A remote body is drawn `INTERP_DELAY_MS` behind the newest snapshot, which buys about two
 * snapshots of jitter budget. Lose one packet and render time walks off the end of the buffer — and
 * what the old code did there was stop dead and then jump, on the exact thing the player is aiming
 * at. These tests drive the buffer by hand: no engine timing, no network, just snapshot times.
 */
let engine: NullEngine;
let scene: Scene;

const net = (over: Partial<Record<string, unknown>> = {}): NetPlayer => ({
  id: "r1", name: "REMOTE", team: 0,
  x: 0, y: 0, z: 0, yaw: quantAngle(0), pitch: 0,
  vx: 0, vy: 0, vz: 0, grounded: true, crouch: false,
  health: 100, alive: true, weapon: "rifle", ammo: 30, reserve: 90, reloading: false,
  protectedUntil: 0, kills: 0, deaths: 0, score: 0, ping: 0, connected: true,
  money: 0, owned: [], lethal: "", lethalCount: 0, tactical: "", tacticalCount: 0, spawnedAt: 0,
  armor: 0, perks: { get: () => undefined }, lean: 0, tac: false, assists: 0, bot: false,
  shaved: false, haircut: "", ...over,
} as unknown as NetPlayer);

/** Pushes a snapshot at server time `t` with the given position and horizontal velocity. */
function push(r: RemotePlayer, t: number, x: number, z: number, vx = 0, vz = 0, over: Record<string, unknown> = {}): void {
  r.pushFrom(net({ x, z, vx: quantVel(vx), vz: quantVel(vz), ...over }), t);
}

beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });

describe("remote interpolation", () => {
  it("interpolates between the two snapshots that straddle render time", () => {
    const r = new RemotePlayer(scene, net(), 0);
    push(r, 1000, 0, 0, 4, 0);
    push(r, 1000 + SNAPSHOT_MS, 0.2, 0, 4, 0);
    r.update(1000 + SNAPSHOT_MS / 2, 16.7);
    expect(r.x).toBeCloseTo(0.1, 3);
    r.dispose();
  });

  it("carries a moving remote on instead of freezing when a snapshot is lost", () => {
    const r = new RemotePlayer(scene, net(), 0);
    push(r, 1000, 0, 0, 5, 0);
    push(r, 1000 + SNAPSHOT_MS, 0.25, 0, 5, 0);
    // Render time walks past the newest snapshot: one lost packet is 50 ms of this.
    r.update(1000 + SNAPSHOT_MS, 16.7);
    const atEdge = r.x;
    r.update(1000 + SNAPSHOT_MS + 16.7, 16.7);
    const oneFrameOn = r.x;
    r.update(1000 + SNAPSHOT_MS + 33.4, 16.7);
    expect(oneFrameOn, "froze at the last snapshot").toBeGreaterThan(atEdge);
    expect(r.x, "stopped after one frame").toBeGreaterThan(oneFrameOn);
    // And it slows down rather than running away: the second frame covers less than the first.
    expect(r.x - oneFrameOn).toBeLessThan(oneFrameOn - atEdge);
    r.dispose();
  });

  it("never guesses further than three quarters of a metre, however long the gap", () => {
    const r = new RemotePlayer(scene, net(), 0);
    push(r, 1000, 0, 0, 9, 0); // faster than any body in the game
    push(r, 1000 + SNAPSHOT_MS, 0.45, 0, 9, 0);
    const edge = 1000 + SNAPSHOT_MS;
    for (const gap of [100, 300, 1000, 30000]) {
      r.update(edge + gap, 16.7);
      expect(r.x - 0.45, `gap ${gap} ms`).toBeLessThanOrEqual(0.75 + 1e-6);
    }
    r.dispose();
  });

  it("does not guess for a standing or a dead remote", () => {
    const r = new RemotePlayer(scene, net(), 0);
    push(r, 1000, 3, 3, 0, 0);
    push(r, 1000 + SNAPSHOT_MS, 3, 3, 0, 0);
    r.update(1000 + SNAPSHOT_MS + 200, 16.7);
    expect(r.x).toBeCloseTo(3, 6);
    expect(r.z).toBeCloseTo(3, 6);

    const d = new RemotePlayer(scene, net({ id: "r2" }), 0);
    push(d, 1000, 0, 0, 6, 0, { alive: false });
    push(d, 1000 + SNAPSHOT_MS, 0.3, 0, 6, 0, { alive: false });
    d.update(1000 + SNAPSHOT_MS + 200, 16.7);
    expect(d.x).toBeCloseTo(0.3, 6); // a corpse does not walk on
    r.dispose(); d.dispose();
  });

  it("holds height while guessing, because vertical velocity is not replicated", () => {
    const r = new RemotePlayer(scene, net(), 0);
    r.pushFrom(net({ x: 0, y: 5, z: 0, vx: quantVel(5), grounded: false }), 1000);
    r.pushFrom(net({ x: 0.25, y: 4.5, z: 0, vx: quantVel(5), grounded: false }), 1000 + SNAPSHOT_MS);
    r.update(1000 + SNAPSHOT_MS + 60, 16.7);
    expect(r.y).toBeCloseTo(4.5, 6);
    r.dispose();
  });

  it("drops snapshots too old to be the answer to anything", () => {
    const r = new RemotePlayer(scene, net(), 0);
    for (let i = 0; i < 16; i++) push(r, 1000 + i * SNAPSHOT_MS, i * 0.1, 0);
    // A clock offset that steps BACKWARDS used to land on the front of the buffer — most of a second
    // of staleness. With the trim, the oldest snapshot left is within 400 ms of render time.
    // The buffer is 16 snapshots at 20 Hz, so its front is 800 ms — 0.8 m of running — behind its
    // back. The trim keeps only the last 400 ms, so the worst a backwards clock step can show is the
    // front of THAT window (x 0.5 here, 0.0 before), and it can never be the start of the buffer.
    const renderT = 1000 + 15 * SNAPSHOT_MS - INTERP_DELAY_MS;
    r.update(renderT, 16.7);
    r.update(renderT - 5000, 16.7); // the backwards step
    expect(r.x).toBeGreaterThanOrEqual(0.5);
    r.dispose();
  });

  it("switches a discrete pose flag at the nearer snapshot, not the newer one", () => {
    const r = new RemotePlayer(scene, net(), 0);
    push(r, 1000, 0, 0, 0, 0, { crouch: false });
    push(r, 1000 + SNAPSHOT_MS, 0, 0, 0, 0, { crouch: true });
    r.update(1000 + SNAPSHOT_MS * 0.2, 16.7);
    expect(r.crouch, "crouched a snapshot early").toBe(false);
    r.update(1000 + SNAPSHOT_MS * 0.8, 16.7);
    expect(r.crouch).toBe(true);
    r.dispose();
  });
});
