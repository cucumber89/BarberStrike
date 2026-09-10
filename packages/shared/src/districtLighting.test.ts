/** Light origins inside opaque collision geometry cannot illuminate their own fixtures. */
import { describe, it, expect } from "vitest";
import { NIGHT_DISTRICT } from "./map";

describe("district practicals", () => {
  it("places every origin outside opaque solids", () => {
    const buried = NIGHT_DISTRICT.lights.flatMap(l => NIGHT_DISTRICT.solids.filter(s => {
      if (["glass", "fence"].includes(s.mat)) return false;
      const b = s.box;
      return l.x >= b.minX && l.x <= b.maxX && l.y >= b.minY && l.y <= b.maxY && l.z >= b.minZ && l.z <= b.maxZ;
    }).map(s => `${l.x},${l.y},${l.z}: ${s.name}`));
    expect(buried).toEqual([]);
  });
  it("gives both alley wall fixtures a nearby practical", () => {
    for (const p of NIGHT_DISTRICT.props.filter(p => p.kind === "lamp" && p.variant === "wall")) {
      expect(Math.min(...NIGHT_DISTRICT.lights.map(l => Math.hypot(l.x-p.x,l.y-p.y,l.z-p.z)))).toBeLessThan(.5);
    }
  });
});
