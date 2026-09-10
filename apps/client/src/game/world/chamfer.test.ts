import { expect, it } from "vitest";
import { chamferData } from "./chamfer";
it("keeps the exact envelope and outward flat normals on all 26 faces", () => {
  const data=chamferData(12,3.6,.3);
  for(let axis=0;axis<3;axis++) {
    const values=data.positions.filter((_,i)=>i%3===axis);
    expect(Math.max(...values)).toBe([6,1.8,.15][axis]);
    expect(Math.min(...values)).toBe(-[6,1.8,.15][axis]);
  }
  expect(data.indices.length/3).toBe(44);
  for(let i=0;i<data.positions.length;i+=3) {
    const p=data.positions.slice(i,i+3),n=data.normals.slice(i,i+3);
    expect(Math.hypot(...n)).toBeCloseTo(1);
    expect(p.reduce((s,v,j)=>s+v*n[j],0)).toBeGreaterThan(0);
  }
});
