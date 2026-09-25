import { describe, expect, it } from "vitest";
import { NIGHT_DISTRICT, boxFrom, sitesOf } from "@frankibarber/shared";
import { MINIMAP, RADAR_LAYERS, radarBomb, radarOffset, rimPin, toMap, type RadarLayer } from "./minimapGeometry";

/** Drop 5: minimap maths. Drop U (P3): the compass strip is gone; the rim carries its marks. */

describe("minimap maths", () => {
  it("maps world to a north-up image", () => {
    const b = boxFrom(-10, 0, -20, 40, 5, 60); // x −10..30, z −20..40
    expect(toMap(-10, 40, b, 2)).toEqual([0, 0]);      // north-west corner = top-left
    expect(toMap(30, -20, b, 2)).toEqual([80, 120]);   // south-east corner = bottom-right
  });

  it("puts things ahead at the top of the radar and to the right on the right", () => {
    expect(radarOffset(0, 0, 0, 0, 10, 1)).toEqual([0, -10]);                       // facing north, point north → up
    const [rx, ry] = radarOffset(0, 0, Math.PI / 2, 10, 0, 1);                       // facing east, point east → up
    expect(rx).toBeCloseTo(0); expect(ry).toBeCloseTo(-10);
    const [qx, qy] = radarOffset(0, 0, 0, 10, 0, 1);                                 // facing north, point east → right
    expect(qx).toBeCloseTo(10); expect(qy).toBeCloseTo(0);
  });

  it("has no compass strip any more", () => {
    expect("compassWidth" in MINIMAP).toBe(false);
    expect("compassHalf" in MINIMAP).toBe(false);
  });

  it("paints what a player stands on under the player", () => {
    // Principle 14: an enemy defusing the planted bomb, or anyone on a flag, is never hidden by
    // the objective's icon. Every objective layer is below every player layer.
    const at = (l: RadarLayer) => RADAR_LAYERS.indexOf(l);
    for (const player of ["enemies", "mates", "me"] as const) {
      expect(at("objectives"), `objectives under ${player}`).toBeLessThan(at(player));
      expect(at("marks"), `marks under ${player}`).toBeLessThan(at(player));
    }
    expect(at("stations")).toBeLessThan(at("objectives"));
    expect(new Set(RADAR_LAYERS).size).toBe(RADAR_LAYERS.length);
  });

  it("shows the attack the carried and the dropped bomb, and everyone the planted one", () => {
    const b = (stage: string) => ({ stage, attackTeam: 0 });
    // The attack (team 0): who carries it, where it lies, where it is planted.
    expect(radarBomb(b("carried"), 0)).toBe("carried");
    expect(radarBomb(b("dropped"), 0)).toBe("dropped");
    expect(radarBomb(b("planted"), 0)).toBe("planted");
    // The defence (team 1): only the planted bomb.
    expect(radarBomb(b("carried"), 1)).toBeNull();
    expect(radarBomb(b("dropped"), 1)).toBeNull();
    expect(radarBomb(b("planted"), 1)).toBe("planted");
    // No round yet, or the round is over: its position means nothing.
    for (const team of [0, 1]) {
      expect(radarBomb(b("idle"), team)).toBeNull();
      expect(radarBomb(b("resolved"), team)).toBeNull();
      expect(radarBomb(null, team)).toBeNull();
    }
  });

  it("rimPin puts an off-range site on the rim", () => {
    // An attacker on NIGHT_DISTRICT's south spawn, facing north: both sites are far beyond the
    // radar's 24 m, so each is pinned on the rim, in its own direction — A to the upper left,
    // B to the upper right — exactly `rim` px out, never past the edge.
    const size = MINIMAP.size, half = size / 2, pxPerM = half / MINIMAP.range, rim = half - MINIMAP.rimInset;
    const spawn = NIGHT_DISTRICT.spawns.find((p) => p.team === 0)!;
    const [a, b] = sitesOf(NIGHT_DISTRICT);
    const out: [number, number] = [0, 0];
    for (const [site, side] of [[a, -1], [b, 1]] as const) {
      const [ox, oy] = radarOffset(spawn.x, spawn.z, 0, site.x, site.z, pxPerM);
      expect(Math.hypot(ox, oy), `${site.id} is out of range`).toBeGreaterThan(rim);
      expect(rimPin(out, ox, oy, rim), site.id).toBe(true);
      expect(Math.hypot(out[0], out[1])).toBeCloseTo(rim);
      expect(Math.sign(out[0]), `${site.id} keeps its side`).toBe(side);
      expect(out[1], `${site.id} is ahead`).toBeLessThan(0);
      // Same direction as the true offset.
      expect(Math.atan2(out[1], out[0])).toBeCloseTo(Math.atan2(oy, ox));
    }
    // Within range a mark stays where it is.
    expect(rimPin(out, 10, -20, rim)).toBe(false);
    expect(out).toEqual([10, -20]);
  });
});
