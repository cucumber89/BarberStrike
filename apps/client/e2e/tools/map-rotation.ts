/**
 * map-rotation — Drop G. The numbers in `docs/MAP_2.md` are measured here, not guessed.
 *
 * Run:  ./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-rotation.ts \
 *         > apps/client/e2e/out/g/rotation.md
 *
 * It runs the REAL shared simulation (`simulateBody`) — the same code the server ticks and the
 * client predicts with — and reports four things:
 *   1. the movement model: steady speeds, the acceleration ramp, stop distance;
 *   2. what a corner and a flight of stairs actually cost in this model (answer: nothing);
 *   3. NIGHT_DISTRICT's real rotations, walked on its real walk grid with its real geometry, and
 *      its sight-line distribution — the reference the duel maps are compared against;
 *   4. the duel map named on the command line (`map-rotation.ts [map id]`, default gora), walked
 *      from BOTH starts on its real geometry — the rotation table `docs/MAP_2.md` quotes for GÓRA
 *      (the full fairness audit is `map-duel.ts`).
 *
 * WHY THE MAP ID (Drop W). Section 4 was pinned to GÓRA: it imported `GORA`, listed its places by
 * hand and timed team 1 on the 180° twin of every route, which is only "the same route" on a map
 * that is its own rotation. DOLNA is a real plot with no twin, so its places are a table
 * (`DOLNA_PLACES` via `map-profiles.ts`; a leading "*" marks a contested place) and both starts
 * are walked to the SAME point: the contested places, the eight places the brief's R4 names, and
 * each other's start. GÓRA keeps its own rows and its twin, so the default run is bit-identical
 * to `apps/client/e2e/out/g/rotation.md`. Sections 1–3 do not depend on the map id.
 */
import { CollisionWorld, boxFrom, makeRayHit } from "../../../../packages/shared/src/collision";
import { PLAYER } from "../../../../packages/shared/src/constants";
import { createBody, simulateBody, TAC, MOVE } from "../../../../packages/shared/src/movement";
import { Btn } from "../../../../packages/shared/src/types";
import { NIGHT_DISTRICT, buildCollisionWorld } from "../../../../packages/shared/src/map";
import { walkable, reachable, cellKey, WALK_GRID } from "../../../../packages/shared/src/mapWalk";
import { prepareNav, findPath, type NavPoint } from "../../../../packages/shared/src/nav";
import { pickProfile } from "./map-profiles";

const DT = 1000 / 60;
type P = [number, number];

const flatWorld = (): CollisionWorld => {
  const w = new CollisionWorld();
  w.addBoxes([boxFrom(-200, -1, -200, 400, 1, 400)]);
  return w;
};
const inp = (seq: number, buttons: number, yaw: number) => ({ seq, dt: DT, buttons, yaw, pitch: 0 });
const line = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const polyLen = (p: P[]) => p.slice(1).reduce((a, c, i) => a + line(p[i], c), 0);
const rnd32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function profile(name: string, buttons: number, scale = 1): void {
  const w = flatWorld();
  const b = createBody(0, 0, 0);
  b.grounded = true;
  let seq = 0;
  const v: number[] = [];
  for (let i = 0; i < 360; i++) {
    const px = b.x, pz = b.z;
    simulateBody(w, b, inp(seq++, buttons, 0), scale, buttons);
    v.push(Math.hypot(b.x - px, b.z - pz) / (DT / 1000));
  }
  const steady = v.slice(-60).reduce((a, c) => a + c, 0) / 60;
  const b2 = createBody(0, 0, 0); b2.grounded = true; seq = 0;
  let t90 = -1, d90 = 0, t = 0;
  for (let i = 0; i < 360; i++) {
    const px = b2.x, pz = b2.z;
    simulateBody(w, b2, inp(seq++, buttons, 0), scale, buttons);
    t += DT;
    if (t90 < 0 && Math.hypot(b2.x - px, b2.z - pz) / (DT / 1000) >= steady * 0.9) { t90 = t; d90 = Math.hypot(b2.x, b2.z); }
  }
  const b3 = createBody(0, 0, 0); b3.grounded = true; seq = 0;
  for (let i = 0; i < 180; i++) simulateBody(w, b3, inp(seq++, buttons, 0), scale, buttons);
  const sx = b3.x, sz = b3.z;
  for (let i = 0; i < 300; i++) simulateBody(w, b3, inp(seq++, 0, 0), scale, buttons);
  console.log(`| ${name} | ${steady.toFixed(2)} | ${t90.toFixed(0)} ms / ${d90.toFixed(2)} m | ${Math.hypot(b3.x - sx, b3.z - sz).toFixed(2)} m |`);
}

function runRoute(world: CollisionWorld, pts: P[], y = 0, buttons = Btn.Forward | Btn.Sprint): { s: number; stuck: boolean } {
  const b = createBody(pts[0][0], y, pts[0][1]);
  b.grounded = true;
  let seq = 0, t = 0, target = 1, lastProgress = 0, stuck = false;
  while (target < pts.length) {
    const dx = pts[target][0] - b.x, dz = pts[target][1] - b.z;
    if (Math.hypot(dx, dz) < 0.6) { target++; continue; }
    const px = b.x, pz = b.z;
    simulateBody(world, b, inp(seq++, buttons, Math.atan2(dx, dz)), 1, buttons);
    t += DT;
    if (Math.hypot(b.x - px, b.z - pz) > 0.02) lastProgress = t;
    if (t - lastProgress > 1500 || t > 120000) { stuck = true; break; }
  }
  return { s: t / 1000, stuck };
}

const table = (rows: [string, P[]][]) => {
  for (const [name, pts] of rows) {
    const r = runRoute(flatWorld(), pts);
    console.log(`| ${name} | ${polyLen(pts).toFixed(1)} | ${r.s.toFixed(1)} |`);
  }
};

console.log(`# Drop G — measured movement, rotations and sight lines\n`);
console.log(`Generated by \`apps/client/e2e/tools/map-rotation.ts\` (real \`simulateBody\`, 60 Hz).\n`);

console.log(`## 1. The movement model\n`);
console.log(`Constants: walk ${PLAYER.walkSpeed}, sprint ${PLAYER.sprintSpeed}, crouch ${PLAYER.crouchSpeed} m/s; ground accel ${PLAYER.groundAccel}, friction ${PLAYER.friction}; tac sprint ×${TAC.speedScale} (budget ${TAC.budgetMs} ms), ADS ×${MOVE.adsSpeedScale}; step height ${PLAYER.stepHeight} m.\n`);
console.log(`| Gait | Steady (m/s) | 90 % of top after | Stop distance |`);
console.log(`|---|---|---|---|`);
profile("walk (W)", Btn.Forward);
profile("sprint (W+Shift)", Btn.Forward | Btn.Sprint);
profile("tac sprint (double-tap Shift)", Btn.Forward | Btn.Sprint | Btn.Tac);
profile("crouch (W+Ctrl)", Btn.Forward | Btn.Crouch);
profile("ADS walk (×0.8)", Btn.Forward | Btn.Aim, MOVE.adsSpeedScale);
profile("strafe (D)", Btn.Right);

console.log(`\n## 2. What corners and stairs cost\n`);
console.log(`| Route | Path (m) | Time (s) | Effective (m/s) |`);
console.log(`|---|---|---|---|`);
for (const [name, pts] of [
  ["straight 20 m", [[0, 0], [0, 20]]],
  ["one 90° corner (10+10)", [[0, 0], [0, 10], [10, 10]]],
  ["two 90° corners (7+6+7)", [[0, 0], [0, 7], [6, 7], [6, 14]]],
  ["four 90° corners (5×5)", [[0, 0], [0, 5], [5, 5], [5, 10], [10, 10], [10, 15]]],
] as [string, P[]][]) {
  const r = runRoute(flatWorld(), pts);
  console.log(`| ${name} | ${polyLen(pts).toFixed(1)} | ${r.s.toFixed(2)} | ${(polyLen(pts) / r.s).toFixed(2)} |`);
}
{
  const w = new CollisionWorld();
  const boxes = [boxFrom(-5, -1, -8, 20, 1, 30)];
  for (let i = 0; i < 9; i++) boxes.push(boxFrom(-1, 0, i * 0.5, 2, (i + 1) * 0.3334, 0.5));
  boxes.push(boxFrom(-1, 0, 4.5, 2, 3.0, 6));
  w.addBoxes(boxes);
  const climb = (world: CollisionWorld) => {
    const b = createBody(0, 0, -4); b.grounded = true;
    let seq = 0, t = 0;
    while (b.z < 7 && t < 20000) { simulateBody(world, b, inp(seq++, Btn.Forward | Btn.Sprint, 0), 1, Btn.Forward | Btn.Sprint); t += DT; }
    return { t: t / 1000, y: b.y };
  };
  const up = climb(w), flat = climb(flatWorld());
  console.log(`| 11 m including a 3.0 m stair (9 × 0.333 m rise) | 11.0 | ${up.t.toFixed(2)} | — (ends at y=${up.y.toFixed(2)}) |`);
  console.log(`| the same 11 m flat | 11.0 | ${flat.t.toFixed(2)} | — |`);
  console.log(`\nA corner and a stair are **free** in this model: acceleration is proportional to the wish speed and the step-up sweep does not shed velocity. Height costs exposure, not time.\n`);

  // Sprint jump: how wide a gap the movement model actually clears, and how high a jump reaches.
  const g = flatWorld();
  const b = createBody(0, 0, 0); b.grounded = true;
  let seq = 0;
  for (let i = 0; i < 60; i++) simulateBody(g, b, inp(seq++, Btn.Forward | Btn.Sprint, 0), 1, Btn.Forward | Btn.Sprint);
  const z0 = b.z;
  simulateBody(g, b, inp(seq++, Btn.Forward | Btn.Sprint | Btn.Jump, 0), 1, Btn.Forward | Btn.Sprint);
  let apex = 0, air = 0;
  while (!b.grounded && air < 3000) {
    simulateBody(g, b, inp(seq++, Btn.Forward | Btn.Sprint, 0), 1, Btn.Forward | Btn.Sprint | Btn.Jump);
    apex = Math.max(apex, b.y); air += DT;
  }
  console.log(`**Sprint jump:** ${(b.z - z0).toFixed(2)} m of ground covered, apex ${apex.toFixed(2)} m, ${air.toFixed(0)} ms in the air. A gap wider than ${(b.z - z0).toFixed(1)} m cannot be jumped.\n`);
}

console.log(`\n## 3. NIGHT_DISTRICT — the reference (real geometry, real walk grid)\n`);
const nd = buildCollisionWorld(NIGHT_DISTRICT);
const walk = walkable(NIGHT_DISTRICT);
prepareNav(walk);
const t0 = NIGHT_DISTRICT.spawns.find((s) => s.team === 0)!;
const t1 = NIGHT_DISTRICT.spawns.find((s) => s.team === 1)!;
console.log(`| Rotation | Straight (m) | Path (m) | Sprint (s) |`);
console.log(`|---|---|---|---|`);
for (const [name, from, to] of [
  ["bomb A DEPOT → bomb B COURTYARD", { x: -35, y: 0.2, z: 24 }, { x: 43, y: 0.2, z: 24 }],
  ["team 0 spawn → site A", { x: t0.x, y: t0.y, z: t0.z }, { x: -35, y: 0.2, z: 24 }],
  ["team 0 spawn → site B", { x: t0.x, y: t0.y, z: t0.z }, { x: 43, y: 0.2, z: 24 }],
  ["team 1 spawn → site A", { x: t1.x, y: t1.y, z: t1.z }, { x: -35, y: 0.2, z: 24 }],
  ["team 0 spawn → flag B (the shop)", { x: t0.x, y: t0.y, z: t0.z }, { x: 3.4, y: 0.2, z: 7.2 }],
  ["team 0 spawn → team 1 spawn", { x: t0.x, y: t0.y, z: t0.z }, { x: t1.x, y: t1.y, z: t1.z }],
] as [string, { x: number; y: number; z: number }, { x: number; y: number; z: number }][]) {
  const path = findPath(walk, from, to, 60000);
  if (!path) { console.log(`| ${name} | — | NO PATH | — |`); continue; }
  const pts: P[] = path.map((p) => [p.x, p.z]);
  const r = runRoute(nd, pts, from.y);
  console.log(`| ${name} | ${Math.hypot(to.x - from.x, to.z - from.z).toFixed(1)} | ${polyLen(pts).toFixed(1)} | ${r.stuck ? (polyLen(pts) / 7.6).toFixed(1) + " (est)" : r.s.toFixed(1)} |`);
}
{
  const cells: { x: number; z: number; y: number }[] = [];
  for (const [key, ys] of walk.cells) {
    const [cx, cz] = key.split(",").map(Number);
    for (const y of ys) cells.push({ x: cx / 2, z: cz / 2, y });
  }
  const rnd = rnd32(12345);
  const clear: number[] = [];
  let max = 0, N = 400000;
  for (let i = 0; i < N; i++) {
    const a = cells[(rnd() * cells.length) | 0], b = cells[(rnd() * cells.length) | 0];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) continue;
    if (!nd.raycast(a.x, a.y + PLAYER.eyeHeight, a.z, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit) {
      clear.push(len);
      if (len > max) max = len;
    }
  }
  clear.sort((p, q) => p - q);
  const pc = (f: number) => clear[Math.floor(clear.length * f)].toFixed(1);
  const over = (m: number) => ((clear.filter((c) => c >= m).length / clear.length) * 100).toFixed(1);
  const ndReach = reachable(walk, NIGHT_DISTRICT.spawns[0]);
  console.log(`\n**Sight lines.** ${walk.cells.size} walkable cells at ${WALK_GRID} m (${ndReach.size} surfaces reachable from spawn 0 = ${(ndReach.size * WALK_GRID * WALK_GRID).toFixed(0)} m²). ${N} random eye-to-eye pairs, ${clear.length} unobstructed (${((clear.length / N) * 100).toFixed(1)} %):`);
  console.log(`median **${pc(0.5)} m**, p90 ${pc(0.9)} m, p99 ${pc(0.99)} m, longest **${max.toFixed(1)} m**.`);
  console.log(`Of the clear lines, ${over(20)} % are over 20 m, ${over(30)} % over 30 m, ${over(50)} % over 50 m.\n`);
}

// ---------------------------------------------------------------------------------------------
// 4. The duel map as built. The flat's drafted polylines that used to sit here were the drawing
//    the flat was signed off on; a duel map is measured on its real geometry and its real walk
//    grid, from BOTH starts, so the fairness claim is a number. `map-duel.ts` is the full audit
//    (spawn lines, symmetry, choices, climbing, floating); this is the rotation table.
// ---------------------------------------------------------------------------------------------
const duelProfile = pickProfile();
const GMAP = duelProfile.map;
console.log(`\n## 4. ${GMAP.name} as built (real geometry, real walk grid, both starts)\n`);
const gora = buildCollisionWorld(GMAP);
const gwalk = walkable(GMAP);
prepareNav(gwalk);
const g0 = GMAP.spawns.find((s) => s.team === 0)!;
const g1 = GMAP.spawns.find((s) => s.team === 1)!;
const walkFrom = (a: NavPoint, b: NavPoint) => {
  const path = findPath(gwalk, a, b, 60000);
  if (!path) return null;
  const pts: P[] = path.map((p) => [p.x, p.z]);
  return { m: polyLen(pts), ...runRoute(gora, pts, a.y) };
};
const est = (r: { m: number; s: number; stuck: boolean }) => r.stuck ? (r.m / 7.6).toFixed(1) + " (est)" : r.s.toFixed(2);
if (duelProfile.twin) {
  // A map that is its own rotation: T1 walks the 180° twin of T0's route. GÓRA's rows, as quoted
  // in `docs/MAP_2.md`.
  const grot = duelProfile.twin;
  const gsite = (id: string) => { const s = GMAP.sites!.find((v) => v.id === id)!; return { x: s.x, y: 0, z: s.z }; };
  const gflag = (id: string) => { const f = GMAP.flags.find((v) => v.id === id)!; return { x: f.x, y: f.y, z: f.z }; };
  console.log(`| Rotation (from T0; T1 walks the 180° twin) | Straight (m) | Path (m) | T0 (s) | T1 (s) |`);
  console.log(`|---|---|---|---|---|`);
  for (const [name, from, to] of [
    ["start → own crossroads (podest W)", { x: g0.x, y: g0.y, z: g0.z }, { x: -6.2, y: 0, z: 0 }],
    ["start → the perch", { x: g0.x, y: g0.y, z: g0.z }, gflag("C")],
    ["start → own lane nook", { x: g0.x, y: g0.y, z: g0.z }, { x: -3.2, y: 0, z: -9.4 }],
    ["start → bomb A (own yard)", { x: g0.x, y: g0.y, z: g0.z }, gsite("A")],
    ["start → bomb B (far yard)", { x: g0.x, y: g0.y, z: g0.z }, gsite("B")],
    ["start → flag A (own gate)", { x: g0.x, y: g0.y, z: g0.z }, gflag("A")],
    ["start → flag B (far gate)", { x: g0.x, y: g0.y, z: g0.z }, gflag("B")],
    ["start → the other start (first contact)", { x: g0.x, y: g0.y, z: g0.z }, { x: g1.x, y: g1.y, z: g1.z }],
    ["bomb A ↔ bomb B", gsite("A"), gsite("B")],
    ["perch → own lane nook", gflag("C"), { x: -3.2, y: 0, z: -9.4 }],
  ] as [string, NavPoint, NavPoint][]) {
    const a = walkFrom(from, to), b = walkFrom(grot(from), grot(to));
    if (!a || !b) { console.log(`| ${name} | — | NO PATH | — | — |`); continue; }
    console.log(`| ${name} | ${Math.hypot(to.x - from.x, to.z - from.z).toFixed(1)} | ${a.m.toFixed(1)} | ${est(a)} | ${est(b)} |`);
  }
} else {
  // No twin: both starts walk to the SAME place — every contested ("*") place, then the places the
  // brief's R4 names, then each other's start.
  const R4: Readonly<Record<string, readonly string[]>> = {
    dolna: ["gate", "wicket", "garage_door", "shed_w_door", "hall_mouth", "*street_mid", "toj"],
  };
  const names = [...Object.keys(duelProfile.places).filter((n) => n.startsWith("*")), ...(R4[GMAP.id] ?? [])].filter((n, i, all) => all.indexOf(n) === i);
  const A: NavPoint = { x: g0.x, y: g0.y, z: g0.z }, B: NavPoint = { x: g1.x, y: g1.y, z: g1.z };
  console.log(`Both starts walk to the SAME place (T0 from (${g0.x}, ${g0.z}), T1 from (${g1.x}, ${g1.z})); "*" marks a contested place, the ones the 250 ms brief applies to.\n`);
  console.log(`| Place | Straight T0 / T1 (m) | Path T0 / T1 (m) | T0 (s) | T1 (s) | Δ (ms) |`);
  console.log(`|---|---|---|---|---|---|`);
  const row = (name: string, toA: NavPoint, toB: NavPoint) => {
    const a = walkFrom(A, toA), b = walkFrom(B, toB);
    if (!a || !b) { console.log(`| ${name} | — | ${a ? a.m.toFixed(1) : "NO PATH"} / ${b ? b.m.toFixed(1) : "NO PATH"} | — | — | — |`); return; }
    console.log(`| ${name} | ${Math.hypot(toA.x - A.x, toA.z - A.z).toFixed(1)} / ${Math.hypot(toB.x - B.x, toB.z - B.z).toFixed(1)} | ${a.m.toFixed(1)} / ${b.m.toFixed(1)} | ${est(a)} | ${est(b)} | ${(Math.abs(a.s - b.s) * 1000).toFixed(0)} |`);
  };
  for (const n of names) {
    const to = duelProfile.places[n];
    if (!to) { console.log(`| ${n} | — | not in the places table | — | — | — |`); continue; }
    row(n, to, to);
  }
  row("start → the other start (first contact)", B, A);
}
{
  const cells: { x: number; z: number; y: number }[] = [];
  for (const [key, ys] of gwalk.cells) {
    const [cx, cz] = key.split(",").map(Number);
    // `cellKey` is round(centre × 2) with centres at .25 offsets: key K is the centre K / 2 − 0.25.
    for (const y of ys) cells.push({ x: cx / 2 - 0.25, z: cz / 2 - 0.25, y });
  }
  const reach = reachable(gwalk, GMAP.spawns[0]);
  const live = cells.filter((c) => reach.has(`${cellKey(c.x, c.z)}@${c.y}`));
  const rnd = rnd32(12345);
  const clear: number[] = [];
  let max = 0, pair = "";
  const N = 400000;
  for (let i = 0; i < N; i++) {
    const a = live[(rnd() * live.length) | 0], b = live[(rnd() * live.length) | 0];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) continue;
    if (!gora.raycast(a.x, a.y + PLAYER.eyeHeight, a.z, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit) {
      clear.push(len);
      if (len > max) { max = len; pair = `(${a.x},${a.y},${a.z}) → (${b.x},${b.y},${b.z})`; }
    }
  }
  clear.sort((p, q) => p - q);
  const pc = (f: number) => clear[Math.floor(clear.length * f)].toFixed(1);
  const over = (m: number) => ((clear.filter((c) => c >= m).length / clear.length) * 100).toFixed(1);
  console.log(`\n**Sight lines.** ${gwalk.cells.size} walkable cells (${live.length} surfaces reachable from the start = ${(live.length * WALK_GRID * WALK_GRID).toFixed(0)} m²). ${N} random eye-to-eye pairs, ${clear.length} unobstructed (${((clear.length / N) * 100).toFixed(1)} %):`);
  console.log(`median **${pc(0.5)} m**, p90 ${pc(0.9)} m, p99 ${pc(0.99)} m, longest **${max.toFixed(1)} m** ${pair}.`);
  console.log(`Of the clear lines, ${over(10)} % are over 10 m, ${over(20)} % over 20 m, ${over(30)} % over 30 m.\n`);
}
