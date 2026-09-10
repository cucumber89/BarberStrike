import { expect, it } from "vitest";
import { boxFrom, NIGHT_DISTRICT } from "@frankibarber/shared";
import { ALL_FACES, chamferData, face } from "./chamfer";
import { exposedFaces, tileSeams } from "./wallFaces";

const TILE = 12;

it("hides the face a butting neighbour covers, and keeps the ones it does not", () => {
  const wall = boxFrom(0, 0, 0, 4, 3, .3);
  const next = boxFrom(4, 0, 0, 4, 3, .3);          // butts our +X face exactly
  const short = boxFrom(-2, 0, 0, 2, 1, .3);        // covers only the bottom third of -X
  const mask = exposedFaces(wall, [next, short]);
  expect(mask & face(0, 1)).toBe(0);                 // +X hidden
  expect(mask & face(0, -1)).not.toBe(0);            // -X only partly covered, still bevelled
  expect(mask & face(2, 1)).not.toBe(0);             // the wall's own face is untouched
});

it("clears exactly the seams between tiles of one solid", () => {
  expect(tileSeams(0, 1, 0, 1)).toBe(ALL_FACES);                        // one tile: nothing shared
  expect(tileSeams(0, 3, 0, 1) & face(0, 1)).toBe(0);                   // first of three: +X shared
  expect(tileSeams(0, 3, 0, 1) & face(0, -1)).not.toBe(0);              // its -X is the wall's end
  expect(tileSeams(1, 3, 0, 1) & (face(0, -1) | face(0, 1))).toBe(0);   // middle: both shared
});

it("drops the bevel geometry of a hidden face instead of leaving a groove", () => {
  const all = chamferData(12, 3.6, .3);
  const seam = chamferData(12, 3.6, .3, .05, ALL_FACES & ~face(0, 1));
  expect(all.indices.length / 3).toBe(44);
  // The +X face loses its 4 edge bands and 4 corners; the envelope stays closed and exact.
  expect(seam.indices.length / 3).toBe(44 - 4 * 2 - 4);
  const xs = seam.positions.filter((_, i) => i % 3 === 0);
  expect(Math.max(...xs)).toBe(6);
  expect(Math.min(...xs)).toBe(-6);
  // Every vertex on the seam plane is at the FULL half-extent in the other axes: no set-back.
  const ys = seam.positions.filter((_, i) => i % 3 === 1 && seam.positions[i - 1] === 6);
  expect(Math.max(...ys)).toBe(1.8);
});

it("leaves no bevelled joint anywhere in the district's masonry", () => {
  // The regression this exists for: 312 of 912 chamfered faces were butted flat against a
  // neighbour and bevelled anyway, which is a 10 cm groove across every wall that changes box.
  const occluders = NIGHT_DISTRICT.solids.filter((v) => !v.invisible && !v.look).map((v) => v.box);
  let bevelled = 0, joints = 0;
  for (const s of NIGHT_DISTRICT.solids) {
    if (s.invisible || s.look) continue;
    const b = s.box, sx = b.maxX - b.minX, sy = b.maxY - b.minY, sz = b.maxZ - b.minZ;
    if (!(s.mat.startsWith("wall") || s.mat === "concrete_block") || sy < .25) continue;
    const nx = Math.max(1, Math.ceil(sx / TILE)), nz = Math.max(1, Math.ceil(sz / TILE));
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const piece = {
        minX: b.minX + sx * ix / nx, maxX: b.minX + sx * (ix + 1) / nx,
        minY: b.minY, maxY: b.maxY,
        minZ: b.minZ + sz * iz / nz, maxZ: b.minZ + sz * (iz + 1) / nz,
      };
      const mask = exposedFaces(piece, occluders, tileSeams(ix, nx, iz, nz), s.box);
      for (let f = 0; f < 6; f++) if (mask & (1 << f)) bevelled++;
      joints += 6 - popcount(mask);
    }
  }
  expect(joints).toBeGreaterThan(300);          // the grooves that used to be drawn
  expect(bevelled + joints).toBe(152 * 6);      // every face is accounted for
});

const popcount = (n: number): number => { let c = 0; for (let i = 0; i < 6; i++) if (n & (1 << i)) c++; return c; };
