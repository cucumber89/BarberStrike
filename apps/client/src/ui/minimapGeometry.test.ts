import { describe, expect, it } from "vitest";
import { boxFrom } from "@frankibarber/shared";
import { bearingTo, compassX, radarOffset, relativeAngle, toMap } from "./minimapGeometry";

/** Drop 5: minimap / compass maths. */

describe("minimap maths", () => {
  it("maps world to a north-up image", () => {
    const b = boxFrom(-10, 0, -20, 40, 5, 60); // x −10..30, z −20..40
    expect(toMap(-10, 40, b, 2)).toEqual([0, 0]);      // north-west corner = top-left
    expect(toMap(30, -20, b, 2)).toEqual([80, 120]);   // south-east corner = bottom-right
  });

  it("bearings and relative angles follow the compass (north 0, east +90°)", () => {
    expect(bearingTo(0, 0, 0, 10)).toBeCloseTo(0);
    expect(bearingTo(0, 0, 10, 0)).toBeCloseTo(Math.PI / 2);
    expect(relativeAngle(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2);      // east while facing north: to the right
    expect(relativeAngle(0, Math.PI / 2)).toBeCloseTo(-Math.PI / 2);     // north while facing east: to the left
    expect(relativeAngle(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2); // wraps the short way
  });

  it("puts things ahead at the top of the radar and to the right on the right", () => {
    expect(radarOffset(0, 0, 0, 0, 10, 1)).toEqual([0, -10]);                       // facing north, point north → up
    const [rx, ry] = radarOffset(0, 0, Math.PI / 2, 10, 0, 1);                       // facing east, point east → up
    expect(rx).toBeCloseTo(0); expect(ry).toBeCloseTo(-10);
    const [qx, qy] = radarOffset(0, 0, 0, 10, 0, 1);                                 // facing north, point east → right
    expect(qx).toBeCloseTo(10); expect(qy).toBeCloseTo(0);
  });

  it("places compass markers inside the strip and hides those behind", () => {
    expect(compassX(0, Math.PI / 2, 240)).toBe(0);
    expect(compassX(Math.PI / 4, Math.PI / 2, 240)).toBeCloseTo(60);
    expect(compassX(Math.PI * 0.75, Math.PI / 2, 240)).toBeNull();
  });
});
