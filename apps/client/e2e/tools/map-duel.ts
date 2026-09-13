/**
 * map-duel — the 1v1 fairness audit of GÓRA (DACH), re-measured on demand.
 *
 * Run:  ./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-duel.ts \
 *         > apps/client/e2e/out/g/duel.md
 *
 * Everything here is derived from the shared map data, the same walk grid the bots path on and the
 * same `simulateBody` the server ticks — no renderer, no browser. Seven sections:
 *   1. the two starts cannot see each other (every team-0 point against every team-1 point, standing
 *      and crouching, both ways);
 *   2. the geometry is a 180° rotation of itself (every solid off the centre line has a twin);
 *   3. walked routes from BOTH duel starts to the same set of places, sprint held, with the
 *      difference in milliseconds — the number the brief asks to be under 250;
 *   4. what a player can choose after 2–4 s: how many distinct exits each start has within 15 and
 *      30 m of path;
 *   5. sight lines: median / p90 / longest over the reachable surfaces, and the perch's view;
 *   6. what can be climbed: every standing surface reachable by chaining the real 1.25 m mantle,
 *      which is how a "nobody gets on the roof" claim is proved rather than assumed;
 *   7. nothing floats: every solid stands on the deck, on another solid, or hangs from the line.
 */
import { CollisionWorld, makeRayHit } from "../../../../packages/shared/src/collision";
import { PLAYER } from "../../../../packages/shared/src/constants";
import { createBody, simulateBody, MOVE } from "../../../../packages/shared/src/movement";
import { Btn } from "../../../../packages/shared/src/types";
import { buildCollisionWorld, type Solid } from "../../../../packages/shared/src/map";
import { GORA, GORA_PERCH_Y } from "../../../../packages/shared/src/gora";
import { walkable, reachable, snapCoord, JUMP_UP, WALK_GRID } from "../../../../packages/shared/src/mapWalk";
import { prepareNav, findPath, type NavPoint } from "../../../../packages/shared/src/nav";

const DT = 1000 / 60;
type P = [number, number];
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const inp = (seq: number, buttons: number, yaw: number) => ({ seq, dt: DT, buttons, yaw, pitch: 0 });
const polyLen = (p: P[]) => p.slice(1).reduce((a, c, i) => a + Math.hypot(c[0] - p[i][0], c[1] - p[i][1]), 0);
const rnd32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const map = GORA;
const world = buildCollisionWorld(map);
const walk = walkable(map);
prepareNav(walk);
const t0 = map.spawns.filter((s) => s.team === 0), t1 = map.spawns.filter((s) => s.team === 1);
const seen = reachable(walk, t0[0]);
const rot = (p: NavPoint): NavPoint => ({ x: -p.x, y: p.y, z: -p.z });
const sees = (w: CollisionWorld, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  return !w.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit;
};

/** Walks a polyline with the real mover, sprint held, turning to face the next waypoint. */
function runRoute(path: NavPoint[], y = 0): { s: number; stuck: boolean } {
  const pts: P[] = path.map((p) => [p.x, p.z]);
  const b = createBody(pts[0][0], y, pts[0][1]);
  b.grounded = true;
  const buttons = Btn.Forward | Btn.Sprint;
  let seq = 0, t = 0, target = 1, lastProgress = 0, stuck = false, prev = buttons;
  while (target < pts.length) {
    const dx = pts[target][0] - b.x, dz = pts[target][1] - b.z;
    if (Math.hypot(dx, dz) < 0.6) { target++; continue; }
    const px = b.x, pz = b.z;
    // A bot presses jump at a waypoint that is a hop up (a 0.8 m crate); stairs are steps.
    const hop = path[target].y - b.y > PLAYER.stepHeight && b.grounded && Math.hypot(dx, dz) < 1.2;
    const btn = buttons | (hop ? Btn.Jump : 0);
    simulateBody(world, b, inp(seq++, btn, Math.atan2(dx, dz)), 1, prev);
    prev = btn;
    t += DT;
    if (Math.hypot(b.x - px, b.z - pz) > 0.02) lastProgress = t;
    if (t - lastProgress > 1500 || t > 60000) { stuck = true; break; }
  }
  // Pressed against the last waypoint's own cover counts as arrived, not stuck.
  const last = pts[pts.length - 1];
  if (stuck && Math.hypot(last[0] - b.x, last[1] - b.z) < 1.0) stuck = false;
  return { s: t / 1000, stuck };
}

function route(from: NavPoint, to: NavPoint): { m: number; s: number; stuck: boolean } | null {
  const path = findPath(walk, from, to, 60000);
  if (!path) return null;
  const r = runRoute(path, from.y);
  return { m: polyLen(path.map((p) => [p.x, p.z])), s: r.s, stuck: r.stuck };
}
type Walked = { m: number; s: number; stuck: boolean } | null;

console.log(`# map-duel — ${map.id} "${map.name}"\n`);
console.log(`${map.solids.length} solids · ${map.props.length} props · ${map.lights.length} lights · ${map.spawns.length} team spawns + ${map.arenaSpawns?.length ?? 0} arena · ${walk.cells.size} walk cells, ${seen.size} surfaces reachable from the duel start.\n`);

/* ---------- 1. Spawn lines ---------- */
console.log(`## 1. The starts cannot see each other\n`);
{
  const eyes = [PLAYER.eyeHeight, PLAYER.crouchEyeHeight];
  const visible: string[] = [];
  for (const a of t0) for (const b of t1) for (const ea of eyes) for (const eb of eyes) {
    if (sees(world, a.x, a.y + ea, a.z, b.x, b.y + eb, b.z)) visible.push(`(${a.x},${a.z}) eye ${ea} → (${b.x},${b.z}) eye ${eb}`);
  }
  console.log(visible.length ? visible.map((v) => `- SEES: ${v}`).join("\n") : `- ${t0.length} × ${t1.length} pairs × standing/crouching both ends: **none visible**.`);
  // And how much of the map can see the duel start at all (standing eye to standing eye).
  const start = t0[0];
  let cells = 0, seeing = 0;
  for (const k of seen) {
    const at = k.indexOf("@");
    const [cx, cz] = k.slice(0, at).split(",").map(Number);
    const y = Number(k.slice(at + 1));
    cells++;
    if (sees(world, cx / 2 - 0.25, y + PLAYER.eyeHeight, cz / 2 - 0.25, start.x, start.y + PLAYER.eyeHeight, start.z)) seeing++;
  }
  console.log(`- Surfaces with a line to the duel start (${start.x}, ${start.z}): **${seeing} of ${cells}** (${((100 * seeing) / cells).toFixed(1)} % — the doorway and the strip itself).\n`);
}

/* ---------- 2. Symmetry ---------- */
console.log(`## 2. The map is its own 180° rotation\n`);
{
  const key = (s: Solid) => [s.box.minX, s.box.minY, s.box.minZ, s.box.maxX, s.box.maxY, s.box.maxZ].map((v) => v.toFixed(3)).join(",");
  const twinKey = (s: Solid) => [-s.box.maxX, s.box.minY, -s.box.maxZ, -s.box.minX, s.box.maxY, -s.box.minZ].map((v) => v.toFixed(3)).join(",");
  const keys = new Set(map.solids.map(key));
  const odd = map.solids.filter((s) => !keys.has(twinKey(s)) && !/^(blok_|podworko_dol)/.test(s.name ?? ""));
  console.log(odd.length ? odd.map((s) => `- NO TWIN: ${s.name}`).join("\n") : `- Every one of the ${map.solids.length} solids on the roof has its twin (the estate backdrop is exempt).`);
  const sp = map.spawns.filter((s) => s.team === 0).every((s) => map.spawns.some((t) => t.team === 1 && Math.abs(t.x + s.x) < 1e-9 && Math.abs(t.z + s.z) < 1e-9));
  console.log(`- Team spawns are twins: ${sp ? "yes" : "NO"}.\n`);
}

/* ---------- 3. Routes from both starts ---------- */
console.log(`## 3. Walked routes from both duel starts (sprint held, real mover)\n`);
console.log(`Team 0 starts at (${t0[0].x}, ${t0[0].z}); team 1 at (${t1[0].x}, ${t1[0].z}). Each place is measured from team 0's start, and its 180° twin from team 1's start — "the same place" from the other side.\n`);
console.log(`| Place (from T0) | Path (m) | T0 (s) | T1 (s) | Δ (ms) |`);
console.log(`|---|---|---|---|---|`);
const places: [string, NavPoint][] = [
  ["own crossroads (podest W)", { x: -6.2, y: 0, z: 0 }],
  ["own stair top → perch", { x: 0, y: GORA_PERCH_Y, z: 0 }],
  ["own court, beside the chairs", { x: 2.6, y: 0, z: -5.0 }],
  ["own lane nook", { x: -3.2, y: 0, z: -9.4 }],
  ["own yard, the tank", { x: -12.6, y: 0, z: 3.0 }],
  ["own bunting corner (NW)", { x: -14.6, y: 0, z: 9.4 }],
  ["far lane half (S east)", { x: 5.4, y: 0, z: -9.4 }],
  ["far crossroads (podest E)", { x: 6.2, y: 0, z: 0 }],
  ["far court, beside the chairs", { x: -2.6, y: 0, z: 5.0 }],
  ["far yard, the tank", { x: 12.6, y: 0, z: -3.0 }],
  ["the other start's door", { x: 15.2, y: 0, z: 2.4 }],
  ["the other start", { x: t1[0].x, y: 0, z: t1[0].z }],
];
let worst = 0;
for (const [name, to] of places) {
  // Both routes exist for both sides (the map is its own rotation); A* only breaks ties one way.
  // Each side walks its own route AND the twin of the other side's, and the better time counts.
  const A = { x: t0[0].x, y: t0[0].y, z: t0[0].z }, B = { x: t1[0].x, y: t1[0].y, z: t1[0].z };
  const pa = findPath(walk, A, to, 60000), pb = findPath(walk, B, rot(to), 60000);
  const walked = (path: NavPoint[] | null, from: NavPoint) => path ? { m: polyLen(path.map((p) => [p.x, p.z] as P)), ...runRoute(path, from.y) } : null;
  const pick = (own: ReturnType<typeof walked>, other: ReturnType<typeof walked>) => !own ? other : !other ? own : own.s <= other.s ? own : other;
  const a = pick(walked(pa, A), walked(pb && pb.map(rot), A));
  const b = pick(walked(pb, B), walked(pa && pa.map(rot), B));
  if (!a || !b) { console.log(`| ${name} | — | ${a ? f1(a.s) : "NO PATH"} | ${b ? f1(b.s) : "NO PATH"} | — |`); continue; }
  const d = Math.abs(a.s - b.s) * 1000;
  worst = Math.max(worst, d);
  console.log(`| ${name} | ${f1(a.m)} | ${f2(a.s)}${a.stuck ? " (stuck)" : ""} | ${f2(b.s)}${b.stuck ? " (stuck)" : ""} | ${d.toFixed(0)} |`);
}
console.log(`\nWorst side-to-side difference: **${worst.toFixed(0)} ms** (brief: under 250).\n`);

/* ---------- 4. Choices ---------- */
console.log(`## 4. Choices after 2–4 s\n`);
{
  // Exits are named cells: how many of them are within 15 m (2 s) and 30 m (4 s) of walked path.
  const exits: [string, NavPoint][] = [
    ["the door north (yard)", { x: -15.2, y: 0, z: -2.0 }],
    ["the mouth east (court / lane)", { x: -7.0, y: 0, z: -9.0 }],
    ["stair W (perch)", { x: -6.6, y: 0, z: 0 }],
    ["the lane nook", { x: -3.2, y: 0, z: -9.4 }],
    ["the court", { x: -2.0, y: 0, z: -5.0 }],
    ["the yard tank", { x: -12.0, y: 0, z: 5.0 }],
    ["the NW corner", { x: -14.6, y: 0, z: 9.4 }],
  ];
  for (const [label, start] of [["T0", t0[0]], ["T1", t1[0]]] as const) {
    const within = (m: number) => exits.filter(([, e]) => { const r = route({ x: start.x, y: 0, z: start.z }, label === "T0" ? e : rot(e)); return r && r.m <= m; }).map(([n]) => n);
    console.log(`- ${label}: within 15 m — ${within(15).join(", ")}; within 30 m — ${within(30).length} of ${exits.length} exits.`);
  }
  console.log("");
}

/* ---------- 5. Sight lines ---------- */
console.log(`## 5. Sight lines (standing eye to standing eye, reachable surfaces only)\n`);
{
  const live: NavPoint[] = [];
  for (const k of seen) {
    const at = k.indexOf("@");
    const [cx, cz] = k.slice(0, at).split(",").map(Number);
    live.push({ x: cx / 2 - 0.25, y: Number(k.slice(at + 1)), z: cz / 2 - 0.25 });
  }
  const rnd = rnd32(7);
  const clear: number[] = [];
  let max = 0, pair = "";
  const N = 300000;
  for (let i = 0; i < N; i++) {
    const a = live[(rnd() * live.length) | 0], b = live[(rnd() * live.length) | 0];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len < 1) continue;
    if (sees(world, a.x, a.y + PLAYER.eyeHeight, a.z, b.x, b.y + PLAYER.eyeHeight, b.z)) {
      clear.push(len);
      if (len > max) { max = len; pair = `(${a.x}, ${a.y}, ${a.z}) → (${b.x}, ${b.y}, ${b.z})`; }
    }
  }
  clear.sort((p, q) => p - q);
  const pc = (f: number) => clear[Math.floor(clear.length * f)].toFixed(1);
  const over = (m: number) => ((clear.filter((c) => c >= m).length / clear.length) * 100).toFixed(1);
  console.log(`- ${live.length} surfaces (${(live.length * WALK_GRID * WALK_GRID).toFixed(0)} m²), ${N} pairs, ${clear.length} clear (${((100 * clear.length) / N).toFixed(1)} %): median **${pc(0.5)} m**, p90 ${pc(0.9)} m, p99 ${pc(0.99)} m, longest **${max.toFixed(1)} m** ${pair}.`);
  console.log(`- Clear lines over 10 m: ${over(10)} %; over 15 m: ${over(15)} %; over 20 m: ${over(20)} %.`);
  // The perch: what fraction of the ground it sees, standing, and what it cannot.
  const perch = { x: 0, y: GORA_PERCH_Y, z: 0.6 };
  const ground = live.filter((c) => c.y < 0.01);
  const seenFromPerch = ground.filter((c) => sees(world, perch.x, perch.y + PLAYER.eyeHeight, perch.z, c.x, c.y + PLAYER.eyeHeight, c.z) || sees(world, perch.x, perch.y + PLAYER.eyeHeight, perch.z - 1.2, c.x, c.y + PLAYER.eyeHeight, c.z));
  const hidden = ground.length - seenFromPerch.length;
  console.log(`- From the perch (standing, both lips): sees ${seenFromPerch.length} of ${ground.length} ground cells (${((100 * seenFromPerch.length) / ground.length).toFixed(0)} %); ${hidden} cells (${(hidden * 0.25).toFixed(0)} m²) are out of its view.`);
  // And who sees the perch: how much ground has a line to a STANDING player up there.
  const seesPerch = ground.filter((c) => sees(world, c.x, c.y + PLAYER.eyeHeight, c.z, perch.x, perch.y + PLAYER.eyeHeight, perch.z));
  console.log(`- Ground cells with a line to a standing player on the perch: ${seesPerch.length} (${((100 * seesPerch.length) / ground.length).toFixed(0)} %).\n`);
}

/* ---------- 6. Climbing ---------- */
console.log(`## 6. What can be climbed (chained real jumps from the deck)\n`);
{
  const APEX = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity);
  const MANTLE = APEX + MOVE.airStepCrouch;
  const REACH = (2 * PLAYER.jumpVelocity / -PLAYER.gravity) * PLAYER.sprintSpeed;
  type Top = { name: string; y: number; box: Solid["box"]; from?: string };
  const tops: Top[] = map.solids.filter((s) => !/^(blok_|podworko_dol)/.test(s.name ?? "")).map((s) => ({ name: s.name ?? "?", y: s.box.maxY, box: s.box }));
  const gap = (a: Solid["box"], b: Solid["box"]) => Math.hypot(Math.max(0, b.minX - a.maxX, a.minX - b.maxX), Math.max(0, b.minZ - a.maxZ, a.minZ - b.maxZ));
  // Beside it: a standing jump plus the crouch mantle. Across a gap: the sprint jump's parabola at
  // that distance plus the mantle. Any drop within reach is a landing.
  const canHop = (k: Top, t: Top) => {
    const d = gap(k.box, t.box), rise = t.y - k.y;
    if (d >= REACH) return false;
    if (rise <= 0) return true;
    if (d <= 0.6) return rise <= MANTLE;
    const u = d / REACH;
    return rise <= MOVE.airStepCrouch + 4 * APEX * u * (1 - u);
  };
  const room = (t: Top) => {
    for (let x = t.box.minX + 0.15; x <= t.box.maxX - 0.15 + 1e-9; x += 0.3)
      for (let z = t.box.minZ + 0.15; z <= t.box.maxZ - 0.15 + 1e-9; z += 0.3)
        if (!world.overlaps(x - 0.2, t.y + 0.02, z - 0.2, x + 0.2, t.y + PLAYER.crouchHeight, z + 0.2)) return true;
    return false;
  };
  const standable: Top[] = [tops.find((t) => t.name === "dach")!];
  for (let grew = true; grew;) {
    grew = false;
    for (const t of tops) {
      if (standable.includes(t) || !room(t)) continue;
      const k = standable.find((k) => Math.abs(t.y - k.y) > 0.01 && canHop(k, t));
      if (k) { t.from = k.name; standable.push(t); grew = true; }
    }
  }
  const byHeight = [...standable].sort((a, b) => a.y - b.y);
  console.log(`- Standing jump + mantle ${MANTLE.toFixed(2)} m beside a top; sprint jump ${REACH.toFixed(2)} m across.`);
  console.log(`- Reachable tops: ${byHeight.map((t) => `${t.name} ${t.y.toFixed(2)}${t.from && t.from !== "dach" ? ` (from ${t.from})` : ""}`).join(" · ")}`);
  const cage = byHeight.filter((t) => t.name.startsWith("siatka_") || t.name.startsWith("attyka_"));
  const highest = Math.max(...byHeight.map((t) => t.y));
  console.log(cage.length ? `- **THE CAGE IS REACHABLE: ${cage.map((t) => t.name).join(", ")}**\n` : `- The cage (4.4 m) is ${(4.4 - highest).toFixed(2)} m above the highest standable top (${highest.toFixed(2)} m); a mantle is ${MANTLE.toFixed(2)}.\n`);
}

/* ---------- 7. Floating ---------- */
console.log(`## 7. Nothing floats\n`);
{
  const rests = (s: Solid, others: Solid[]) => {
    if (Math.abs(s.box.minY) < 0.011) return "deck";
    for (const o of others) {
      if (o === s) continue;
      const overX = Math.min(s.box.maxX, o.box.maxX) - Math.max(s.box.minX, o.box.minX);
      const overZ = Math.min(s.box.maxZ, o.box.maxZ) - Math.max(s.box.minZ, o.box.minZ);
      if (overX <= 0 || overZ <= 0) continue;
      if (Math.abs(s.box.minY - o.box.maxY) < 0.011) return `on ${o.name}`;
      if (s.box.minY < o.box.maxY && s.box.maxY > o.box.minY) return `in ${o.name}`;
    }
    return null;
  };
  const floating: string[] = [];
  for (const s of map.solids) {
    if (/^(blok_|podworko_dol|dach$)/.test(s.name ?? "")) continue;
    if (s.invisible) continue; // collision proxies: judged by their prop below
    if (/^pranie_/.test(s.name ?? "")) {
      // Hung from the line: the cable prop must run just above the cloth.
      const line = map.props.find((p) => p.kind === "cable" && Math.abs(p.z - (s.box.minZ + s.box.maxZ) / 2) < 0.1 && Math.abs(p.y - s.box.maxY) < 0.1 && Math.abs(p.x - (s.box.minX + s.box.maxX) / 2) <= (p.w ?? 3) / 2);
      if (!line) floating.push(`${s.name} hangs from nothing`);
      continue;
    }
    if (!rests(s, map.solids)) floating.push(`${s.name} at y ${s.box.minY}`);
  }
  console.log(floating.length ? floating.map((v) => `- FLOATING: ${v}`).join("\n") : `- Every solid stands on the deck or on another solid; the cloth hangs under its line.`);
}

/* ---------- 8. Early contact ---------- */
console.log(`\n## 8. Early contact: what each side can see of the other's first ${20} m\n`);
{
  // Path distance from each start over the walk grid (Dijkstra, 8 neighbours, the step rule).
  const dist = (from: NavPoint): Map<string, number> => {
    // Over (cell, height) with the walk grid's own step rule, so the roof of a stair head — a
    // standable surface nobody can reach — is never walked across.
    const d = new Map<string, number>();
    const best = new Map<string, number>();
    const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
    const sx = snapCoord(from.x), sz = snapCoord(from.z);
    const heap: [number, number, number, number][] = [[0, sx, sz, 0]];
    best.set(`${key(sx, sz)}@0`, 0); d.set(key(sx, sz), 0);
    while (heap.length) {
      heap.sort((a, b) => a[0] - b[0]);
      const [c, x, z, y] = heap.shift()!;
      if (c > 24) break;
      if ((best.get(`${key(x, z)}@${y}`) ?? Infinity) < c) continue;
      for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]]) {
        const nx = x + dx, nz = z + dz;
        const hs = walk.cells.get(key(nx, nz));
        if (!hs) continue;
        const ok = (hh: number[] | undefined) => !!hh && hh.some((h) => h - y <= JUMP_UP);
        if (dx && dz && (!ok(walk.cells.get(key(x + dx, z))) || !ok(walk.cells.get(key(x, z + dz))))) continue;
        for (const h of hs) {
          if (h - y > JUMP_UP) continue;
          const nc = c + Math.hypot(dx, dz);
          const bk = `${key(nx, nz)}@${h}`;
          if (nc < (best.get(bk) ?? Infinity)) {
            best.set(bk, nc); heap.push([nc, nx, nz, h]);
            if (nc < (d.get(key(nx, nz)) ?? Infinity)) d.set(key(nx, nz), nc);
          }
        }
      }
    }
    return d;
  };
  // `cellKey` is round(centre × 2) with centres at .25 offsets, so key K is the centre K / 2 − 0.25.
  const cellOf = (k: string): NavPoint => { const [cx, cz] = k.split(",").map(Number); return { x: cx / 2 - 0.25, y: 0, z: cz / 2 - 0.25 }; };
  const A = dist({ x: t0[0].x, y: 0, z: t0[0].z }), B = dist({ x: t1[0].x, y: 0, z: t1[0].z });
  // A player who stays home must see NOTHING of what the other player does in their first 20 m:
  // otherwise the degenerate duel is a sniper in the pocket. Then the same question for the first
  // 12 m of both, excluding the perch (the perch IS the early contact, by design).
  const sweep = (ra: number, rb: number, groundOnly: boolean, label: string) => {
    const a = [...A].filter(([, c]) => c <= ra).map(([k]) => cellOf(k));
    const b = [...B].filter(([, c]) => c <= rb).map(([k]) => cellOf(k));
    let pairs = 0, worst = 0, worstPair = "";
    const hot = new Map<string, number>();
    for (const p of a) for (const q of b) {
      if (groundOnly && (Math.abs(p.x) <= 4 && Math.abs(p.z) <= 2.5 || Math.abs(q.x) <= 4 && Math.abs(q.z) <= 2.5)) continue;
      if (sees(world, p.x, PLAYER.eyeHeight, p.z, q.x, PLAYER.eyeHeight, q.z)) {
        pairs++;
        const len = Math.hypot(p.x - q.x, p.z - q.z);
        if (len > worst) { worst = len; worstPair = `(${p.x}, ${p.z}) ↔ (${q.x}, ${q.z})`; }
        hot.set(`${q.x},${q.z}`, (hot.get(`${q.x},${q.z}`) ?? 0) + 1);
      }
    }
    const top = [...hot].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `(${k})×${n}`).join(" ");
    console.log(`- ${label} (${a.length} × ${b.length} cells): **${pairs} seeing pairs**${pairs ? `, longest ${worst.toFixed(1)} m ${worstPair}; T1 cells most seen: ${top}` : ""}.`);
  };
  sweep(4.5, 20, false, "T0 in the strip (≤ 4.5 m) vs T1's first 20 m");
  sweep(12, 12, true, "both sides' first 12 m, perch excluded");
}
