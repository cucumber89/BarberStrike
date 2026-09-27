import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EMOTES, emoteDef } from "@frankibarber/shared";
import { emotePose, emptyEmotePose, hasDance } from "./emotePose";
import { Character } from "./Character";

/** Every joint value of a pose, flattened, so two poses can be compared as numbers. */
const flat = (p: ReturnType<typeof emptyEmotePose>) => [
  p.hipsY, p.hipsX, p.hipsRotX, p.hipsRotZ, p.torsoX, p.torsoY, p.torsoZ, p.headX, p.headY, p.headZ,
  ...p.armR, ...p.foreR, ...p.armL, ...p.foreL, ...p.legR, ...p.legL, p.shinR, p.shinL,
];

describe("the dances on H", () => {
  it("every catalog entry has a dance, finite at every instant, that actually moves", () => {
    for (const e of EMOTES) {
      expect(hasDance(e.id), e.id).toBe(true);
      const loop = e.loopMs / 1000;
      const samples = Array.from({ length: 24 }, (_, i) => flat(emotePose(e.id, (i / 24) * loop, emptyEmotePose())));
      for (const s of samples) expect(s.every(Number.isFinite), e.id).toBe(true);
      const spread = samples[0].map((_, j) => Math.max(...samples.map((s) => s[j])) - Math.min(...samples.map((s) => s[j])));
      // Wiatrak's motion is mostly the spin, which is not in `flat`; the rest must move a joint visibly.
      if (e.id !== "wiatrak") expect(Math.max(...spread), `${e.id} is a still pose`).toBeGreaterThan(0.2);
    }
  });

  it("loops: the pose at t and at t + one loop are the same", () => {
    for (const e of EMOTES) {
      const loop = e.loopMs / 1000;
      for (const t of [0.05, 0.37 * loop]) {
        const a = flat(emotePose(e.id, t, emptyEmotePose())), b = flat(emotePose(e.id, t + loop, emptyEmotePose()));
        a.forEach((v, j) => expect(b[j], `${e.id} joint ${j}`).toBeCloseTo(v, 6));
      }
    }
  });

  it("does not jump where the loop wraps around (a visible snap every loop)", () => {
    for (const e of EMOTES) {
      if (e.id === "robot" || e.id === "dab" || e.id === "domowka") continue; // stepped on purpose
      const loop = e.loopMs / 1000;
      const end = flat(emotePose(e.id, loop - 1e-4, emptyEmotePose())), start = flat(emotePose(e.id, 0, emptyEmotePose()));
      end.forEach((v, j) => expect(Math.abs(v - start[j]), `${e.id} joint ${j}`).toBeLessThan(0.12));
    }
  });

  it("spucha finishes with the burst: the pumping hand flung out forward and up", () => {
    const def = emoteDef("spucha");
    expect(def.rarity).toBe("legendarny");
    const pumping = emotePose("spucha", 1.0, emptyEmotePose()), burst = emotePose("spucha", 2.5, emptyEmotePose());
    expect(burst.armR[0], "the arm is thrown up well past the pumping range").toBeLessThan(pumping.armR[0] - 0.9);
    expect(burst.headX, "the head goes back").toBeLessThan(-0.4);
  });

  it("an unknown id plays the wave rather than throwing", () => {
    expect(flat(emotePose("moonwalk", 0.3, emptyEmotePose()))).toEqual(flat(emotePose("machanie", 0.3, emptyEmotePose())));
  });
});

describe("a body dancing", () => {
  const scene = () => new Scene(new NullEngine());
  const input = (emote: string, emoteMs = 0) => ({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "rifle" as const, moveDir: 0, emote, emoteMs });

  it("blends in and hands the body back when the dance ends", () => {
    const c = new Character(scene(), 0, "dancer");
    for (let i = 0; i < 60; i++) c.update(input("nitka", i * 16), 16);
    expect(c.dancing).toBeGreaterThan(0.99);
    for (let i = 0; i < 60; i++) c.update(input(""), 16);
    expect(c.dancing).toBe(0);
  });

  it("never dances dead", () => {
    const c = new Character(scene(), 1, "corpse");
    for (let i = 0; i < 30; i++) c.update({ ...input("spucha", i * 16), alive: false }, 16);
    expect(c.dancing).toBe(0);
  });
});
