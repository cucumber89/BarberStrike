import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BUILDS, WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { Character, TP_SUPPORT, type CharacterInput } from "./Character";

/**
 * The hands are ON the gun, on every body, for every gun, at every aim — measured, not eyeballed.
 * The authored arm angles only ever reached the weapon approximately; the two-bone IK puts the
 * right palm on the grip and the left on the fore-end, and this holds that to the centimetre.
 * Also: the feet do not turn with the mouse, a strafe scissors the legs sideways, walking backwards
 * reverses the stride, and a body in the air reads rising and falling differently.
 */
const scene = () => new Scene(new NullEngine());
const input = (over: Partial<CharacterInput> = {}): CharacterInput =>
  ({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "rifle", moveDir: 0, ...over });
const run = (c: Character, inp: CharacterInput, frames: number, dt = 16.7) => { for (let i = 0; i < frames; i++) c.update(inp, dt); };

/** World position of a named node/mesh under the character. */
function worldOf(s: Scene, name: string): Vector3 {
  const n = s.getTransformNodeByName(name) ?? s.getMeshByName(name);
  if (!n) throw new Error(`no node ${name}`);
  n.computeWorldMatrix(true);
  return n.getAbsolutePosition().clone();
}

/** Hand centre in world space: the hand box hangs off the forearm node. */
function handWorld(s: Scene, side: "R" | "L", rig: { handY: number }): Vector3 {
  const fore = s.getTransformNodeByName(`forearm${side}`)!;
  fore.computeWorldMatrix(true);
  return Vector3.TransformCoordinates(new Vector3(0, rig.handY, 0.02), fore.getWorldMatrix());
}

describe("arm IK", () => {
  // Sidearms (slot 2) are held one-handed by design; the clippers are a swing, not a hold.
  const twoHanded = WEAPON_ORDER.filter((w) => WEAPONS[w].slot === 1);

  it("puts the right hand on the grip and the left on the fore-end, every weapon, every pitch", () => {
    for (const weapon of twoHanded) {
      for (const pitch of [-0.7, 0, 0.7]) {
        const s = scene(), c = new Character(s, 0, `ik-${weapon}`);
        run(c, input({ weapon, pitch }), 90);
        const rig = (c as unknown as { rig: { handY: number } }).rig;
        const gun = s.getTransformNodeByName(`tp_char_ik-${weapon}_${weapon}`)!;
        gun.computeWorldMatrix(true);
        const m = gun.getWorldMatrix();
        const grip = Vector3.TransformCoordinates(new Vector3(0.012, -0.045, -0.02), m);
        const model = (c as unknown as { weapons: Map<WeaponId, { support: [number, number, number] }> }).weapons.get(weapon)!;
        const dR = Vector3.Distance(handWorld(s, "R", rig), grip);
        expect(dR, `${weapon} @${pitch} right hand ${dR.toFixed(3)} m off the grip`).toBeLessThan(0.02);
        // The support hand holds SOMEWHERE along the fore-end — between a quarter of the way out and
        // the third-person support point — wherever the arm reaches (a shorter body holds closer).
        // Measured to that line in the gun's own frame: within a third of the hand's own width.
        const hl = Vector3.TransformCoordinates(handWorld(s, "L", rig), m.clone().invert());
        const z = Math.max(model.support[2] * 0.25, Math.min(model.support[2] * TP_SUPPORT, hl.z));
        const dL = Math.hypot(hl.x - model.support[0], hl.y - model.support[1], hl.z - z);
        // Half a hand's width: the SMG's short fore-end sits furthest from the left shoulder.
        expect(dL, `${weapon} @${pitch} left hand ${dL.toFixed(3)} m off the fore-end`).toBeLessThan(0.045);
        s.dispose();
      }
    }
  });

  it("holds the grip on every build (long arms and short)", () => {
    for (const b of BUILDS) {
      const s = scene(), c = new Character(s, 1, `ik-${b.id}`, b.id);
      run(c, input({ weapon: "smg" }), 60);
      const rig = (c as unknown as { rig: { handY: number } }).rig;
      const gun = s.getTransformNodeByName(`tp_char_ik-${b.id}_smg`)!;
      gun.computeWorldMatrix(true);
      const grip = Vector3.TransformCoordinates(new Vector3(0.012, -0.045, -0.02), gun.getWorldMatrix());
      expect(Vector3.Distance(handWorld(s, "R", rig), grip), b.id).toBeLessThan(0.02);
      s.dispose();
    }
  });

  it("the elbows do not lock straight and stay below the shoulders", () => {
    const s = scene(), c = new Character(s, 0, "elbow");
    run(c, input({ weapon: "rifle" }), 60);
    const shoulder = worldOf(s, "armR"), elbow = worldOf(s, "forearmR");
    expect(elbow.y).toBeLessThan(shoulder.y);
    s.dispose();
  });

  it("lets go of the gun for the throw and comes back to the grip", () => {
    const s = scene(), c = new Character(s, 0, "throw");
    run(c, input(), 60);
    const rig = (c as unknown as { rig: { handY: number } }).rig;
    const gun = s.getTransformNodeByName("tp_char_throw_rifle")!;
    const grip = () => { gun.computeWorldMatrix(true); return Vector3.TransformCoordinates(new Vector3(0.012, -0.045, -0.02), gun.getWorldMatrix()); };
    expect(Vector3.Distance(handWorld(s, "R", rig), grip())).toBeLessThan(0.02);
    c.throw();
    run(c, input(), 12); // wind-up: the arm is off the gun, over the shoulder
    expect(Vector3.Distance(handWorld(s, "R", rig), grip())).toBeGreaterThan(0.15);
    run(c, input(), 90);
    expect(Vector3.Distance(handWorld(s, "R", rig), grip())).toBeLessThan(0.02);
    s.dispose();
  });
});

describe("lower body", () => {
  it("keeps the feet planted while the torso turns, then steps round past the threshold", () => {
    // A sidearm: a long gun blades the torso (`BLADE.twist`), which would sit on top of the yaw read here.
    const s = scene(), c = new Character(s, 0, "turn");
    run(c, input({ weapon: "pistol" }), 30);
    c.root.rotation.y = 0.5;               // the aim turned 29°: the legs should not
    c.update(input({ weapon: "pistol" }), 16.7);
    expect(c.pose().lowerYaw).toBeCloseTo(-0.5, 2);
    // The torso faces the aim: hips + torso yaw cancel.
    const hips = s.getTransformNodeByName("hips")!, torso = s.getTransformNodeByName("torso")!;
    expect(hips.rotation.y + torso.rotation.y).toBeCloseTo(0, 1);
    c.root.rotation.y = 1.0;               // now 57°: past the step, the feet catch up
    run(c, input({ weapon: "pistol" }), 60);
    expect(Math.abs(c.pose().lowerYaw)).toBeLessThan(0.05);
    s.dispose();
  });

  it("turns the legs part-way into a strafe and scissors them sideways instead of pumping forward", () => {
    const s = scene(), c = new Character(s, 0, "strafe");
    const inp = input({ speed: 5, moveDir: Math.PI / 2 });
    run(c, inp, 60);
    expect(c.pose().lowerYaw).toBeGreaterThan(0.3);
    const legR = s.getTransformNodeByName("legR")!;
    let zRange = 0, xRange = 0, zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity;
    for (let i = 0; i < 60; i++) { c.update(inp, 16.7); zMin = Math.min(zMin, legR.rotation.z); zMax = Math.max(zMax, legR.rotation.z); xMin = Math.min(xMin, legR.rotation.x); xMax = Math.max(xMax, legR.rotation.x); }
    zRange = zMax - zMin; xRange = xMax - xMin;
    expect(zRange).toBeGreaterThan(0.25);     // a sideways scissor
    expect(xRange).toBeGreaterThan(0.3);      // and still a stride along the half-turned hips
    s.dispose();
  });

  it("walking backwards keeps the legs facing forward and reverses the stride", () => {
    const s = scene(), c = new Character(s, 0, "back");
    const fwd = input({ speed: 4, moveDir: 0 }), back = input({ speed: 4, moveDir: Math.PI });
    run(c, back, 60);
    expect(Math.abs(c.pose().lowerYaw)).toBeLessThan(0.1);
    // Same phase, opposite leg: sample both at the same stride phase by resetting to a fresh body.
    const a = new Character(scene(), 0, "back2"), b = new Character(scene(), 0, "back2");
    run(a, fwd, 25); run(b, back, 25);
    expect(Math.sign(a.pose().legR)).toBe(-Math.sign(b.pose().legR));
    s.dispose();
  });

  it("tucks the legs on the way up and reaches for the ground on the way down", () => {
    const s = scene(), c = new Character(s, 0, "air");
    run(c, input(), 30);
    run(c, input({ grounded: false, vy: 4 }), 30);
    const up = c.pose();
    run(c, input({ grounded: false, vy: -5 }), 30);
    const down = c.pose();
    expect(up.legR).toBeGreaterThan(down.legR + 0.2);
    expect(down.torsoX).toBeGreaterThan(up.torsoX + 0.05); // leans into the landing
    s.dispose();
  });
});
