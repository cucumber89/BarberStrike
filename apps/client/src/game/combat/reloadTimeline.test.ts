import { describe, expect, it } from "vitest";
import { WEAPON_ORDER } from "@frankibarber/shared";
import { reloadCues, reloadFrame, type ReloadCueKind } from "./reloadTimeline";

const kinds = (w: Parameters<typeof reloadCues>[0], shells = 6, empty = true): ReloadCueKind[] => reloadCues(w, shells, empty).map((c) => c.kind);

describe("reloadCues", () => {
  it("is ordered, inside the reload, and never empty for a gun that reloads", () => {
    for (const w of WEAPON_ORDER) {
      const cues = reloadCues(w);
      if (w === "clippers") { expect(cues).toEqual([]); continue; }
      expect(cues.length, w).toBeGreaterThan(0);
      for (let i = 0; i < cues.length; i++) {
        expect(cues[i].t, `${w} cue ${i}`).toBeGreaterThan(0);
        expect(cues[i].t, `${w} cue ${i}`).toBeLessThanOrEqual(1);
        if (i > 0) expect(cues[i].t, `${w} order`).toBeGreaterThanOrEqual(cues[i - 1].t);
      }
    }
  });

  it("puts the seat where the magazine actually lands (the sound cannot drift from the part)", () => {
    for (const w of ["pistol", "smg", "machinepistol", "carbine", "rifle", "dmr", "sniper", "lmg", "smg2"] as const) {
      const cues = reloadCues(w);
      const out = cues.find((c) => c.kind === "magOut")!, back = cues.find((c) => c.kind === "magIn")!, seat = cues.find((c) => c.kind === "seat")!;
      expect(out, `${w} magOut`).toBeTruthy();
      expect(back, `${w} magIn`).toBeTruthy();
      expect(seat, `${w} seat`).toBeTruthy();
      expect(out.t).toBeLessThan(back.t);
      expect(back.t).toBeLessThan(seat.t);
      // Just before the seat the mag is still visibly out; at the seat it is home.
      expect(reloadFrame(w, seat.t - 0.02).mag).toBeGreaterThan(0.02);
      expect(reloadFrame(w, seat.t).mag).toBeLessThanOrEqual(0.02);
      expect(reloadFrame(w, out.t - 0.01).mag).toBeLessThanOrEqual(0.02);
    }
  });

  it("charges only an empty gun: a tactical reload keeps the slide forward and skips the pull", () => {
    // Empty: the pistol's slide is locked back from the first frame and released at the end.
    expect(reloadFrame("pistol", 0, 6, true).action).toBe(1);
    expect(kinds("pistol", 6, true)).toContain("actionForward");
    expect(kinds("rifle", 6, true)).toContain("actionBack");
    expect(kinds("dmr", 6, true)).toContain("actionBack");
    expect(kinds("shotgun", 6, true)).toContain("actionBack");
    // A round chambered: nothing to work, and the animation says so.
    for (const w of ["pistol", "rifle", "smg", "carbine", "machinepistol", "dmr", "sniper", "shotgun", "autoshotgun"] as const) {
      for (let i = 0; i <= 20; i++) expect(reloadFrame(w, i / 20, 6, false).action, `${w}@${i / 20}`).toBe(0);
      expect(kinds(w, 6, false).some((k) => k === "actionBack" || k === "actionForward"), w).toBe(false);
    }
    // The magazine still travels on a tactical reload — that is the whole point of it.
    expect(reloadFrame("rifle", 0.45, 6, false).mag).toBeGreaterThan(0.9);
  });

  it("loads as many shells as are actually going in", () => {
    for (const n of [1, 2, 4, 6]) {
      expect(kinds("shotgun", n).filter((k) => k === "shell").length, `shotgun ${n}`).toBe(n);
      expect(kinds("revolver", n).filter((k) => k === "shell").length, `revolver ${n}`).toBe(n);
    }
    // The cylinder opens before the first shell and closes after the last.
    const r = reloadCues("revolver", 3);
    const open = r.find((c) => c.kind === "open")!, close = r.find((c) => c.kind === "close")!;
    const shells = r.filter((c) => c.kind === "shell");
    expect(open.t).toBeLessThan(shells[0].t);
    expect(close.t).toBeGreaterThan(shells[shells.length - 1].t);
  });

  it("leaves the VZ-9 (smg2) timeline exactly as it shipped", () => {
    // Tactical or empty, shells or not: the same frames. This row is out of scope for the pass.
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      expect(reloadFrame("smg2", t, 6, false)).toEqual(reloadFrame("smg2", t, 6, true));
      expect(reloadFrame("smg2", t, 1, true)).toEqual(reloadFrame("smg2", t, 6, true));
    }
    expect(kinds("smg2")).toEqual(["magOut", "magIn", "seat", "actionBack", "actionForward"]);
  });

  it("hears the belt gun's cover and the launcher's breech as open / close, not as a charge", () => {
    expect(kinds("lmg").slice(0, 2)).toEqual(["open", "magOut"]);
    expect(kinds("lmg")).toContain("close");
    expect(kinds("launcher")).toEqual(["open", "close"]);
  });
});
