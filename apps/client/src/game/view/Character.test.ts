import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { HAIRCUTS, SHAVE_STAGES, encodeHaircut, haircutLook } from "@frankibarber/shared";
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
  it("keeps another bot's shared materials when a player leaves", () => {
    const s = scene(), a = new Character(s, 0, "leaving"), b = new Character(s, 0, "remaining");
    const materials = b.allMeshes.map(m => m.material).filter(Boolean);
    a.dispose();
    expect(materials.every(m => s.materials.includes(m!))).toBe(true);
    b.update(input(), 16);
    expect(b.allMeshes.some(m => m.isEnabled())).toBe(true);
    b.dispose(); s.dispose();
  });
  it("builds carried weapons on demand and keeps the body visible after respawn", () => {
    const s = scene(), c = new Character(s, 0, "loadout");
    const before = s.meshes.length;
    c.update(input({ weapon: "pistol" }), 16);
    const after = s.meshes.length;
    expect(after).toBeGreaterThan(before);
    c.update(input({ weapon: "rifle" }), 16);
    c.update(input({ weapon: "pistol" }), 16);
    expect(s.meshes.length).toBe(after);
    c.revive();
    run(c, input({ weapon: "smg" }), 60);
    expect(c.allMeshes.filter(m => m.isEnabled()).every(m => m.visibility === 1)).toBe(true);
    expect(c.allMeshes.filter(m => m.isEnabled()).length).toBeGreaterThan(20);
    c.dispose(); s.dispose();
  });
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

/**
 * Drop E: the hair is geometry, so it is measured rather than eyeballed — the same rule the repo
 * applies to weapon attachments and map props ("nothing floats"). Every assertion below is in the
 * head's local space, which is where the head is built: the skull box spans y 0…0.24, x ±0.11 and
 * z ±0.12, and the goggle frame's top edge — the thing a fringe must not bury — sits at y 0.1925.
 */
const SKULL_TOP = 0.24, SKULL_BOTTOM = 0, SKULL_FRONT = 0.12, GOGGLE_TOP = 0.1925;

const hairMesh = (c: Character) => c.allMeshes.find((m) => m.name === "hair");
const named = (c: Character, n: string) => c.allMeshes.find((m) => m.name === n)!;

/** Hair vertices in head-local space (the mesh hangs off the head joint, unrotated and unscaled). */
function hairVerts(c: Character): { x: number; y: number; z: number }[] {
  const m = hairMesh(c)!;
  const p = m.getVerticesData(VertexBuffer.PositionKind)!;
  const out = [];
  for (let i = 0; i < p.length; i += 3) out.push({ x: p[i] + m.position.x, y: p[i + 1] + m.position.y, z: p[i + 2] + m.position.z });
  return out;
}

/**
 * The x-ranges the hair actually covers above `minY`, as merged intervals over the triangles that
 * lie entirely above it. Two intervals = a strip of bald scalp between two ridges; the beveled box
 * has no vertices in its own middle, so counting vertex gaps would prove nothing — this measures
 * covered surface instead.
 */
function xIslands(c: Character, minY: number): [number, number][] {
  const m = hairMesh(c)!;
  const p = m.getVerticesData(VertexBuffer.PositionKind)!, idx = m.getIndices()!;
  const spans: [number, number][] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]];
    if (Math.min(...t.map((v) => p[v * 3 + 1] + m.position.y)) <= minY) continue;
    const xs = t.map((v) => p[v * 3] + m.position.x);
    spans.push([Math.min(...xs), Math.max(...xs)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

describe("Character haircuts", () => {
  const shaveValues = SHAVE_STAGES.map((_, i) => encodeHaircut("buzz", i + 1));

  it("every haircut and every shave stage builds hair that sits on the skull", () => {
    for (const value of [...HAIRCUTS.map((h) => h.id), ...shaveValues, encodeHaircut("bowl", 9)]) {
      const s = scene(), c = new Character(s, 0, `cut_${value}`);
      expect(() => c.update(input({ haircut: value }), 16)).not.toThrow();
      const style = haircutLook(value).style;
      const hasHair = style.crown > 0 || style.sides > 0 || style.fringe > 0 || style.tuft > 0;
      expect(!!hairMesh(c)).toBe(hasHair);
      if (!hasHair) { c.dispose(); s.dispose(); continue; }
      const v = hairVerts(c);
      const minY = Math.min(...v.map((p) => p.y)), maxY = Math.max(...v.map((p) => p.y));
      // Touching or overlapping the skull, never hovering over it and never down into the torso.
      expect(minY).toBeLessThanOrEqual(SKULL_TOP);
      expect(minY).toBeGreaterThanOrEqual(SKULL_BOTTOM);
      expect(maxY).toBeGreaterThan(SKULL_TOP);
      // Anything forward of the skull's face is a fringe, and a fringe clears the goggles.
      for (const p of v) if (p.z > SKULL_FRONT) expect(p.y).toBeGreaterThan(GOGGLE_TOP);
      c.dispose(); s.dispose();
    }
  });

  it("a clipper track mows a measurable bald strip through the crown", () => {
    // PODCIĘCIE, the first shave stage: one strip taken out of an otherwise whole head of hair.
    // (This used to measure IROKEZ, which was written as a `track` and therefore rendered as its
    // own inverse — bald down the middle. A mohawk is a ridge LEFT; see the test below.)
    const cut = scene(), done = new Character(cut, 0, "done");
    done.update(input({ haircut: encodeHaircut("bowl", 1) }), 16);
    const ridges = xIslands(done, 0.26);
    expect(ridges.length).toBe(2);
    const gap = ridges[1][0] - ridges[0][1];
    expect(gap).toBeCloseTo(haircutLook(encodeHaircut("bowl", 1)).style.track, 3);
    const whole = scene(), pomp = new Character(whole, 0, "pompadour");
    pomp.update(input({ haircut: "pompadour" }), 16);
    const solid = xIslands(pomp, 0.26);
    expect(solid.length).toBe(1);
    // The track is exactly what it removes: hair left = the full crown minus the mown strip. That
    // is a stronger claim than "thinner", and it holds for every stage rather than only the widest.
    const covered = (r: [number, number][]) => r.reduce((a, [lo, hi]) => a + hi - lo, 0);
    expect(covered(solid) - covered(ridges)).toBeCloseTo(haircutLook(encodeHaircut("bowl", 1)).style.track, 3);
    // RUINA, the worst shave stage: the widest track of all, two slivers of hair left at the edges
    // and the stray tuft standing in the middle of the mown strip — three islands, not one crown.
    const worst = new Character(whole, 0, "ruined");
    worst.update(input({ haircut: encodeHaircut("bowl", 4) }), 16);
    const ruin = xIslands(worst, SKULL_TOP + 0.005);
    expect(ruin.length).toBe(3);
    expect(covered(ruin)).toBeLessThan(0.1);                         // of the crown's 0.222 m
  });


  it("a mohawk is one narrow ridge of hair, not a bald strip", () => {
    // The review caught IROKEZ rendering as its own inverse. A mohawk and a shave are opposites:
    // one leaves a strip standing, the other takes one away, and both are measured the same way.
    const s = scene(), c = new Character(s, 0, "mohawk");
    c.update(input({ haircut: "mohawk" }), 16);
    const islands = xIslands(c, 0.26);
    expect(islands.length).toBe(1);
    const width = islands[0][1] - islands[0][0];
    expect(width).toBeCloseTo(haircutLook("mohawk").style.width, 3);
    // Narrow enough to read as a ridge, and it stands taller than any full covering.
    expect(width).toBeLessThan(0.09);
    const v = hairVerts(c);
    expect(Math.max(...v.map((p) => p.y))).toBeGreaterThan(SKULL_TOP + 0.1);
    c.dispose(); s.dispose();
  });

  it("the cap comes off for a haircut, and a shaved scalp beats both", () => {
    const s = scene(), c = new Character(s, 0, "capped");
    c.update(input(), 16);
    expect(named(c, "cap_merged").isEnabled()).toBe(true);           // default look: the shop cap
    expect(hairMesh(c)).toBeUndefined();
    c.update(input({ haircut: "bowl" }), 16);
    expect(named(c, "cap_merged").isEnabled()).toBe(false);
    expect(hairMesh(c)!.isEnabled()).toBe(true);
    c.update(input({ haircut: "bowl", shaved: true }), 16);
    expect(hairMesh(c)!.isEnabled()).toBe(false);
    expect(named(c, "bare_head").isEnabled()).toBe(true);
    expect(named(c, "cap_merged").isEnabled()).toBe(false);
    c.update(input({ haircut: "bowl" }), 16);                       // and it comes back
    expect(hairMesh(c)!.isEnabled()).toBe(true);
    expect(named(c, "bare_head").isEnabled()).toBe(false);
  });

  it("re-cuts only when the field changes and leaks nothing", () => {
    const s = scene(), c = new Character(s, 0, "regrow");
    c.update(input(), 16);
    const bald = s.meshes.length;
    c.update(input({ haircut: "pompadour" }), 16);
    expect(s.meshes.length).toBe(bald + 1);                          // one merged mesh, one draw call
    for (const v of ["bowl", "mohawk", "bleach", "topknot", ...shaveValues]) c.update(input({ haircut: v }), 16);
    expect(s.meshes.length).toBe(bald + 1);
    run(c, input({ haircut: "curtains" }), 60);                      // a minute of frames, no rebuild
    expect(s.meshes.length).toBe(bald + 1);
    c.update(input({ haircut: "cap" }), 16);
    expect(s.meshes.length).toBe(bald);                              // no hair, no extra mesh at all
    c.dispose();
    expect(s.meshes.length).toBeLessThan(bald);
  });

  it("an unknown or empty haircut falls back to the default instead of throwing", () => {
    const s = scene(), c = new Character(s, 0, "junk");
    for (const v of ["", "nonsense", "buzz#abc", "#4", "cap#0", "buzz#-3"]) {
      expect(() => c.update(input({ haircut: v }), 16)).not.toThrow();
    }
    c.update(input({ haircut: "bleach" }), 16);                     // a real one still cuts
    expect(hairMesh(c)!.material!.name).toContain("ch_bleach");
    c.update(input({ haircut: "wig-of-lies" }), 16);                // ...and a lie is back to the cap
    expect(hairMesh(c)).toBeUndefined();
    expect(named(c, "cap_merged").isEnabled()).toBe(true);
  });
});
