import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MAPS, PLAYER, aimDirection, buildCollisionWorld, wrapAngle } from "@frankibarber/shared";
import { DEATH_CAM, deathCamPose, faceTo, startDeathCam, type Pose } from "./deathCam";
import { LocalPlayer } from "./LocalPlayer";
import type { InputState } from "../input/InputState";

/**
 * The death cam (UI_U_SPEC §7 P1 (i)): the eye falls 0.9 m in 400 ms and turns to the killer in
 * 600 ms, and the spawn gives the player back EXACTLY the view they would have had without it.
 */
const deg = (r: number) => (r * 180) / Math.PI;
const pose = (): Pose => ({ x: 0, y: PLAYER.eyeHeight, z: 0, yaw: 0, pitch: 0 });

describe("death cam", () => {
  it("faces the killer within 1° after 600 ms", () => {
    // The killer stands behind and to the left, on a step: the turn is the long one.
    const killer = { x: -6, y: 0.4, z: -9 };
    const cam = startDeathCam(pose(), 0, 1_000);
    const out = pose();
    deathCamPose(cam, killer, 1_000 + DEATH_CAM.turnMs, out);
    const want = faceTo(out, { x: killer.x, y: killer.y + DEATH_CAM.aimAtM, z: killer.z });
    expect(Math.abs(deg(wrapAngle(out.yaw - want.yaw)))).toBeLessThan(1);
    expect(Math.abs(deg(out.pitch - want.pitch))).toBeLessThan(1);
    // …and the view vector really points at the killer's eye: the angle between them is under 1°.
    const d: [number, number, number] = [0, 0, 0];
    aimDirection(out.yaw, out.pitch, d);
    const tx = killer.x - out.x, ty = killer.y + DEATH_CAM.aimAtM - out.y, tz = killer.z - out.z;
    const cos = (d[0] * tx + d[1] * ty + d[2] * tz) / Math.hypot(tx, ty, tz);
    expect(deg(Math.acos(Math.min(1, cos)))).toBeLessThan(1);
    // Half-way it is still turning (a turn, not a cut), the short way round.
    deathCamPose(cam, killer, 1_000 + DEATH_CAM.turnMs / 2, out);
    expect(Math.abs(wrapAngle(out.yaw - want.yaw))).toBeGreaterThan(0.05);
    // A killer who moves after the kill is followed: the view keeps facing them.
    deathCamPose(cam, { x: 8, y: 0, z: 2 }, 5_000, out);
    expect(Math.abs(deg(wrapAngle(out.yaw - Math.atan2(8, 2))))).toBeLessThan(1);
  });

  it("eye drop reaches 0.9 m at 400 ms", () => {
    const from = pose();
    const cam = startDeathCam(from, 0, 0);
    const out = pose();
    expect(deathCamPose(cam, null, 0, out).y).toBe(from.y);
    expect(deathCamPose(cam, null, 200, out).y, "falling").toBeLessThan(from.y);
    expect(deathCamPose(cam, null, DEATH_CAM.dropMs, out).y).toBeCloseTo(from.y - 0.9, 9);
    expect(deathCamPose(cam, null, 3_000, out).y, "and stays down").toBeCloseTo(from.y - 0.9, 9);
    // A self-kill (no killer) only falls: the view does not turn, roll or zoom.
    expect(out.yaw).toBe(from.yaw);
    expect(out.pitch).toBe(from.pitch);
    // A crouched death has less to fall: the eye stops above the feet, never under the floor.
    const low = startDeathCam({ ...from, y: 10 + PLAYER.crouchEyeHeight }, 10, 0);
    expect(deathCamPose(low, null, 400, out).y).toBeCloseTo(10 + Math.max(DEATH_CAM.minEyeM, PLAYER.crouchEyeHeight - 0.9), 9);
  });

  it("spawn restores the pose exactly", () => {
    // Two real local players, the same history — except that A dies under the death cam for two
    // seconds while B lies dead the way every player did before drop U. Both then spawn on the same
    // spot. If the death cam left anything behind (a yaw, a pitch, an eye height, a roll), A's
    // camera would differ from B's on the first frame of the new life.
    const map = MAPS[Object.keys(MAPS)[0]];
    const world = buildCollisionWorld(map);
    const input = { buttons: () => 0, consumeMouse: (m: { dx: number; dy: number }) => { m.dx = 0; m.dy = 0; }, pointerLocked: true } as unknown as InputState;
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const make = () => new LocalPlayer(scene, world, input, { sensitivity: 1, invertY: false, fov: 90, bobScale: 0.6, shakeScale: 0.6 });
      const a = make(), b = make();
      const sp = map.spawns[0], sp2 = map.spawns[1];
      for (const p of [a, b]) { p.spawnAt(sp.x, sp.y, sp.z, sp.yaw); p.pitch = 0.2; for (let i = 0; i < 10; i++) p.update(16); p.alive = false; }
      const cam = startDeathCam({ x: a.camera.position.x, y: a.camera.position.y, z: a.camera.position.z, yaw: a.camera.rotation.y, pitch: a.camera.rotation.x }, a.body.y, 0);
      const view = pose();
      let moved = false;
      for (let i = 0; i < 125; i++) {
        a.deadView = deathCamPose(cam, { x: sp.x + 5, y: sp.y, z: sp.z - 7 }, i * 16, view);
        a.update(16); b.update(16);
        moved ||= Math.abs(a.camera.position.y - b.camera.position.y) > 0.5;
      }
      expect(moved, "the death cam did move A's camera").toBe(true);
      for (const p of [a, b]) { p.spawnAt(sp2.x, sp2.y, sp2.z, sp2.yaw); p.update(16); }
      expect(a.deadView).toBeNull();
      expect([a.camera.position.x, a.camera.position.y, a.camera.position.z]).toEqual([b.camera.position.x, b.camera.position.y, b.camera.position.z]);
      expect([a.camera.rotation.x, a.camera.rotation.y, a.camera.rotation.z]).toEqual([b.camera.rotation.x, b.camera.rotation.y, b.camera.rotation.z]);
      expect([a.yaw, a.pitch, a.camera.fov]).toEqual([b.yaw, b.pitch, b.camera.fov]);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
