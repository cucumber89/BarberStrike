import { describe, expect, it } from "vitest";
import { coplanarFaces, coplanarTopFaces, siteLoad, siteOf, MIN_OVERLAP_M2 } from "./floorAudit";
import { MAPS } from "./map";

/**
 * Drop I diagnosed "the floor at A and B lags" as map DATA, so the audit is data too. Drop G made
 * it run over every map in the registry: an interior map lays a slab per room and is exactly where
 * a coplanar pair gets made again.
 */
for (const map of Object.values(MAPS)) {
  describe(`the floor a player stands on is one surface (${map.id})`, () => {
    it("has no two walkable faces at the same height over the same ground", () => {
      // Two coplanar tops = z-fighting = a floor that crawls as you walk. It is not "a bit of
      // flicker": it is the whole shared footprint shimmering, which is what the report of "the
      // floor at A and B lags" describes. Reported with coordinates so the offender is findable.
      const exact = coplanarTopFaces(map.solids).filter((p) => p.exact);
      const detail = exact.map((p) => `${p.a} ⇄ ${p.b}: ${p.area} m² at y=${p.y.toFixed(3)}, (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) near site ${siteOf(p.x, p.z, map) ?? "—"}`);
      expect(detail, `${exact.length} coplanar floor pair(s)`).toEqual([]);
    });

    it("keeps stacked surfaces far enough apart for a perspective depth buffer", () => {
      // 1–5 mm survives at point-blank range and fights at thirty metres, which is exactly the
      // distance a player watches a bomb site from.
      const near = coplanarTopFaces(map.solids).filter((p) => !p.exact);
      const detail = near.map((p) => `${p.a} ⇄ ${p.b}: ${p.dyMm} mm apart over ${p.area} m²`);
      expect(detail).toEqual([]);
    });

    it("keeps each bomb site inside its geometry budget", () => {
      // The other half of the diagnosis: a frame-rate drop localised at a site would need a lot of
      // geometry packed around it. The two are not meant to be EQUAL — NIGHT_DISTRICT's A carries a
      // canopy roof and four pillars on purpose — so the gate is a budget, not parity. On an
      // interior map the budget is the real constraint, because a room brings its own walls: it is
      // why GÓRA plants on the balcony and in the hall rather than in the two end rooms.
      const load = siteLoad(map);
      expect(load.map((l) => l.site)).toEqual(["A", "B"]);
      for (const l of load) {
        expect(l.areaM2, l.site).toBeGreaterThan(100);
        expect(l.solids + l.props, `${map.id} site ${l.site} holds ${l.solids} solids + ${l.props} props`).toBeLessThanOrEqual(30);
      }
    });

    it("the audit only reports overlaps a player could stand on", () => {
      const tiny = coplanarTopFaces(map.solids).filter((p) => p.area < MIN_OVERLAP_M2);
      expect(tiny).toEqual([]);
    });
  });
}

/**
 * The top-face audit above gates floors. This gates every other direction, for the same reason and
 * with the same threshold: a wall, a ceiling or a staircase whose surface shares a plane with the
 * thing it overlaps shimmers exactly as a floor does. It was added after a six-direction sweep
 * found 54 such pairs on NIGHT_DISTRICT while the top-face audit reported none.
 */
for (const map of Object.values(MAPS)) {
  describe(`no two surfaces of ${map.id} fight for the same plane`, () => {
    it("has no same-facing coplanar faces on solids that interpenetrate", () => {
      const detail = coplanarFaces(map.solids).map(
        (p) => `${p.dir} ${p.a} ⇄ ${p.b}: ${p.area} m² at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`,
      );
      expect(detail, `${detail.length} coplanar face pair(s)`).toEqual([]);
    });

    it("does not report solids that merely butt, which backface culling settles", () => {
      // Two boxes sharing a plane with their faces pointing opposite ways are how every wall in the
      // map is built. If this ever fires, the audit has started reporting normal construction.
      expect(coplanarFaces(map.solids).every((p) => p.area >= MIN_OVERLAP_M2)).toBe(true);
    });
  });
}
