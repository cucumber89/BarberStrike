import { describe, expect, it } from "vitest";
import { WEAPON_ORDER } from "@frankibarber/shared";
import { reloadFrame } from "./Viewmodel";

/** The reload choreography is a pure function of progress: assert its shape per weapon. */
describe("reloadFrame", () => {
  it("starts and ends at rest for every weapon (no pop when the animation begins or ends)", () => {
    for (const w of WEAPON_ORDER) {
      for (const t of [0, 1]) {
        const f = reloadFrame(w, t);
        expect(Math.abs(f.y), `${w}@${t} y`).toBeLessThan(0.01);
        expect(Math.abs(f.rz), `${w}@${t} rz`).toBeLessThan(0.05);
        expect(f.mag, `${w}@${t} mag`).toBeLessThan(0.05);
        expect(f.handL, `${w}@${t} hand`).toBeLessThan(0.05);
      }
    }
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
    expect(reloadFrame("shotgun", 0.5, shells).rz).toBeGreaterThan(0.3); // rolled to show the port
  });

  it("the DMR bolt goes back and returns after the magazine", () => {
    expect(reloadFrame("dmr", 0.6).action).toBe(0);
    expect(reloadFrame("dmr", 0.84).action).toBeGreaterThan(0.95);
    expect(reloadFrame("dmr", 0.99).action).toBeLessThan(0.1);
  });
});
