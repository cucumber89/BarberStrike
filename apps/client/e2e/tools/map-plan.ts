/**
 * map-plan — Drop G. Renders the top-down ASCII plan in `docs/MAP_2.md` FROM the extents table in
 * that document, so the picture and the numbers cannot drift apart.
 *
 * Run: ./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-plan.ts \
 *        > apps/client/e2e/out/g/plan.txt
 *
 * 2 characters per metre in X, 1 line per metre in Z (a terminal cell is about 1×2, so the plan is
 * roughly true to scale). +X east, +Z north — north is UP, as in `map.ts`.
 */
type Rect = { x0: number; x1: number; z0: number; z1: number; fill: string; label?: string };

const X0 = -18, X1 = 18, Z0 = -8, Z1 = 12;
const COLS = (X1 - X0) * 2, ROWS = Z1 - Z0;
const col = (x: number) => Math.round((x - X0) * 2);
const row = (z: number) => Math.round(Z1 - z);

const LEVEL0: Rect[] = [
  { x0: -17, x1: -8, z0: -7, z1: 1, fill: " ", label: "SALON" },
  { x0: -17, x1: -8, z0: 3, z1: 9, fill: " ", label: "KUCHNIA" },
  { x0: 8, x1: 17, z0: -7, z1: 1, fill: " ", label: "SYPIALNIA" },
  { x0: 8, x1: 17, z0: 3, z1: 9, fill: " ", label: "SKLAD" },
  { x0: -8, x1: 8, z0: -1, z1: 1, fill: " ", label: "HOL POL." },
  { x0: -2.5, x1: 2.5, z0: -6, z1: -1, fill: " ", label: "LAZIENKA" },
  { x0: -8, x1: -4.5, z0: 1, z1: 5, fill: " ", label: "KLATKA" },
  { x0: 4.5, x1: 8, z0: 1, z1: 5, fill: " ", label: "PRZEDP." },
  { x0: -4.5, x1: -2.5, z0: 1, z1: 5, fill: " " },
  { x0: 2.5, x1: 4.5, z0: 1, z1: 5, fill: " " },
  { x0: -2.5, x1: 2.5, z0: 1, z1: 5, fill: "#", label: "RDZEN" },
  { x0: -8, x1: -2.5, z0: 5, z1: 8, fill: " ", label: "HOL PN-W" },
  { x0: 2.5, x1: 8, z0: 5, z1: 8, fill: " ", label: "HOL PN-E" },
  { x0: -2.5, x1: 2.5, z0: 5, z1: 8, fill: ":", label: "SZYB" },
  { x0: -6, x1: -4, z0: 8, z1: 9, fill: " " },
  { x0: 4, x1: 6, z0: 8, z1: 9, fill: " " },
  { x0: -10, x1: 10, z0: 9, z1: 11, fill: " ", label: "BALKON" },
  { x0: 10, x1: 14, z0: 9, z1: 11, fill: "/", label: "SCHODY" },
];

const LEVEL1: Rect[] = [
  { x0: 6, x1: 13.5, z0: -2, z1: 9, fill: " ", label: "DACH  y=3.0" },
  { x0: 15.7, x1: 17, z0: -2, z1: 9, fill: " " },
  { x0: 13.5, x1: 15.7, z0: -2, z1: 3.4, fill: " " },
  { x0: 13.5, x1: 15.7, z0: 7.9, z1: 9, fill: " " },
  { x0: 13.5, x1: 15.7, z0: 3.4, z1: 7.9, fill: "/", label: "STRYCH" },
  { x0: 10, x1: 15.2, z0: 9, z1: 11, fill: "/", label: "SCHODY" },
];

function render(rects: Rect[], title: string): void {
  const g: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill("░"));
  // rooms
  for (const r of rects) for (let z = r.z0; z < r.z1; z++) for (let cx = col(r.x0); cx < col(r.x1); cx++) {
    const ry = row(z) - 1;
    if (ry >= 0 && ry < ROWS && cx >= 0 && cx < COLS) g[ry][cx] = r.fill;
  }
  // outline: any floor cell with a non-floor neighbour gets a wall char on the boundary
  const solid = (cx: number, ry: number) => cx < 0 || ry < 0 || cx >= COLS || ry >= ROWS || g[ry][cx] === "░";
  const out = g.map((line, ry) => line.map((c, cx) => {
    if (c !== "░") return c;
    return solid(cx - 1, ry) && solid(cx + 1, ry) && solid(cx, ry - 1) && solid(cx, ry + 1) ? " " : "#";
  }));
  // labels, centred
  for (const r of rects) {
    if (!r.label) continue;
    const ry = row((r.z0 + r.z1) / 2) - 1;
    const start = Math.round((col(r.x0) + col(r.x1) - r.label.length) / 2);
    for (let i = 0; i < r.label.length; i++) if (ry >= 0 && ry < ROWS && start + i >= 0 && start + i < COLS) out[ry][start + i] = r.label[i];
  }
  console.log(title);
  console.log("        " + [-15, -10, -5, 0, 5, 10, 15].map((x) => `x=${x}`.padStart(x < 0 ? 6 : 5)).join("    "));
  for (let ry = 0; ry < ROWS; ry++) {
    const z = Z1 - ry - 1;
    console.log(`z=${String(z).padStart(3)}  |${out[ry].join("")}|`);
  }
  console.log("");
}

render(LEVEL0, "LEVEL 0 — the flat (floor y = 0, ceiling 2.8)   N ↑ (+Z)   E → (+X)   # wall/solid   : open shaft   / stair");
render(LEVEL1, "LEVEL +1 — DACH, the roof over the east wing (deck y = 3.0, parapet 1.2). / = the fire escape up from the balcony and the loft-stair opening down into the SKŁAD.");
