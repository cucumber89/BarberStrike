/**
 * map-audit — every map defect this repo can prove from DATA, re-measured on demand.
 *
 * Run:  ./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-audit.ts \
 *         > apps/client/e2e/out/map1/audit.md
 *       (add a map id to audit one map: `... map-audit.ts gora`)
 *
 * WHY IT EXISTS. `docs/MAP_1_REWORK.md` lists defects with coordinates, and a coordinate written
 * in a document is stale the moment somebody moves the box. Two agents are working on this map,
 * so the brief needs a way to say "here is what is wrong RIGHT NOW" instead of "here is what was
 * wrong on the tenth". Everything below is derived from `MapDef` plus the same walk grid
 * (`walkable`/`reachable`) and pathfinder (`findPath`) the map tests and the bots use — no
 * renderer, no GPU, no browser, so it runs anywhere in about a second.
 *
 * The seven checks, and why each is a defect rather than a preference:
 *
 *  1. COPLANAR FACES. `floorAudit.ts` gates TOP faces because a floor that z-fights is what a
 *     player reported as "the floor lags". The same argument holds for every other direction: two
 *     same-facing surfaces on one plane cannot be ordered by a depth buffer, so the pixels flip as
 *     the camera moves. Only INTERPENETRATING solids count — two boxes that merely butt share a
 *     plane with their faces pointing opposite ways, and backface culling settles that.
 *  2. ELEVATED DECKS. A surface a player can stand on but can never get to reads as "leads
 *     nowhere". Measured against the real reachable set, not by eye.
 *  3. STAIR RUNS. Where a run starts and ends, and what walkable surface (if any) continues from
 *     its top step within one step height.
 *  4. PROPS vs THE FLOOR. Sunk into it or floating above it, by casting down from just above the
 *     anchor (casting from the sky finds the CEILING first — that mistake cost a pass).
 *  5. COVER CONSISTENCY. A prop that looks like cover and has no solid behind it is a fairness
 *     bug, not a cosmetic one: the same lamp stops a bullet in one street and not in the next.
 *  6. LIGHT COVERAGE AND PALETTE. How much walkable floor no practical light reaches, and how
 *     many distinct colours the map is spending.
 *  7. TEAM BALANCE. Walked path length from each team's spawns to every objective. For a 6v6
 *     tournament this is the number that decides whether the map is fair.
 */
import { MAPS, NIGHT_DISTRICT, sitesOf, type MapDef, type Solid } from "../../../../packages/shared/src/map";
import { buildCollisionWorld } from "../../../../packages/shared/src/map";
import { makeRayHit } from "../../../../packages/shared/src/collision";
import { PLAYER } from "../../../../packages/shared/src/constants";
import { walkable, reachable, cellKey } from "../../../../packages/shared/src/mapWalk";
import { findPath } from "../../../../packages/shared/src/nav";

const map: MapDef = MAPS[process.argv[2] ?? NIGHT_DISTRICT.id] ?? NIGHT_DISTRICT;
const world = buildCollisionWorld(map);
const walk = walkable(map);
const seen = reachable(walk, map.spawns[0]);
const name = (s: Solid) => s.name ?? `unnamed@${s.box.minX},${s.box.minY},${s.box.minZ}`;
const f1 = (v: number) => v.toFixed(1);

console.log(`# map-audit — ${map.id} "${map.name}"`);
console.log(`\n${map.solids.length} solids · ${map.props.length} props · ${map.lights.length} lights · ` +
  `${map.spawns.length} spawns (+${(map.arenaSpawns ?? []).length} arena) · ${walk.cells.size} walk cells\n`);

/* ---------- 1. Coplanar faces on all six directions ---------- */
console.log(`## 1. Coplanar faces (z-fighting): same-facing, within 5 mm, on solids that interpenetrate`);
type Pair = { a: string; b: string; dir: string; mm: number; area: number; at: string };
const pairs: Pair[] = [];
const S = map.solids;
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
  const A = S[i].box, B = S[j].box;
  const ox = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
  const oy = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY);
  const oz = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);
  if (ox <= 0 || oy <= 0 || oz <= 0) continue;
  const at = `${f1((Math.max(A.minX, B.minX) + Math.min(A.maxX, B.maxX)) / 2)}, ` +
             `${f1((Math.max(A.minY, B.minY) + Math.min(A.maxY, B.maxY)) / 2)}, ` +
             `${f1((Math.max(A.minZ, B.minZ) + Math.min(A.maxZ, B.maxZ)) / 2)}`;
  const add = (dir: string, d: number, area: number) => {
    if (Math.abs(d) > 0.005 || area < 0.5) return;
    pairs.push({ a: name(S[i]), b: name(S[j]), dir, mm: Math.round(d * 100000) / 100, area: Math.round(area * 100) / 100, at });
  };
  add("-X", A.minX - B.minX, oy * oz); add("+X", A.maxX - B.maxX, oy * oz);
  add("-Y", A.minY - B.minY, ox * oz); add("+Y", A.maxY - B.maxY, ox * oz);
  add("-Z", A.minZ - B.minZ, ox * oy); add("+Z", A.maxZ - B.maxZ, ox * oy);
}
const uniq = new Map<string, Pair>();
for (const p of pairs) uniq.set(`${p.a}|${p.b}|${p.dir}`, p);
const zf = [...uniq.values()].sort((a, b) => b.area - a.area);
console.log(`\n**${zf.length} pairs** (≥ 4 m²: ${zf.filter((p) => p.area >= 4).length} · ≥ 2 m²: ${zf.filter((p) => p.area >= 2).length} · ≥ 1 m²: ${zf.filter((p) => p.area >= 1).length})\n`);
if (zf.length) {
  console.log(`| dir | a | b | mm | m² | at |\n|---|---|---|---|---|---|`);
  for (const p of zf.filter((v) => v.area >= 1)) console.log(`| ${p.dir} | \`${p.a}\` | \`${p.b}\` | ${p.mm} | ${p.area} | ${p.at} |`);
}

/* ---------- 2. Elevated surfaces: standable, unreachable, and ALMOST connected ---------- */
/**
 * A ceiling is unreachable on purpose and saying so is noise. The signal is a surface a player can
 * stand on that ALMOST connects: the nearest reachable ground within 1.5 m is inside a jump-up of
 * it, so the geometry promises a route and then does not deliver one. Everything further than a
 * jump is listed separately as isolated, because that is what a roof is supposed to be.
 *
 * Read the AREA column with the gap: `reachable` walks 4-neighbours on a 0.5 m grid, so the top of a
 * one-metre crate can land in 2a simply because its own footprint separates it from the nearest grid
 * neighbour. A large surface with a tiny gap is the real defect — a 10 m² roof two centimetres off a
 * walkway is not a design decision.
 */
console.log(`\n## 2. Standable surfaces you cannot reach`);
const JUMP = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity) - 0.05;
type Deck = { name: string; y: number; area: number; cells: number; got: number; gap: number | null };
const deckRows: Deck[] = [];
for (const s of map.solids) {
  const b = s.box;
  const area = (b.maxX - b.minX) * (b.maxZ - b.minZ);
  if (b.maxY < 0.9 || area < 1) continue;
  let cells = 0, got = 0, gap: number | null = null;
  for (let x = b.minX + .25; x < b.maxX; x += .5) for (let z = b.minZ + .25; z < b.maxZ; z += .5) {
    const ys = walk.cells.get(cellKey(x, z));
    const y = ys?.find((v) => Math.abs(v - b.maxY) < .12);
    if (y === undefined) continue;
    cells++;
    if (seen.has(`${cellKey(x, z)}@${y}`)) { got++; continue; }
    // How far below this cell is the nearest reachable standing height within 1.5 m?
    for (let dx = -1.5; dx <= 1.5; dx += .5) for (let dz = -1.5; dz <= 1.5; dz += .5) {
      for (const ny of walk.cells.get(cellKey(x + dx, z + dz)) ?? []) {
        if (!seen.has(`${cellKey(x + dx, z + dz)}@${ny}`)) continue;
        const rise = y - ny;
        if (rise < -0.01) continue;
        if (gap === null || rise < gap) gap = rise;
      }
    }
  }
  if (cells && got < cells) deckRows.push({ name: name(s), y: b.maxY, area, cells, got, gap });
}
const almost = deckRows.filter((d) => d.gap !== null && d.gap <= JUMP).sort((a, b) => (a.gap ?? 9) - (b.gap ?? 9));
const isolated = deckRows.filter((d) => !(d.gap !== null && d.gap <= JUMP)).sort((a, b) => b.area - a.area);
console.log(`\n### 2a. ALMOST connected — a jump-up (${JUMP.toFixed(2)} m) or less from reachable ground, and still cut off. These are the defects.`);
if (!almost.length) console.log(`\nnone`);
else {
  console.log(`\n| surface | top y | m² | standable | reachable | shortest step from reachable ground |\n|---|---|---|---|---|---|`);
  for (const d of almost) console.log(`| \`${d.name}\` | ${d.y.toFixed(2)} | ${d.area.toFixed(1)} | ${d.cells} | ${d.got} | **${d.gap!.toFixed(2)} m** |`);
}
console.log(`\n### 2b. Isolated — more than a jump from anywhere reachable (a roof, a ceiling, cover on top of a stack). Expected, listed so a deliberate perch is not mistaken for one of these.`);
console.log(`\n${isolated.map((d) => `\`${d.name}\` ${d.y.toFixed(2)} m / ${d.area.toFixed(0)} m²`).join(" · ") || "none"}`);

/* ---------- 3. Stair runs ---------- */
console.log(`\n## 3. Stair runs — rise, and what continues from the top step`);
const runs = new Map<string, Solid[]>();
for (const s of map.solids) if (/(stair|step)_\d+$/.test(s.name ?? "")) {
  const key = s.name!.replace(/_\d+$/, "");
  runs.set(key, [...(runs.get(key) ?? []), s]);
}
console.log(`\n| run | steps | rise | top | continues onto |\n|---|---|---|---|---|`);
for (const [key, list] of runs) {
  const byTop = [...list].sort((a, b) => a.box.maxY - b.box.maxY);
  const hi = byTop[byTop.length - 1].box, lo = byTop[0].box;
  const tx = (hi.minX + hi.maxX) / 2, tz = (hi.minZ + hi.maxZ) / 2;
  const onward: string[] = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (const d of [1.0, 1.5]) {
    for (const y of walk.cells.get(cellKey(tx + dx * d, tz + dz * d)) ?? []) {
      if (y - hi.maxY > PLAYER.stepHeight + .01 || y - hi.maxY < -1.5) continue;
      const tag = `${dx > 0 ? "+X" : dx < 0 ? "-X" : dz > 0 ? "+Z" : "-Z"} @${y.toFixed(2)}`;
      if (!onward.includes(tag)) onward.push(tag);
    }
  }
  console.log(`| \`${key}\` | ${list.length} | ${lo.maxY.toFixed(2)} → ${hi.maxY.toFixed(2)} m | (${f1(tx)}, ${f1(tz)}) | ${onward.join(", ") || "**NOWHERE**"} |`);
}

/* ---------- 4. Props against the floor under them ---------- */
console.log(`\n## 4. Floor-standing props that do not sit on their floor`);
const GROUNDED = /^(lamp|pole|trash|crate|dumpster|barber_chair|wheel|sink|terminal|bottle_row)$/;
const off: string[] = [];
for (const p of map.props) {
  if (p.variant === "wall" || p.variant === "head" || p.variant === "station" || !GROUNDED.test(p.kind)) continue;
  const hit = world.raycast(p.x, p.y + 0.6, p.z, 0, -1, 0, 3, makeRayHit());
  if (!hit.hit) { off.push(`- \`${p.kind}\` @ (${p.x}, ${p.y}, ${p.z}) — no floor within 3 m below`); continue; }
  const d = p.y - (p.y + 0.6 - hit.t);
  if (Math.abs(d) > 0.05) off.push(`- \`${p.kind}(${p.variant ?? "-"})\` @ (${p.x}, ${p.y}, ${p.z}) — ${d > 0 ? "floats" : "sunk"} ${Math.abs(d).toFixed(2)} m`);
}
console.log(off.length ? "\n" + off.join("\n") : "\nnone — every floor-standing prop sits on its floor");

/* ---------- 5. Cover consistency ---------- */
console.log(`\n## 5. Props that read as cover — which ones actually stop a bullet`);
const COVER = /^(lamp|pole|barber_pole|crate|dumpster|trash)$/;
const withSolid: string[] = [], without: string[] = [];
for (const p of map.props.filter((v) => COVER.test(v.kind) && v.variant !== "wall" && v.variant !== "head")) {
  const solid = map.solids.find((s) => Math.abs((s.box.minX + s.box.maxX) / 2 - p.x) < .5 &&
    Math.abs((s.box.minZ + s.box.maxZ) / 2 - p.z) < .5 && s.box.maxY > 1);
  (solid ? withSolid : without).push(`${p.kind}(${p.variant ?? "-"}) @ (${p.x}, ${p.z})`);
}
console.log(`\n- backed by a collision solid: **${withSolid.length}**`);
console.log(`- drawn only, no collision at all: **${without.length}**${without.length ? " — " + without.join("; ") : ""}`);
if (withSolid.length && without.length) console.log(`\n> Both kinds exist on this map, so the same object is cover in one place and air in another.`);

/* ---------- 6. Light coverage and palette ---------- */
console.log(`\n## 6. Lighting`);
let lit = 0, dark = 0; const darkAt: string[] = [];
const b = map.bounds;
for (let x = b.minX + 2; x < b.maxX; x += 4) for (let z = b.minZ + 2; z < b.maxZ; z += 4) {
  const hit = world.raycast(x, 8, z, 0, -1, 0, 14, makeRayHit());
  if (!hit.hit) continue;
  const y = 8 - hit.t;
  if (map.lights.some((l) => Math.hypot(l.x - x, l.y - (y + 1), l.z - z) < l.range)) lit++;
  else { dark++; darkAt.push(`(${x}, ${z})`); }
}
const colours = new Set(map.lights.map((l) => l.color));
const warm = map.lights.filter((l) => parseInt(l.color.slice(1, 3), 16) > parseInt(l.color.slice(5, 7), 16) + 20).length;
const cool = map.lights.filter((l) => parseInt(l.color.slice(5, 7), 16) > parseInt(l.color.slice(1, 3), 16) + 20).length;
console.log(`\n- ${map.lights.length} practicals in **${colours.size} distinct colours** (warm ${warm} · cool ${cool} · neutral ${map.lights.length - warm - cool})`);
console.log(`- lights flagged \`shadows\`: ${map.lights.filter((l) => l.shadows).length} (the renderer casts shadows from the moon only)`);
console.log(`- walkable floor sampled on a 4 m grid: **${dark} of ${lit + dark} points (${Math.round(dark / (lit + dark) * 100)} %) have no practical light in range**`);
if (dark) console.log(`- dark points: ${darkAt.slice(0, 80).join(" ")}${darkAt.length > 80 ? ` … +${darkAt.length - 80}` : ""}`);

/* ---------- 7. Team balance ---------- */
console.log(`\n## 7. Team balance — walked path length from each team's spawns (6v6 fairness)`);
const pathLen = (p: { x: number; y: number; z: number }[] | null) =>
  p ? p.slice(1).reduce((acc, c, i) => acc + Math.hypot(c.x - p[i].x, c.z - p[i].z), 0) : null;
const objectives = [
  ...sitesOf(map).map((s) => ({ id: `bomb ${s.id} ${s.name}`, ...s })),
  ...map.flags.map((f) => ({ id: `flag ${f.id} ${f.name}`, ...f })),
  ...map.stations.map((s) => ({ id: `buy ${s.name}`, ...s })),
];
console.log(`\n| objective | team 0 median | team 1 median | gap |\n|---|---|---|---|`);
for (const o of objectives) {
  const med = [0, 1].map((team) => {
    const ds = map.spawns.filter((s) => s.team === team).map((s) => pathLen(findPath(walk, s, o))).filter((v): v is number => v !== null).sort((p, q) => p - q);
    return ds.length ? ds[Math.floor(ds.length / 2)] : null;
  });
  if (med[0] === null || med[1] === null) { console.log(`| ${o.id} | — | — | **unreachable for a team** |`); continue; }
  const gap = med[0] - med[1];
  console.log(`| ${o.id} | ${f1(med[0])} m | ${f1(med[1])} m | ${Math.abs(gap) < 3 ? "level" : `**team ${gap > 0 ? 1 : 0} closer by ${f1(Math.abs(gap))} m**`} |`);
}
console.log(`\n| team | spawns | x spread | z spread | closest pair | sees map centre |\n|---|---|---|---|---|---|`);
const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
for (const team of [0, 1]) {
  const sp = map.spawns.filter((s) => s.team === team);
  const xs = sp.map((s) => s.x), zs = sp.map((s) => s.z);
  let closest = Infinity;
  for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) closest = Math.min(closest, Math.hypot(sp[i].x - sp[j].x, sp[i].z - sp[j].z));
  const exposed = sp.filter((s) => {
    const dx = cx - s.x, dz = cz - s.z, L = Math.hypot(dx, dz);
    return !world.raycast(s.x, s.y + PLAYER.eyeHeight, s.z, dx / L, 0, dz / L, L, makeRayHit()).hit;
  }).length;
  console.log(`| ${team} | ${sp.length} | ${f1(Math.max(...xs) - Math.min(...xs))} m | ${f1(Math.max(...zs) - Math.min(...zs))} m | ${f1(closest)} m | ${exposed}/${sp.length} |`);
}
console.log(`\n> A team whose spawns spread across the whole map cannot leave spawn as a unit — for a 6v6 that is a layout decision, not a detail.`);
