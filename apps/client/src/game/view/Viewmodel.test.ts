import { describe, expect, it } from "vitest";
import { WEAPON_ORDER } from "@frankibarber/shared";
import { reloadFrame, Viewmodel } from "./Viewmodel";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { LocalPlayer } from "../player/LocalPlayer";

it("keeps magazines seated in their authored position when equipping", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  const vm = new Viewmodel(scene, camera, { weapon: "pistol" } as LocalPlayer);
  const mag = scene.getTransformNodeByName("vm_pistol_mag")!;
  expect(mag.position.y).toBeCloseTo(-0.05);
  vm.setWeapon("rifle", false);
  vm.setWeapon("pistol", false);
  expect(mag.position.y).toBeCloseTo(-0.05);
  vm.dispose(); scene.dispose(); engine.dispose();
});

/** Weapons whose reload drops a detachable magazine / belt box (`f.mag` travels). */
const MAG_FED = ["pistol", "smg", "smg2", "rifle", "dmr", "sniper", "lmg"] as const;

/** The reload choreography is a pure function of progress: assert its shape per weapon. */
describe("reloadFrame", () => {
  it("starts and ends at rest for every weapon (no pop when the animation begins or ends)", () => {
    for (const w of WEAPON_ORDER) {
      for (const t of [0, 1]) {
        const f = reloadFrame(w, t);
        // Math.abs: an amplitude times a zero bump is -0, which `toBe(0)` (Object.is) rejects.
        expect(Math.abs(f.y), `${w}@${t} y`).toBe(0);
        expect(Math.abs(f.x), `${w}@${t} x`).toBe(0);
        expect(Math.abs(f.rz), `${w}@${t} rz`).toBe(0);
        expect(Math.abs(f.mag), `${w}@${t} mag`).toBe(0);
        expect(Math.abs(f.handL), `${w}@${t} hand`).toBe(0);
        // The pistol's slide is locked back from the first frame (the reload starts on an empty
        // gun); every other action part starts closed, and all of them end closed.
        if (!(w === "pistol" && t === 0)) expect(Math.abs(f.action), `${w}@${t} action`).toBe(0);
      }
    }
  });

  it("raises the gun while the magazine is out, so the dropped mag stays inside a 16:9 frame", () => {
    // Art review (three rounds): a reload that lowered the gun and dropped the mag straight down
    // pushed the mag out of the bottom of the frame. At the mid-frame the e2e evidence set captures
    // (t ≈ 0.4) the gun must be lifted, pulled toward the centre, canted underside-to-eye, with the
    // mag fully out.
    for (const w of MAG_FED) {
      const f = reloadFrame(w, 0.4);
      expect(f.y, `${w} y`).toBeGreaterThan(0.01);
      expect(f.mag, `${w} mag`).toBeGreaterThan(0.9);
      expect(f.x, `${w} x`).toBeLessThan(0);
      expect(f.rz, `${w} rz`).toBeLessThan(-0.5);
    }
  });

  it("never lowers the gun below the hip through the mag-out / reach window", () => {
    // t 0.1–0.8 is where the mag is out and the hand is reaching. The seat slams inside it (rifle
    // family 0.72–0.82, smg2 0.62–0.72, lmg 0.78–0.84) are ≤ 2 cm on top of the lift, so the gun
    // grazes the hip by a few millimetres at most — never the old 4–7 cm drop that took the mag out
    // of the frame. The late snap-shut beats (launcher 0.84–0.92, revolver 0.9–0.98) are the
    // closing accent and may dip once the lift has faded.
    for (const w of WEAPON_ORDER) {
      for (let t = 0.1; t <= 0.8; t += 0.01) expect(reloadFrame(w, t).y, `${w}@${t.toFixed(2)} y`).toBeGreaterThanOrEqual(-0.005);
    }
  });

  it("the left hand's reach stays a visible reach (never the full 28 cm dive toward the lens)", () => {
    for (const w of WEAPON_ORDER) {
      let peak = 0;
      for (let t = 0; t <= 1; t += 0.005) peak = Math.max(peak, reloadFrame(w, t).handL);
      if (w === "clippers") { expect(peak).toBe(0); continue; }
      expect(peak, `${w} handL peak`).toBeGreaterThan(0.4);
      // The revolver's peak is exactly 0.45 + 0.3; give the float sum a hair of room.
      expect(peak, `${w} handL peak`).toBeLessThanOrEqual(0.75 + 1e-9);
    }
  });

  it("the revolver rolls hard so the cylinder side faces the eye", () => {
    expect(reloadFrame("revolver", 0.5).rz).toBeLessThan(-0.9);
    expect(reloadFrame("revolver", 0.5).y).toBeGreaterThan(0.03);
  });

  it("detachable magazines leave fully, stay out, and come back before the action cycles", () => {
    for (const w of ["pistol", "smg", "rifle", "dmr"] as const) {
      const out = reloadFrame(w, 0.45);
      expect(out.mag, w).toBeGreaterThan(0.95);
      const back = reloadFrame(w, 0.8);
      expect(back.mag, w).toBeLessThan(0.05);
      // The action beat (charging handle / bolt) happens after the mag is seated. The pistol's slide
      // is locked back for the whole reload instead (own test below).
      if (w === "pistol") continue;
      let firstAction = -1;
      for (let t = 0.5; t <= 1; t += 0.01) if (reloadFrame(w, t).action > 0.5) { firstAction = t; break; }
      expect(firstAction, w).toBeGreaterThan(0.7);
    }
  });

  it("the pistol slide stays locked back until the release", () => {
    expect(reloadFrame("pistol", 0.3).action).toBe(1);
    expect(reloadFrame("pistol", 0.6).action).toBe(1);
    expect(reloadFrame("pistol", 0.95).action).toBeLessThan(0.05);
  });

  it("the shotgun loads shell by shell: one hand dip per shell, pump at the end", () => {
    const shells = 6;
    let dips = 0, prev = 0, rising = false;
    for (let t = 0; t <= 1; t += 0.002) {
      const h = reloadFrame("shotgun", t, shells).handL;
      if (h > prev && !rising) rising = true;
      if (h < prev && rising) { dips++; rising = false; }
      prev = h;
    }
    expect(dips).toBe(shells);
    expect(reloadFrame("shotgun", 0.5, shells).mag).toBe(0);      // no detachable mag
    expect(reloadFrame("shotgun", 0.95, shells).action).toBeGreaterThan(0.5);
    // Rolled to show the loading gate: it is on the receiver's underside, and in camera space
    // (+X right, gun held right of the eye) a NEGATIVE roll turns the underside toward the lens —
    // the old positive roll showed the ejection-port side instead.
    expect(reloadFrame("shotgun", 0.5, shells).rz).toBeLessThan(-0.3);
    expect(reloadFrame("shotgun", 0.5, shells).y).toBeGreaterThan(0.02);
  });

  it("the DMR bolt goes back and returns after the magazine", () => {
    expect(reloadFrame("dmr", 0.6).action).toBe(0);
    expect(reloadFrame("dmr", 0.84).action).toBeGreaterThan(0.95);
    expect(reloadFrame("dmr", 0.99).action).toBeLessThan(0.1);
  });
});
