import { describe, expect, it } from "vitest";
import { compileVoxel, formatVoxelText, parseVoxelText, voxelBounds, voxelFootprint, voxelGrid, voxelQuads, type VoxelModel } from "./voxel";

const cube = (n = 1, ink = "W", finish = "matte"): VoxelModel => parseVoxelText(`#model c\n#cell 0.1\n#ink ${ink} #ffffff ${finish}\n#box 0,0,0 ${n},${n},${n} ${ink}\n`);

describe("voxel text", () => {
  it("parses and formats back to the same model", () => {
    const text = "#model fridge\n#cell 0.1\n#ink W #e8e8e8 gloss\n#ink K #202020 metal\n\n#part y n=18 at=0,0,0\nWWWWWW\nWWWWWW\n\n#part z n=1 at=0,0,6\nWWKWWW\nWW.WWW\n";
    const m = parseVoxelText(text);
    expect(m.id).toBe("fridge");
    expect(m.palette.W).toEqual({ color: "#e8e8e8", finish: "gloss" });
    expect(m.parts).toHaveLength(2);
    expect(m.parts[1]).toEqual({ axis: "z", n: 1, x: 0, y: 0, z: 6, rows: ["WWKWWW", "WW.WWW"] });
    expect(parseVoxelText(formatVoxelText(m))).toEqual(m);
  });

  it("names the line of a mistake", () => {
    expect(() => parseVoxelText("#model a\n#ink W #fff\n")).toThrow(/line 2/);
    expect(() => parseVoxelText("#model a\n#ink W #ffffff\n#part z\nWX\n")).toThrow(/line 4.*"X"/);
    expect(() => parseVoxelText("#ink W #ffffff\n#part z\nW\n")).toThrow(/#model/);
    expect(() => parseVoxelText("#model a\n#part z n=2 at=0,0\nW\n")).toThrow(/x,y,z/);
    expect(() => parseVoxelText("#model a\n#ink W #ffffff shiny\n")).toThrow(/finish/);
  });

  it("comments are stripped; a blank line ends a part, so a row after it needs a new #part", () => {
    const m = parseVoxelText("#model a\n#ink W #ffffff\n#part z n=1 at=0,0,0 // front\nW.W // legs\n\n#part z n=1 at=0,1,0\nWWW\n");
    expect(m.parts).toHaveLength(2);
    expect(m.parts[0].rows).toEqual(["W.W"]);
    expect(() => parseVoxelText("#model a\n#ink W #ffffff\n#part z n=1 at=0,0,0\nW.W\n\nWWW\n")).toThrow(/line 6.*#part/);
  });
});

describe("voxel grid — the three views", () => {
  it("a front view puts its top row at the top and its left column at +x (the viewer at +z sees +x on their left)", () => {
    const m = parseVoxelText("#model a\n#ink A #ff0000\n#ink B #00ff00\n#part z n=1 at=0,0,0\nA.\n.B\n");
    const g = voxelGrid(m);
    expect(g.size).toEqual([2, 2, 1]);
    const at = (x: number, y: number, z: number) => g.cells[(y * g.size[2] + z) * g.size[0] + x];
    expect(at(1, 1, 0)).toBe(1);   // A: top-left of the picture → x 1 (the viewer's left), y 1
    expect(at(0, 0, 0)).toBe(2);   // B: bottom-right → x 0, y 0
  });
  it("a plan puts its first row north (+z) and extrudes up", () => {
    const m = parseVoxelText("#model a\n#ink A #ff0000\n#part y n=3 at=0,0,0\nA.\n..\n");
    const g = voxelGrid(m);
    expect(g.size).toEqual([2, 3, 2]);
    const at = (x: number, y: number, z: number) => g.cells[(y * g.size[2] + z) * g.size[0] + x];
    expect(at(0, 0, 1)).toBe(1); expect(at(0, 2, 1)).toBe(1); expect(at(0, 0, 0)).toBe(0);
  });
  it("a side view seen from +x has −z on its left (left-handed: +z is on the viewer's right)", () => {
    const m = parseVoxelText("#model a\n#ink A #ff0000\n#ink B #00ff00\n#part x n=2 at=0,0,0\nA..B\n");
    const g = voxelGrid(m);
    expect(g.size).toEqual([2, 1, 4]);
    const at = (x: number, y: number, z: number) => g.cells[(y * g.size[2] + z) * g.size[0] + x];
    expect(at(0, 0, 0)).toBe(1); expect(at(1, 0, 0)).toBe(1); expect(at(0, 0, 3)).toBe(2);
  });
  it("parts may start at negative cells; later parts overwrite", () => {
    const m = parseVoxelText("#model a\n#ink A #ff0000\n#ink B #00ff00\n#box -1,0,-1 2,1,2 A\n#box 0,0,0 1,1,1 B\n");
    const g = voxelGrid(m);
    expect(g.size).toEqual([2, 1, 2]);
    expect(g.origin).toEqual([-1, 0, -1]);
    expect(Array.from(g.cells)).toEqual([1, 1, 1, 2]);
  });
});

describe("voxel mesher", () => {
  it("one cube is six quads, 24 vertices, 12 triangles, centred on x/z and standing on y = 0", () => {
    const c = compileVoxel(cube());
    expect(c.quads).toBe(6);
    expect(c.voxels).toBe(1);
    expect(c.groups).toHaveLength(1);
    const g = c.groups[0];
    expect(g.positions).toHaveLength(24 * 3);
    expect(g.indices).toHaveLength(36);
    const xs = g.positions.filter((_, i) => i % 3 === 0), ys = g.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...xs)).toBeCloseTo(-0.05); expect(Math.max(...xs)).toBeCloseTo(0.05);
    expect(Math.min(...ys)).toBeCloseTo(0); expect(Math.max(...ys)).toBeCloseTo(0.1);
  });
  it("a solid block of one ink is still six quads — the merge is greedy in both directions", () => {
    expect(compileVoxel(cube(3)).quads).toBe(6);
    expect(compileVoxel(cube(3)).voxels).toBe(27);
    const slab = parseVoxelText("#model s\n#ink W #ffffff\n#box 0,0,0 7,1,3 W\n");
    expect(compileVoxel(slab).quads).toBe(6);
  });
  it("faces between two cells are never emitted; a colour change splits the merge", () => {
    const two = parseVoxelText("#model t\n#ink A #ff0000\n#ink B #0000ff\n#part z n=1 at=0,0,0\nAB\n");
    expect(compileVoxel(two).quads).toBe(10);   // 2 × 5 outer faces, none between
  });
  it("an L shape exposes its inner corner", () => {
    const l = parseVoxelText("#model l\n#ink A #ff0000\n#part z n=1 at=0,0,0\nA.\nAA\n");
    // 3 cubes: 3 × 6 = 18 faces − 2 × 2 shared = 14, merged: front/back 2 (each an L → 2 rects) → 4,
    // −x 1, +x 2 (two heights), +y 2, −y 1 → 10
    expect(compileVoxel(l).quads).toBe(10);
  });
  it("glass hides its own face against an opaque cell and shows the opaque face through itself", () => {
    const m = parseVoxelText("#model g\n#ink A #ff0000\n#ink G #88ccff glass\n#part z n=1 at=0,0,0\nAG\n");
    const q = voxelQuads(m);
    const a = q.filter((x) => x.ink === "A"), g = q.filter((x) => x.ink === "G");
    expect(a).toHaveLength(6);   // the face toward the glass is visible
    expect(g).toHaveLength(5);   // the glass face against A is not
    const c = compileVoxel(m);
    expect(c.groups.map((x) => x.finish).sort()).toEqual(["glass", "matte"]);
    expect(c.groups.find((x) => x.finish === "glass")!.color).toBe("#88ccff");
  });
  it("groups by finish, and glow by colour too", () => {
    const m = parseVoxelText("#model g\n#ink A #ff0000\n#ink B #00ff00\n#ink C #0000ff glow\n#ink D #ffff00 glow\n#ink E #111111 metal\n#part z n=1 at=0,0,0\nABCDE\n");
    const c = compileVoxel(m);
    expect(c.groups.map((x) => `${x.finish}${x.color ? ":" + x.color : ""}`).sort()).toEqual(["glow:#0000ff", "glow:#ffff00", "matte", "metal"]);
  });
  it("winds every triangle clockwise seen from outside — Babylon's own box convention", () => {
    const m = parseVoxelText("#model w\n#ink A #ff0000\n#ink G #88ccff glass\n#part z n=2 at=0,0,0\nA.\nAG\n#part y n=1 at=0,2,0\n.A\n");
    for (const g of compileVoxel(m).groups) {
      for (let t = 0; t < g.indices.length; t += 3) {
        const p = (i: number) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
        const [a, b, c] = [p(g.indices[t]), p(g.indices[t + 1]), p(g.indices[t + 2])];
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const i = g.indices[t];
        const dot = cr[0] * g.normals[i * 3] + cr[1] * g.normals[i * 3 + 1] + cr[2] * g.normals[i * 3 + 2];
        expect(dot).toBeLessThan(0);
      }
    }
  });
  it("colours are the ink's sRGB rgb, per vertex", () => {
    const c = compileVoxel(cube(1, "R"));
    const m = parseVoxelText("#model c\n#cell 0.1\n#ink R #ff8000\n#box 0,0,0 1,1,1 R\n");
    const g = compileVoxel(m).groups[0];
    expect(g.colors.slice(0, 4)).toEqual([1, 128 / 255, 0, 1]);
    expect(c.groups[0].colors).toHaveLength(24 * 4);
  });
});

describe("voxel bounds and footprint", () => {
  const m = parseVoxelText("#model f\n#cell 0.1\n#ink W #ffffff\n#box 0,0,0 6,18,4 W\n");
  it("bounds are cells × cell", () => expect(voxelBounds(m)).toEqual({ w: 0.6, h: 1.8, d: 0.4 }));
  it("the footprint is centred, stands on y, and turns with a quarter turn", () => {
    const f = voxelFootprint(m, 10, 3.5, 5, 0);
    expect(f).toEqual({ minX: 9.7, minY: 3.5, minZ: 4.8, maxX: 10.3, maxY: 5.3, maxZ: 5.2 });
    const t = voxelFootprint(m, 10, 0, 5, Math.PI / 2);
    expect(t.maxX - t.minX).toBeCloseTo(0.4); expect(t.maxZ - t.minZ).toBeCloseTo(0.6);
    const d = voxelFootprint(m, 0, 0, 0, 0.7);
    expect(d.maxX - d.minX).toBeCloseTo(0.6); expect(d.maxZ - d.minZ).toBeCloseTo(0.6);
  });
});
