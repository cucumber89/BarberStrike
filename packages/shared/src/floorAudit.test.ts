import { describe, expect, it } from "vitest";
import { coplanarTopFaces, siteLoad, siteOf, MIN_OVERLAP_M2 } from "./floorAudit";
import { NIGHT_DISTRICT } from "./map";

describe("the floor a player stands on is one surface", () => {
  it("has no two walkable faces at the same height over the same ground", () => {
    // Two coplanar tops = z-fighting = a floor that crawls as you walk. It is not "a bit of
    // flicker": it is the whole shared footprint shimmering, which is what the report of "the
    // floor at A and B lags" describes. Reported with coordinates so the offender is findable.
    const exact = coplanarTopFaces().filter((p) => p.exact);
    const detail = exact.map((p) => `${p.a} ⇄ ${p.b}: ${p.area} m² at y=${p.y.toFixed(3)}, (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) near site ${siteOf(p.x, p.z) ?? "—"}`);
    expect(detail, `${exact.length} coplanar floor pair(s)`).toEqual([]);
  });

  it("keeps stacked surfaces far enough apart for a perspective depth buffer", () => {
    // 1–5 mm survives at point-blank range and fights at thirty metres, which is exactly the
    // distance a player watches a bomb site from.
    const near = coplanarTopFaces().filter((p) => !p.exact);
    const detail = near.map((p) => `${p.a} ⇄ ${p.b}: ${p.dyMm} mm apart over ${p.area} m²`);
    expect(detail).toEqual([]);
  });

  it("keeps each bomb site inside its geometry budget", () => {
    // The other half of the diagnosis: a frame-rate drop localised at A or B would need a lot of
    // geometry packed into an 80 m² zone. Measured today it is 11 boxes at A (the canopy roof and
    // its four pillars are deliberate — A is meant to read differently from B) and 4 at B. The two
    // are not meant to be EQUAL; they are meant to stay cheap, so the gate is a budget, not parity.
    // If this ever fires, the site really has been overloaded and the report is about frame rate.
    const load = siteLoad();
    expect(load.map((l) => l.site)).toEqual(["A", "B"]);
    for (const l of load) {
      expect(l.areaM2, l.site).toBe(80);
      expect(l.solids + l.props, `site ${l.site} holds ${l.solids} solids + ${l.props} props`).toBeLessThanOrEqual(25);
    }
  });

  it("the audit only reports overlaps a player could stand on", () => {
    const tiny = coplanarTopFaces(NIGHT_DISTRICT.solids).filter((p) => p.area < MIN_OVERLAP_M2);
    expect(tiny).toEqual([]);
  });
});
