import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No two modules in one directory may have names that differ only in case.
 *
 * This is not tidiness. Windows and macOS have case-insensitive filesystems, so
 * `import { Minimap } from "./Minimap"` next to a `minimap.ts` resolves to whichever file the OS
 * feels like returning. It returned the wrong one: the HUD imported a module with no `Minimap`
 * export, the bundle threw `SyntaxError: does not provide an export named 'Minimap'` before React
 * mounted, and the game was a black screen with no menu — for Windows players only. Linux, where
 * this is developed and where CI runs, could not see it, and neither could typecheck, vitest, the
 * e2e suite or a production build. Only a person on Windows could, and that is far too late.
 *
 * The comparison is on the STEM (the part an import specifier writes), so `Minimap.tsx` collides
 * with `minimap.ts` and with `minimap.test.ts`, which is exactly the ambiguity a bundler faces.
 */

const ROOTS = ["src", "e2e"];
const SKIP = new Set(["node_modules", "dist", "out", ".vite"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** The part of a filename an import specifier writes: everything before the first dot. */
const stem = (file: string): string => file.split("/").pop()!.split(".")[0];

describe("module names survive a case-insensitive filesystem", () => {
  it("has no two modules in one folder whose names differ only in case", () => {
    const byKey = new Map<string, string[]>();
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (!/\.(ts|tsx|mjs|js|jsx)$/.test(file)) continue;
        const dir = file.slice(0, file.lastIndexOf("/"));
        const key = `${dir}/${stem(file).toLowerCase()}`;
        (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(file);
      }
    }
    const clashes: string[][] = [];
    for (const files of byKey.values()) {
      // Same stem in the same case is fine — `x.ts` and `x.test.ts` are one module and its test.
      if (new Set(files.map(stem)).size > 1) clashes.push(files);
    }
    expect(clashes, `these resolve to each other on Windows and macOS:\n${clashes.map((c) => "  " + c.join("  <->  ")).join("\n")}`).toEqual([]);
  });
});
