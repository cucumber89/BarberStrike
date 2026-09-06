import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Character, type CharacterInput } from "./Character";

/**
 * Animation is tested on Babylon's NullEngine (no GPU, no DOM): the same joint math runs, and
 * the pose is asserted numerically. This is the check that screenshots under SwiftShader could
 * never give — a walk cycle that visibly moves, a flinch that points away from the shot, a death
 * that falls away from the killer.
 */

const scene = () => new Scene(new NullEngine());
const input = (over: Partial<CharacterInput> = {}): CharacterInput =>
  ({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "rifle", moveDir: 0, ...over });
const run = (c: Character, inp: CharacterInput, frames: number, dt = 16.7) => { for (let i = 0; i < frames; i++) c.update(inp, dt); };

describe("Character animation", () => {
  it("idle is nearly still; running swings legs and counter-swings the arms", () => {
    const c = new Character(scene(), 0, "a");
    run(c, input(), 60);
    const idle = c.pose();
    expect(Math.abs(idle.legR)).toBeLessThan(0.05);
    const legs: number[] = [], arms: number[] = [];
    const inp = input({ speed: 6 });
    for (let i = 0; i < 60; i++) { c.update(inp, 16.7); const p = c.pose(); legs.push(p.legR); arms.push(p.armR); }
    const legRange = Math.max(...legs) - Math.min(...legs);
    const armRange = Math.max(...arms) - Math.min(...arms);
    expect(legRange).toBeGreaterThan(0.8);       // a real stride, not a shuffle
    expect(armRange).toBeGreaterThan(0.05);      // arms move with the stride (new in 1.0)
    expect(armRange).toBeLessThan(legRange);     // ...but the weapon stays roughly on target
  });

  it("legs alternate: when the right leg is forward the left is back", () => {
    const c = new Character(scene(), 0, "b");
    const inp = input({ speed: 5 });
    let opposite = 0, total = 0;
    for (let i = 0; i < 90; i++) { c.update(inp, 16.7); const p = c.pose(); if (Math.abs(p.legR) > 0.2) { total++; if (Math.sign(p.legR) !== Math.sign(p.legL)) opposite++; } }
    expect(total).toBeGreaterThan(20);
    expect(opposite).toBe(total);
  });

  it("crouch lowers the torso and bends the knees", () => {
    const c = new Character(scene(), 0, "c");
    run(c, input(), 30);
    const up = c.pose();
    run(c, input({ crouch: true }), 60);
    const down = c.pose();
    expect(down.shinR).toBeGreaterThan(up.shinR + 0.5);
    expect(down.torsoX).toBeGreaterThan(up.torsoX + 0.2);
  });

  it("landing after a fall squashes the knees, then recovers", () => {
    const c = new Character(scene(), 0, "d");
    run(c, input(), 30);
    run(c, input({ grounded: false }), 40);           // ~0.67 s in the air
    c.update(input({ grounded: true }), 16.7);
    const landed = c.pose();
    run(c, input(), 90);
    const later = c.pose();
    expect(landed.shinR).toBeGreaterThan(later.shinR + 0.3);
  });

  it("a flinch turns the head and torso away from the shooter and decays", () => {
    const c = new Character(scene(), 0, "e");
    run(c, input(), 30);
    // Shooter to the character's right (+X in local space when yaw = 0).
    c.flinch(1, 0, false);
    c.update(input(), 16.7);
    const hit = c.pose();
    expect(hit.headY).toBeGreaterThan(0.2);
    expect(hit.torsoY).toBeGreaterThan(0.1);
    run(c, input(), 90);
    expect(Math.abs(c.pose().headY)).toBeLessThan(0.03);
  });

  it("a head shot flinches harder than a body shot", () => {
    const a = new Character(scene(), 0, "f"), b = new Character(scene(), 0, "g");
    run(a, input(), 30); run(b, input(), 30);
    a.flinch(0, 1, false); b.flinch(0, 1, true);
    a.update(input(), 16.7); b.update(input(), 16.7);
    expect(Math.abs(b.pose().headX)).toBeGreaterThan(Math.abs(a.pose().headX));
  });

  it("death falls AWAY from the killer and ends lying down", () => {
    const c = new Character(scene(), 1, "h");
    run(c, input(), 30);
    c.die(0, 1);                                      // killer in front (+Z) → falls backwards (−Z)
    run(c, input({ alive: false }), 80);              // 1.3 s > DEATH_MS
    const p = c.pose();
    expect(p.rootX).toBeLessThan(-1.2);               // tipped over backwards (about the X axis)
    expect(Math.abs(p.rootZ)).toBeLessThan(0.2);
    expect(c.dying).toBe(true);
    c.die(1, 0);                                      // a second call must not restart the fall
    c.update(input({ alive: false }), 16.7);
    expect(c.pose().rootX).toBeLessThan(-1.2);
  });

  it("a killer on the left tips the body over to the right", () => {
    const c = new Character(scene(), 1, "i");
    run(c, input(), 30);
    c.die(-1, 0);
    run(c, input({ alive: false }), 80);
    const p = c.pose();
    expect(Math.abs(p.rootZ)).toBeGreaterThan(1.2);
    expect(Math.abs(p.rootX)).toBeLessThan(0.2);
  });

  it("revive resets the pose", () => {
    const c = new Character(scene(), 1, "j");
    c.die(0, 1);
    run(c, input({ alive: false }), 80);
    c.revive();
    run(c, input(), 30);
    const p = c.pose();
    expect(Math.abs(p.rootX)).toBeLessThan(0.05);
    expect(Math.abs(p.rootZ)).toBeLessThan(0.05);
    expect(c.dying).toBe(false);
  });
});
