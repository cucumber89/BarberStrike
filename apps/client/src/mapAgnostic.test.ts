import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Drop G: nothing the client draws may name NIGHT_DISTRICT's bomb sites.
 *
 * `BOMB_SITES` was a module constant holding one map's two points, and the second map moved them
 * onto `MapDef.sites` behind `sitesOf(map)`. The refactor missed the minimap, which kept drawing
 * A and B at (−35, 24) and (43, 24) — off the edge of GÓRA, with the compass pointing at them —
 * and typecheck, the map tests and the client suite were all happy, because a constant that still
 * exists and still holds valid numbers breaks nothing except the picture. A grep is the only test
 * that can see it, so this is a grep.
 */
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};

describe("the client draws the map it is on", () => {
  it("never reads the global BOMB_SITES; it asks the map for its own sites", () => {
    const guilty = walk("src").filter((f) => /\bBOMB_SITES\b/.test(readFileSync(f, "utf8")));
    expect(guilty, "use sitesOf(map) instead").toEqual([]);
  });
});
