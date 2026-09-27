import { describe, expect, it } from "vitest";
import { parseVoxelText } from "@frankibarber/shared";
import { compiledVoxel } from "./voxelProps";

/** The compile cache is per model object: the same library object is compiled once, a re-parsed
 *  model of the same id (the creator after a stroke) is compiled again — never a stale preview. */
describe("compiledVoxel", () => {
  const text = (rows: string) => `#model same\n#cell 0.1\n#ink A #ff0000\n#part z n=1 at=0,0,0\n${rows}\n`;
  it("reuses the geometry of one object", () => {
    const m = parseVoxelText(text("A"));
    expect(compiledVoxel(m)).toBe(compiledVoxel(m));
  });
  it("recompiles a new object with the same id", () => {
    const a = compiledVoxel(parseVoxelText(text("A")));
    const b = compiledVoxel(parseVoxelText(text("AA")));
    expect(a.voxels).toBe(1);
    expect(b.voxels).toBe(2);
  });
});
