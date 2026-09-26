/**
 * map-plan — the top-down ASCII plan of a map, rendered FROM the built solids so the picture and
 * the geometry cannot drift apart (Drop G drew GÓRA's plan in `docs/MAP_2.md` this way).
 *
 * Run: ./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-plan.ts [map id] \
 *        > apps/client/e2e/out/<map>/plan.txt            (default: gora)
 *
 * WHY THE MAP ID. The tool was pinned to GÓRA: it imported `GORA` and hard-coded its extents
 * (−18…18 × −12…12 — exactly its `bounds`). DOLNA (Drop W) needs the same picture, so the extents
 * now come from `map.bounds` and the rules that are general — the height classes, stairs, the
 * boundary, invisible proxies, spawns, stations, flags and sites — apply to any map listed in
 * `map-profiles.ts`. GÓRA's own names (the perch, its parapets, the estate backdrop) keep their
 * glyphs, and its signed-off sheet (title, legend, labels, every spawn an `o`, no flag or site
 * marks) is kept as it was, so the default run is bit-identical to what `docs/MAP_2.md` quotes.
 *
 * 2 characters per metre in X, 1 line per metre in Z (a terminal cell is about 1×2, so the plan is
 * roughly true to scale). +X east, +Z north — north is UP, as in `map.ts`. Glyphs by the height a
 * body meets: `#` a structure nobody gets onto (≥ 2.8 m), `=` full cover (2.0–2.6 m), `+` crouch
 * cover (1.3 m), `.` low, jump on it (0.8 m), `/` a stair tread, `^` the perch (2.0 m, walkable),
 * `~` the boundary (GÓRA's cage; DOLNA's hedges, fences and edge walls), `:` an invisible collision
 * proxy, `o`/`O` the two duel starts and `x` every other spawn, `$` a buy station, `F` a flag,
 * `A`/`B` a bomb site. A solid that starts above head height (a roof, a lintel band; GÓRA has
 * none that its own rules do not name) is not drawn, so a room shows its inside, not its roof.
 */
import { pickProfile } from "./map-profiles";

const profile = pickProfile();
const map = profile.map;
const isGora = map.id === "gora";
const X0 = map.bounds.minX, X1 = map.bounds.maxX, Z0 = map.bounds.minZ, Z1 = map.bounds.maxZ;
const COLS = (X1 - X0) * 2, ROWS = Z1 - Z0;
const col = (x: number) => Math.round((x - X0) * 2);
const row = (z: number) => Math.round(Z1 - z);
const BOUNDARY = /^(hedge_|fence_|wall_edge|siatka_|attyka_)/;

const g: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(" "));
const paint = (x0: number, x1: number, z0: number, z1: number, ch: string) => {
  for (let ry = row(z1); ry < row(z0); ry++) for (let cx = col(x0); cx < col(x1); cx++) {
    if (ry >= 0 && ry < ROWS && cx >= 0 && cx < COLS) g[ry][cx] = ch;
  }
};
const put = (x: number, z: number, ch: string) => {
  const ry = row(z) - 1, cx = col(x);
  if (ry >= 0 && ry < ROWS && cx >= 0 && cx < COLS) g[ry][cx] = ch;
};
const glyph = (name: string, h: number, minY: number, invisible: boolean): string | null => {
  // GÓRA's own names first — they occur on no other map, so these rules are inert elsewhere.
  if (name.startsWith("attyka_") && !name.includes("maszynowni")) return null;
  if (name === "maszynownia") return "^";
  if (name.startsWith("attyka_maszynowni")) return "=";
  // The general rules.
  if (profile.ground.test(name)) return "·";
  if (profile.backdrop.test(name)) return null;
  if (BOUNDARY.test(name)) return "~";
  if (profile.stairs.test(name)) return "/";
  // GÓRA's sheet draws a collision proxy as the crouch cover it stands in for; elsewhere it is shown
  // for what it is, so a reviewer can tell an invisible wall from a hedge.
  if (invisible) return isGora ? "+" : ":";
  // A roof or a lintel band hangs above head height: it does not shape the floor, and drawing it
  // would hide the interior it covers (the very rooms DOLNA's close fights are in).
  if (minY > 1.9) return null;
  if (h >= 2.8) return "#";
  if (h >= 2.0) return "=";
  if (h >= 1.2) return "+";
  if (h >= 0.5) return ".";
  return null;
};
// Floor first, then everything else in height order so the tallest wins a cell.
const sorted = [...map.solids].sort((a, b) => a.box.maxY - b.box.maxY);
for (const s of sorted) {
  const ch = glyph(s.name ?? "", s.box.maxY, s.box.minY, !!s.invisible);
  if (!ch) continue;
  paint(s.box.minX, s.box.maxX, s.box.minZ, s.box.maxZ, ch);
}
// Spawns: GÓRA's sheet marks every spawn `o`; elsewhere the first spawn of each team is the duel
// start (`o` team 0, `O` team 1) and the rest are `x`.
const first = [0, 1].map((team) => map.spawns.find((s) => s.team === team));
for (const s of map.spawns) put(s.x, s.z, isGora ? "o" : s === first[0] ? "o" : s === first[1] ? "O" : "x");
for (const st of map.stations) put(st.x, st.z, "$");
if (!isGora) {
  for (const f of map.flags) put(f.x, f.z, "F");
  for (const b of map.sites ?? []) put(b.x, b.z, b.id);
}
const label = (x: number, z: number, text: string) => {
  const ry = row(z) - 1, start = Math.round(col(x) - text.length / 2);
  for (let i = 0; i < text.length; i++) if (ry >= 0 && ry < ROWS && start + i >= 0 && start + i < COLS) g[ry][start + i] = text[i];
};
if (isGora) {
  label(-10.1, -5.3, "KLATKA W"); label(10.1, 5.3, "KLATKA E");
  label(0, 0, "MASZYNOWNIA"); label(0, -5.0, "DZIEDZINIEC S"); label(0, 5.0, "DZIEDZINIEC N");
  label(-12, 6.5, "PODWORKO W"); label(12, -6.5, "PODWORKO E");
  label(-14.8, -0.5, "brama"); label(14.8, 0.5, "brama");
  label(0.5, -9.0, "WENT."); label(-0.5, 9.0, "PRALN.");
  label(-6.3, 0, "pod.W"); label(6.3, 0, "pod.E");
}

if (isGora) {
  console.log("GÓRA (DACH) — the roof, y = 0; the perch (^) at y = 2.0.   N ↑ (+Z)   E → (+X)");
  console.log("# structure (≥ 2.8)   = full cover (2.0–2.6)   + crouch cover (1.3)   . low, jump on (0.8)   / stair   ~ cage 4.4 m   o spawn   $ buy");
} else {
  console.log(`${map.name} (${map.id}) — ${X1 - X0} × ${Z1 - Z0} m, ground y = 0.   N ↑ (+Z)   E → (+X)`);
  console.log("# structure (≥ 2.8)   = full cover (2.0–2.8)   + crouch cover (1.2–1.6)   . low, jump on (0.5–1.0)   / stair   ~ boundary   : invisible   o/O duel starts   x spawn   $ buy   F flag   A/B site");
}
const ticks: number[] = [];
for (let x = Math.ceil(X0 / 5) * 5; x <= Math.floor(X1 / 5) * 5; x += 5) if (x > X0 && x < X1) ticks.push(x);
console.log("        " + ticks.map((x) => `x=${x}`.padStart(x < 0 ? 6 : 5)).join("    "));
for (let ry = 0; ry < ROWS; ry++) {
  const z = Z1 - ry - 1;
  console.log(`z=${String(z).padStart(3)}  |${g[ry].join("")}|`);
}
