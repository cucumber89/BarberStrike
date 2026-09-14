import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewmodel, kickFor } from "./Viewmodel";
import type { LocalPlayer } from "../player/LocalPlayer";

/**
 * The gun has to move the same way on every screen. Every blend in the pose loop used to be a
 * fraction of the remaining distance PER FRAME, and the mouse sway an impulse per frame, so a
 * 30 fps laptop and a 144 fps desktop showed different equip raises, different settle times and
 * (worst) a sway 4.8× bigger on the slow one for the same flick. This drives one identical
 * second of play at three frame rates and asserts the gun ends up in the same place.
 */
function rig() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  const local = {
    weapon: "rifle", yaw: 0, pitch: 0, aimBlend: 0, lean: 0, bipod: false,
    body: { vx: 0, vy: 0, vz: 0, grounded: true, crouching: false },
    isSprinting: () => false, isTacSprinting: () => false,
  };
  const vm = new Viewmodel(scene, camera, local as unknown as LocalPlayer);
  const root = scene.getTransformNodeByName("viewmodel")!;
  return { vm, local, root, dispose: () => { vm.dispose(); scene.dispose(); engine.dispose(); } };
}

/** One second of play: an equip, a turn of the view, two shots, a landing, then a settle. */
function play(hz: number) {
  const r = rig();
  const dt = 1000 / hz;
  r.vm.setWeapon("rifle", true);
  let t = 0;
  while (t < 1000) {
    // A 90°/s turn for the first 300 ms (the sway is driven by the view's own motion).
    if (t < 300) r.local.yaw += (Math.PI / 2) * (dt / 1000);
    if (t >= 400 && t < 400 + dt) r.vm.onFire();
    if (t >= 500 && t < 500 + dt) r.vm.onFire();
    if (t >= 650 && t < 650 + dt) r.vm.onLanded(6);
    r.vm.update(dt);
    t += dt;
  }
  const out = { pos: r.root.position.clone(), rot: r.root.rotation.clone() };
  r.dispose();
  return out;
}

describe("viewmodel at 30 / 60 / 144 fps", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lands in the same pose after the same second of play", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // the roll and snap jitter are seeded per shot
    const a = play(30), b = play(60), c = play(144);
    for (const [name, x, y] of [["30 vs 60", a, b], ["60 vs 144", b, c]] as const) {
      expect(Math.abs(x.pos.x - y.pos.x), `${name} x`).toBeLessThan(0.002);
      expect(Math.abs(x.pos.y - y.pos.y), `${name} y`).toBeLessThan(0.002);
      expect(Math.abs(x.pos.z - y.pos.z), `${name} z`).toBeLessThan(0.002);
      expect(Math.abs(x.rot.x - y.rot.x), `${name} rx`).toBeLessThan(0.01);
      expect(Math.abs(x.rot.y - y.rot.y), `${name} ry`).toBeLessThan(0.01);
      expect(Math.abs(x.rot.z - y.rot.z), `${name} rz`).toBeLessThan(0.01);
    }
  });

  it("the sway from a flick is the same size whatever the frame rate", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const peak = (hz: number) => {
      const r = rig();
      const dt = 1000 / hz;
      for (let i = 0; i < 2000 / dt; i++) r.vm.update(dt); // settle the pose first: the raise is not the sway
      const rest = r.root.rotation.y;
      let t = 0, maxRy = 0;
      while (t < 400) {
        if (t < 100) r.local.yaw += 6 * (dt / 1000); // a fast 34° flick over 100 ms
        r.vm.update(dt);
        maxRy = Math.max(maxRy, Math.abs(r.root.rotation.y - rest));
        t += dt;
      }
      r.dispose();
      return maxRy;
    };
    const slow = peak(30), fast = peak(144);
    expect(slow).toBeGreaterThan(0.002); // there IS a sway (it is a hint of weight, not a swing)
    expect(Math.abs(slow - fast) / fast).toBeLessThan(0.25);
  });
});

describe("the gun's kick follows the weapon's recoil", () => {
  it("is ordered like the roster and clamped to the old heavy bucket", () => {
    const light = kickFor(0.006), rifle = kickFor(0.013), dmr = kickFor(0.057), sniper = kickFor(0.09), cannon = kickFor(0.2);
    expect(light.up).toBeLessThan(rifle.up);
    expect(rifle.up).toBeLessThan(dmr.up);
    expect(dmr.up).toBeLessThan(sniper.up);
    expect(sniper.up).toBeCloseTo(0.08, 5);
    expect(cannon.up).toBeCloseTo(sniper.up, 5);
    expect(light.up).toBeGreaterThan(0.02); // a 6 mrad machine pistol still visibly moves
  });
});

describe("aimed, the sights stay on the axis", () => {
  it("a shot barely rotates the gun in ADS, and still pushes it back", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const rotate = (aim: number) => {
      const r = rig();
      r.local.aimBlend = aim;
      for (let i = 0; i < 60; i++) r.vm.update(16.7); // settle into the pose
      const rx0 = r.root.rotation.x, z0 = r.root.position.z;
      r.vm.onFire();
      r.vm.update(16.7); r.vm.update(16.7);
      const out = { drx: Math.abs(r.root.rotation.x - rx0), dz: z0 - r.root.position.z };
      r.dispose();
      return out;
    };
    const hip = rotate(0), ads = rotate(1);
    expect(ads.drx).toBeLessThan(hip.drx * 0.25);
    expect(ads.dz).toBeGreaterThan(0.003);       // the shove along the barrel is kept
  });
});
