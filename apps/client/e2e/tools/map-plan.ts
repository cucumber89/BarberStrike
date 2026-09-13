/**
 * map-plan — Drop G, redrawn for the tournament pass. Renders the top-down ASCII plan of GÓRA
 * (DACH) in `docs/MAP_2.md` FROM the built solids, so the picture and the geometry cannot drift
 * apart.
 *
 * Run: ./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-plan.ts \
 *        > apps/client/e2e/out/g/plan.txt
 *
 * 2 characters per metre in X, 1 line per metre in Z (a terminal cell is about 1×2, so the plan is
 * roughly true to scale). +X east, +Z north — north is UP, as in `map.ts`. Glyphs by the height a
 * body meets: `#` a structure nobody gets onto (≥ 2.8 m), `=` full cover (2.0–2.6 m), `+` crouch
 * cover (1.3 m), `.` low, jump on it (0.8 m), `/` a stair tread, `^` the perch (2.0 m, walkable),
 * `~` the cage, `o` a spawn, `$` a buy station.
 */
import { GORA } from "../../../../packages/shared/src/gora";

const X0 = -18, X1 = 18, Z0 = -12, Z1 = 12;
const COLS = (X1 - X0) * 2, ROWS = Z1 - Z0;
const col = (x: number) => Math.round((x - X0) * 2);
const row = (z: number) => Math.round(Z1 - z);

const g: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(" "));
const paint = (x0: number, x1: number, z0: number, z1: number, ch: string) => {
  for (let ry = row(z1); ry < row(z0); ry++) for (let cx = col(x0); cx < col(x1); cx++) {
    if (ry >= 0 && ry < ROWS && cx >= 0 && cx < COLS) g[ry][cx] = ch;
  }
};
const glyph = (name: string, h: number, invisible: boolean): string | null => {
  if (name === "dach") return "·";
  if (/^(blok_|podworko_dol)/.test(name)) return null;
  if (name.startsWith("siatka_")) return "~";
  if (name.startsWith("attyka_") && !name.includes("maszynowni")) return null;
  if (name.startsWith("schody_")) return "/";
  if (name === "maszynownia") return "^";
  if (name.startsWith("attyka_maszynowni")) return "=";
  if (invisible) return "+";
  if (h >= 2.8) return "#";
  if (h >= 2.0) return "=";
  if (h >= 1.2) return "+";
  if (h >= 0.5) return ".";
  return null;
};
// Floor first, then everything else in height order so the tallest wins a cell.
const sorted = [...GORA.solids].sort((a, b) => a.box.maxY - b.box.maxY);
for (const s of sorted) {
  const ch = glyph(s.name ?? "", s.box.maxY, !!s.invisible);
  if (!ch) continue;
  paint(s.box.minX, s.box.maxX, s.box.minZ, s.box.maxZ, ch);
}
for (const s of GORA.spawns) g[row(s.z) - 1][col(s.x)] = "o";
for (const st of GORA.stations) g[row(st.z) - 1][col(st.x)] = "$";
const label = (x: number, z: number, text: string) => {
  const ry = row(z) - 1, start = Math.round(col(x) - text.length / 2);
  for (let i = 0; i < text.length; i++) if (ry >= 0 && ry < ROWS && start + i >= 0 && start + i < COLS) g[ry][start + i] = text[i];
};
label(-10.1, -5.3, "KLATKA W"); label(10.1, 5.3, "KLATKA E");
label(0, 0, "MASZYNOWNIA"); label(0, -5.0, "DZIEDZINIEC S"); label(0, 5.0, "DZIEDZINIEC N");
label(-12, 6.5, "PODWORKO W"); label(12, -6.5, "PODWORKO E");
label(-14.8, -0.5, "brama"); label(14.8, 0.5, "brama");
label(0.5, -9.0, "WENT."); label(-0.5, 9.0, "PRALN.");
label(-6.3, 0, "pod.W"); label(6.3, 0, "pod.E");

console.log("GÓRA (DACH) — the roof, y = 0; the perch (^) at y = 2.0.   N ↑ (+Z)   E → (+X)");
console.log("# structure (≥ 2.8)   = full cover (2.0–2.6)   + crouch cover (1.3)   . low, jump on (0.8)   / stair   ~ cage 4.4 m   o spawn   $ buy");
console.log("        " + [-15, -10, -5, 0, 5, 10, 15].map((x) => `x=${x}`.padStart(x < 0 ? 6 : 5)).join("    "));
for (let ry = 0; ry < ROWS; ry++) {
  const z = Z1 - ry - 1;
  console.log(`z=${String(z).padStart(3)}  |${g[ry].join("")}|`);
}
