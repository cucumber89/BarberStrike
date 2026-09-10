import type { Box } from "@frankibarber/shared";
import { ALL_FACES, face } from "./chamfer";

/**
 * Which faces of a wall piece anybody can actually see.
 *
 * The district's walls are rows of butted boxes — `shop_north_a` meets `shop_north_b` meets the
 * door head — and `buildMap` cuts anything longer than a tile into pieces on top of that. Both
 * produce faces that are pressed flat against a neighbour and never rendered on their own. That is
 * fine until the masonry gets bevelled: a bevel on a hidden face pulls the visible surface back by
 * 5 cm on each side of the joint, so a continuous wall grows a 10 cm groove every time it changes
 * box. MEASURED on NIGHT_DISTRICT: 312 of the 912 chamfered faces are fully butted, 240 of them at
 * joints between separate solids and 72 at tile cuts — five grooves along each 62 m facade.
 *
 * Pure box arithmetic so it is testable without a renderer, and cheap enough to run once per piece
 * at load: the plane test rejects almost every candidate before any area is computed.
 */

/** Same plane to within a millimetre — anything looser starts eating real setbacks. */
const PLANE_EPS = 0.001;
/** The face has to be covered, not merely overlapped. */
const COVER_EPS = 0.01;

const lo = (b: Box, axis: number): number => (axis === 0 ? b.minX : axis === 1 ? b.minY : b.minZ);
const hi = (b: Box, axis: number): number => (axis === 0 ? b.maxX : axis === 1 ? b.maxY : b.maxZ);

/**
 * `start` lets the caller clear the faces it already knows are joints (the cut between two tiles of
 * one solid, which no separate box would report). `skip` is the piece's own parent solid, whose box
 * contains the piece and would otherwise hide every face of it.
 */
export function exposedFaces(box: Box, occluders: readonly Box[], start: number = ALL_FACES, skip?: Box): number {
  let mask = start;
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const area = (hi(box, u) - lo(box, u)) * (hi(box, v) - lo(box, v));
    if (area <= 0) continue;
    for (const sign of [-1, 1]) {
      const bit = face(axis, sign);
      if (!(mask & bit)) continue;
      const plane = sign < 0 ? lo(box, axis) : hi(box, axis);
      let covered = 0;
      for (const q of occluders) {
        if (q === skip) continue;
        // A neighbour hides this face with its OPPOSITE face: our -X meets their +X.
        if (Math.abs((sign < 0 ? hi(q, axis) : lo(q, axis)) - plane) > PLANE_EPS) continue;
        const ou = Math.min(hi(box, u), hi(q, u)) - Math.max(lo(box, u), lo(q, u));
        const ov = Math.min(hi(box, v), hi(q, v)) - Math.max(lo(box, v), lo(q, v));
        if (ou > 0 && ov > 0) covered += ou * ov;
      }
      if (covered >= area - COVER_EPS) mask &= ~bit;
    }
  }
  return mask;
}

/** Clears the two faces a tile shares with the next tile of the same solid. */
export function tileSeams(ix: number, nx: number, iz: number, nz: number): number {
  let mask = ALL_FACES;
  if (ix > 0) mask &= ~face(0, -1);
  if (ix < nx - 1) mask &= ~face(0, 1);
  if (iz > 0) mask &= ~face(2, -1);
  if (iz < nz - 1) mask &= ~face(2, 1);
  return mask;
}
