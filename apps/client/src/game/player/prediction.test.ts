import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Btn, MAPS, PLAYER, buildCollisionWorld, quantVel, type CollisionWorld } from "@frankibarber/shared";
import { LocalPlayer } from "./LocalPlayer";
import type { InputState } from "../input/InputState";
import type { NetPlayer } from "../net/Connection";

/**
 * What reconciliation does to the player who is watching.
 *
 * Two faults lived in `reconcile`, and neither was visible in a screenshot: the replay told the
 * movement that every held jump was a fresh press, and every correction over 3 cm was a jump cut in
 * the camera. Both are about the difference between what the body does (authoritative, instant) and
 * what the eye is shown (a presentation choice), so both are tested here on a real `LocalPlayer`
 * against the real map's collision world — the same simulation the server runs.
 */
const map = MAPS[Object.keys(MAPS)[0]];
const world: CollisionWorld = buildCollisionWorld(map);

/** An InputState that reports exactly the buttons a test wants, and a mouse that never moves. */
function fakeInput(buttons = 0): InputState {
  return {
    buttons: () => buttons,
    consumeMouse: (m: { dx: number; dy: number }) => { m.dx = 0; m.dy = 0; },
    pointerLocked: true,
  } as unknown as InputState;
}

function makePlayer(buttons = 0): { p: LocalPlayer; dispose: () => void } {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const p = new LocalPlayer(scene, world, fakeInput(buttons), { sensitivity: 1, invertY: false, fov: 90, bobScale: 0, shakeScale: 0 });
  const sp = map.spawns[0];
  p.spawnAt(sp.x, sp.y, sp.z, sp.yaw);
  return { p, dispose: () => { scene.dispose(); engine.dispose(); } };
}

/** The server's word for a body, as the snapshot delivers it (velocities quantised). */
function serverSays(x: number, y: number, z: number, b: { vx: number; vy: number; vz: number; grounded: boolean; crouching: boolean }): NetPlayer {
  return { x, y, z, vx: quantVel(b.vx), vy: quantVel(b.vy), vz: quantVel(b.vz), grounded: b.grounded, crouch: b.crouching } as unknown as NetPlayer;
}

describe("prediction replay", () => {
  it("does not re-jump inputs that were already airborne when it replays them", () => {
    // Holding space: the FIRST input has the jump edge, the rest are the same bit held down. A replay
    // that starts from a zero sees an edge on the head of the queue that the server never saw, so it
    // launches a body the server left falling — and the disagreement it creates buys the next
    // correction, which buys the next replay.
    const { p, dispose } = makePlayer(Btn.Jump);
    p.update(16.7);                      // the press: leaves the ground
    for (let i = 0; i < 5; i++) p.update(16.7); // still held, rising then falling
    const predicted = { x: p.body.x, y: p.body.y, z: p.body.z, vy: p.body.vy };
    expect(predicted.y).toBeGreaterThan(map.spawns[0].y + 0.05); // it did jump once

    // The server agrees about where the body was at the ack, but 4 cm out in x — enough to replay.
    const ack = 1;
    p.reconcile(serverSays(predicted.x + 0.04, predicted.y, predicted.z, { vx: 0, vy: predicted.vy, vz: 0, grounded: false, crouching: false }), ack);

    // A replay of five held-jump inputs must not add a second launch: vy may only have fallen.
    expect(p.body.vy).toBeLessThanOrEqual(predicted.vy + 0.01);
    expect(p.body.y).toBeLessThan(predicted.y + 0.5);
    dispose();
  });

  it("replays a correction to the same place twice running", () => {
    // Idempotence is the property a replay needs: the same pending inputs against the same server
    // truth must land on the same body, or corrections chase each other.
    const { p, dispose } = makePlayer(Btn.Forward | Btn.Jump);
    for (let i = 0; i < 6; i++) p.update(16.7);
    const truth = serverSays(p.body.x + 0.05, p.body.y, p.body.z, { vx: 1, vy: p.body.vy, vz: 1, grounded: false, crouching: false });
    p.reconcile(truth, 1);
    const first = { x: p.body.x, y: p.body.y, z: p.body.z, vy: p.body.vy };
    p.reconcile(truth, 1);
    expect(p.body.x).toBeCloseTo(first.x, 6);
    expect(p.body.y).toBeCloseTo(first.y, 6);
    expect(p.body.z).toBeCloseTo(first.z, 6);
    expect(p.body.vy).toBeCloseTo(first.vy, 6);
    dispose();
  });
});

describe("correction smoothing", () => {
  it("moves the body at once and the camera over about 80 ms", () => {
    const { p, dispose } = makePlayer(Btn.Forward);
    for (let i = 0; i < 4; i++) p.update(16.7);
    const camBefore = p.camera.position.x;
    const bodyBefore = p.body.x;
    // A correction the size of a real mispredict (12 cm).
    p.reconcile(serverSays(p.body.x + 0.12, p.body.y, p.body.z, { vx: 0, vy: 0, vz: 0, grounded: true, crouching: false }), 1);
    expect(p.body.x).not.toBeCloseTo(bodyBefore, 3);   // the body took the truth immediately
    const owed = p.viewError;
    expect(owed).toBeGreaterThan(0.05);                 // the eye is holding the difference

    // One frame later the camera has begun to move but has NOT arrived.
    p.update(16.7);
    const held = p.viewError;
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan(owed);
    // A fifth of a second in — two and a half time constants — under a tenth of it is left, which is
    // a centimetre of eye offset on a 12 cm correction: not something anyone can see.
    for (let i = 0; i < 12; i++) p.update(16.7);
    expect(p.viewError).toBeLessThan(owed * 0.1);
    expect(p.viewError).toBeLessThan(0.015);
    expect(Math.abs(p.camera.position.x - camBefore)).toBeGreaterThan(0); // and it did travel
    dispose();
  });

  it("takes the same time to catch up at 30 fps as at 144", () => {
    // A framerate-proportional decay would hide a correction in a third of the time on a fast
    // machine, which is the kind of difference that makes two players describe the same game
    // differently. The decay is exponential in real time instead.
    // Standing still, so the ONLY thing in the offset is the error the test injects — a walking body
    // replays a different distance at each framerate and would blur the measurement.
    const leftAfter160ms = (frameMs: number): { owed: number; left: number } => {
      const { p, dispose } = makePlayer();
      for (let i = 0; i < 4; i++) p.update(frameMs);
      p.reconcile(serverSays(p.body.x + 0.2, p.body.y, p.body.z, { vx: 0, vy: 0, vz: 0, grounded: true, crouching: false }), 1);
      const owed = p.viewError;
      for (let t = 0; t < 160; t += frameMs) p.update(frameMs);
      const left = p.viewError;
      dispose();
      return { owed, left };
    };
    const slow = leftAfter160ms(1000 / 30), fast = leftAfter160ms(1000 / 144);
    expect(slow.owed).toBeCloseTo(fast.owed, 3);            // same correction to hide
    expect(slow.left / slow.owed).toBeCloseTo(fast.left / fast.owed, 1);
    // Two time constants in, roughly an eighth is left, whatever the framerate.
    expect(slow.left / slow.owed).toBeLessThan(0.2);
  });

  it("cuts rather than slides when the server moves the player metres", () => {
    // A spawn, a teleport or a real lag spike. Sliding the camera through the map to catch up would
    // be a worse lie than the cut, so the offset is refused outright.
    const { p, dispose } = makePlayer();
    for (let i = 0; i < 4; i++) p.update(16.7);
    p.reconcile(serverSays(p.body.x + 12, p.body.y, p.body.z + 8, { vx: 0, vy: 0, vz: 0, grounded: true, crouching: false }), 1);
    expect(p.viewError).toBe(0);
    dispose();
  });

  it("leaves the shooting eye on the body, not on the smoothed camera", () => {
    // Whatever the camera is doing, a shot leaves from where the server thinks the player is —
    // otherwise smoothing a correction would quietly change where bullets come from.
    const { p, dispose } = makePlayer();
    for (let i = 0; i < 4; i++) p.update(16.7);
    p.reconcile(serverSays(p.body.x + 0.3, p.body.y, p.body.z, { vx: 0, vy: 0, vz: 0, grounded: true, crouching: false }), 1);
    p.update(16.7);
    expect(p.viewError).toBeGreaterThan(0.01); // the camera is mid-catch-up
    const eye: [number, number, number] = [0, 0, 0];
    p.eyePosition(eye);
    expect(eye[0]).toBeCloseTo(p.body.x, 6);
    expect(eye[1]).toBeCloseTo(p.body.y + PLAYER.eyeHeight, 6);
    expect(eye[2]).toBeCloseTo(p.body.z, 6);
    dispose();
  });
});
