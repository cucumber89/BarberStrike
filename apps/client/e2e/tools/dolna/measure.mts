/**
 * measure — the DOLNA design-table harness. Runs ANY prototype MapDef through the real shared
 * simulation exactly as `apps/client/e2e/tools/map-duel.ts` and `map.test.ts` do, so a layout on
 * paper is judged by numbers before anybody writes geometry into the repo.
 *
 * Run:  cd /home/user/BarberStrike && ./apps/server/node_modules/.bin/tsx <this file> <proto.ts>
 * The prototype module must export:
 *   MAP: MapDef                                  — the layout (see proto-template.ts)
 *   PLACES: Record<string, {x,y,z}>              — key places, timed from BOTH starts (same point)
 *   EXITS?: Record<string, {x,y,z}>              — exits counted within 15 / 30 m of each start
 *   GROUND?: RegExp                              — names of ground/floor solids (climb-chain base)
 *   BOUNDARY?: RegExp                            — names that must never be standable (roofs, fences)
 */
import { PLAYER } from "../../../../../packages/shared/src/constants";
import { CollisionWorld, makeRayHit } from "../../../../../packages/shared/src/collision";
import { createBody, simulateBody, MOVE } from "../../../../../packages/shared/src/movement";
import { Btn } from "../../../../../packages/shared/src/types";
import { buildCollisionWorld, sitesOf, type MapDef, type Solid } from "../../../../../packages/shared/src/map";
import { walkable, reachable, cellReached, WALK_GRID } from "../../../../../packages/shared/src/mapWalk";
import { prepareNav, findPath, type NavPoint } from "../../../../../packages/shared/src/nav";
import { coplanarTopFaces, coplanarFaces, siteLoad } from "../../../../../packages/shared/src/floorAudit";
import { DOM } from "../../../../../packages/shared/src/dom";

const file = process.argv[2];
if (!file) { console.error("usage: tsx measure.ts <proto.ts>"); process.exit(2); }
const mod = await import(file.startsWith("/") ? file : `${process.cwd()}/${file}`);
const map: MapDef = mod.MAP;
const PLACES: Record<string, NavPoint> = mod.PLACES ?? {};
const EXITS: Record<string, NavPoint> = mod.EXITS ?? PLACES;
const GROUND: RegExp = mod.GROUND ?? /^(ground|floor|dach|street|ulica|droga|road|lawn|trawnik|podjazd|grunt|soil|pobocze)/i;
const BOUNDARY: RegExp = mod.BOUNDARY ?? /(roof|dach_|fence|siatka|bound|granica|tuje|hedge|zywoplot|limit|wall_edge|attyka)/i;

const DT = 1000 / 60;
type P = [number, number];
const f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2);
const inp = (seq: number, buttons: number, yaw: number) => ({ seq, dt: DT, buttons, yaw, pitch: 0 });
const polyLen = (p: P[]) => p.slice(1).reduce((a, c, i) => a + Math.hypot(c[0] - p[i][0], c[1] - p[i][1]), 0);
const rnd32 = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const HW = PLAYER.halfWidth, H = PLAYER.height;
const name = (s: Solid) => s.name ?? `unnamed@${s.box.minX},${s.box.minY},${s.box.minZ}`;

const world = buildCollisionWorld(map);
const walk = walkable(map);
prepareNav(walk);
const t0 = map.spawns.filter((s) => s.team === 0), t1 = map.spawns.filter((s) => s.team === 1);
const seen = map.spawns.length ? reachable(walk, map.spawns[0]) : new Set<string>();
const sees = (w: CollisionWorld, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz);
  return !w.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit;
};
function runRoute(path: NavPoint[], y = 0): { s: number; stuck: boolean } {
  const pts: P[] = path.map((p) => [p.x, p.z]);
  const b = createBody(pts[0][0], y, pts[0][1]); b.grounded = true;
  const buttons = Btn.Forward | Btn.Sprint;
  let seq = 0, t = 0, target = 1, lastProgress = 0, stuck = false, prev = buttons;
  while (target < pts.length) {
    const dx = pts[target][0] - b.x, dz = pts[target][1] - b.z;
    if (Math.hypot(dx, dz) < 0.6) { target++; continue; }
    const px = b.x, pz = b.z;
    const hop = path[target].y - b.y > PLAYER.stepHeight && b.grounded && Math.hypot(dx, dz) < 1.2;
    const btn = buttons | (hop ? Btn.Jump : 0);
    simulateBody(world, b, inp(seq++, btn, Math.atan2(dx, dz)), 1, prev);
    prev = btn; t += DT;
    if (Math.hypot(b.x - px, b.z - pz) > 0.02) lastProgress = t;
    if (t - lastProgress > 1500 || t > 60000) { stuck = true; break; }
  }
  const last = pts[pts.length - 1];
  if (stuck && Math.hypot(last[0] - b.x, last[1] - b.z) < 1.0) stuck = false;
  return { s: t / 1000, stuck };
}
const route = (from: NavPoint, to: NavPoint) => { const path = findPath(walk, from, to, 60000); if (!path) return null; const r = runRoute(path, from.y); return { m: polyLen(path.map((p) => [p.x, p.z] as P)), s: r.s, stuck: r.stuck }; };
const fails: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); return ok ? "ok" : "**FAIL**"; };

const b = map.bounds;
console.log(`# measure — ${map.id} "${map.name}"\n`);
console.log(`${map.solids.length} solids · ${map.props.length} props · ${map.lights.length} lights · ${map.spawns.length} team spawns (+${map.arenaSpawns?.length ?? 0} arena) · ${map.stations.length} stations · ${map.flags.length} flags · ${(map.sites ?? []).length} sites · bounds ${f1(b.maxX - b.minX)} × ${f1(b.maxZ - b.minZ)} m · ${walk.cells.size} walk cells, ${seen.size} reachable from spawn 0 (${(seen.size * 0.25).toFixed(0)} m²).\n`);

/* ---------- 1. The generic suite (map.test.ts / mapFlags / floorAudit), emulated ---------- */
console.log(`## 1. The generic map suite, emulated\n`);
{
  console.log(`- spawns per team ≥ 6: T0 ${t0.length}, T1 ${t1.length} — ${check(t0.length >= 6 && t1.length >= 6, "fewer than 6 spawns per team")}`);
  const badSpawn: string[] = [];
  for (const s of [...map.spawns, ...(map.arenaSpawns ?? [])]) {
    if (world.overlaps(s.x - HW, s.y + 0.02, s.z - HW, s.x + HW, s.y + H, s.z + HW)) badSpawn.push(`(${s.x},${s.z}) in a solid`);
    if (!world.raycast(s.x, s.y + 0.5, s.z, 0, -1, 0, 1.2, makeRayHit()).hit) badSpawn.push(`(${s.x},${s.z}) no floor`);
    if (!(s.x > b.minX && s.x < b.maxX && s.z > b.minZ && s.z < b.maxZ && s.y > map.killY)) badSpawn.push(`(${s.x},${s.z}) outside bounds`);
    if (!cellReached(seen, s.x, s.z)) badSpawn.push(`(${s.x},${s.z}) unreachable`);
  }
  console.log(`- every spawn free, floored, in bounds, reachable: ${check(badSpawn.length === 0, "spawn defects")} ${badSpawn.join("; ")}`);
  console.log(`- reachable set > 400 cells: ${seen.size} — ${check(seen.size > 400, "reachable set too small")}`);
  const vis: string[] = [];
  for (const a of t0) for (const c of t1) if (sees(world, a.x, a.y + PLAYER.eyeHeight, a.z, c.x, c.y + PLAYER.eyeHeight, c.z)) vis.push(`(${a.x},${a.z})→(${c.x},${c.z})`);
  console.log(`- no T0 spawn sees a T1 spawn (standing): ${check(vis.length === 0, "team spawns see each other")} ${vis.join(", ")}`);
  const st = map.stations;
  const stBad = st.filter((s) => world.overlaps(s.x - HW, s.y + 0.02, s.z - HW, s.x + HW, s.y + H, s.z + HW) || !cellReached(seen, s.x, s.z)).map((s) => s.name);
  const spread = st.length ? Math.max(...st.map((s) => s.x)) - Math.min(...st.map((s) => s.x)) : 0;
  console.log(`- stations ≥ 3, free, reachable, spread > 30 m in x: ${st.length}, spread ${f1(spread)} — ${check(st.length >= 3 && stBad.length === 0 && spread > 30, "stations")} ${stBad.join(", ")}`);
  const fl = map.flags; let flMin = Infinity;
  for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) flMin = Math.min(flMin, Math.hypot(fl[i].x - fl[j].x, fl[i].z - fl[j].z));
  const flBad = fl.filter((f) => !cellReached(seen, f.x, f.z) || !world.raycast(f.x, f.y + 0.5, f.z, 0, -1, 0, 1.2, makeRayHit()).hit).map((f) => f.id);
  console.log(`- flags A/B/C reachable, pairwise > 14 m: ${fl.map((f) => f.id).join("")} min ${fl.length > 1 ? f1(flMin) : "—"} — ${check(fl.map((f) => f.id).join("") === "ABC" && flMin > 14 && flBad.length === 0, "flags")} ${flBad.join(", ")}`);
  const inZone = map.spawns.filter((s) => fl.some((f) => Math.hypot(s.x - f.x, s.z - f.z) <= DOM.radius)).length;
  console.log(`- no spawn inside a flag zone (${DOM.radius} m): ${inZone} — ${check(inZone === 0, "spawn in flag zone")}`);
  const sites = sitesOf(map);
  const inB = sites.every((s) => s.x > b.minX && s.x < b.maxX && s.z > b.minZ && s.z < b.maxZ);
  const loads = siteLoad(map);
  console.log(`- bomb sites own (${map.sites ? "yes" : "NO — falls back to NIGHT_DISTRICT"}), in bounds: ${check(!!map.sites && inB, "sites")}; load ≤ 30 within 7.5 m: ${loads.map((l) => `${l.site} ${l.solids}+${l.props}`).join(", ")} — ${check(loads.every((l) => l.solids + l.props <= 30), "site load")}`);
  const ov: string[] = [];
  for (let i = 0; i < map.solids.length; i++) for (let j = i + 1; j < map.solids.length; j++) {
    const s = map.solids; if (s[i].mat !== s[j].mat) continue;
    const a = s[i].box, c = s[j].box;
    const ox = Math.min(a.maxX, c.maxX) - Math.max(a.minX, c.minX), oy = Math.min(a.maxY, c.maxY) - Math.max(a.minY, c.minY), oz = Math.min(a.maxZ, c.maxZ) - Math.max(a.minZ, c.minZ);
    if (ox > 0.35 && oy > 0.35 && oz > 0.35) ov.push(`${name(s[i])}×${name(s[j])}`);
  }
  console.log(`- no deep same-material overlaps: ${ov.length} — ${check(ov.length === 0, "overlaps")} ${ov.slice(0, 8).join(", ")}`);
  const top = coplanarTopFaces(map.solids), faces = coplanarFaces(map.solids);
  console.log(`- floor audit: coplanar TOP pairs ${top.length}, coplanar side faces on interpenetrating solids ${faces.length} — ${check(top.length === 0 && faces.length === 0, "coplanar faces")} ${top.slice(0, 5).map((p) => `${p.a}×${p.b}@y${p.y}`).join(", ")} ${faces.slice(0, 5).map((p) => `${p.a}×${p.b}${p.dir}`).join(", ")}`);
  const pb = map.props.filter((p) => p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ).length;
  console.log(`- props in bounds: ${map.props.length - pb}/${map.props.length} — ${check(pb === 0, "props out of bounds")}`);
  const hunt = map.huntSpawnMinM ?? 14;
  console.log(`- huntSpawnMinM ${hunt} m on a ${f1(Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ))} m diagonal (GÓRA: 6 on 39; district: 14 on 121).\n`);
}

/* ---------- 2. Duel starts ---------- */
console.log(`## 2. The duel starts (first spawn of each side)\n`);
if (t0.length && t1.length) {
  const A = t0[0], B = t1[0];
  const eyes = [PLAYER.eyeHeight, PLAYER.crouchEyeHeight];
  const vis: string[] = [];
  for (const a of t0) for (const c of t1) for (const ea of eyes) for (const eb of eyes) if (sees(world, a.x, a.y + ea, a.z, c.x, c.y + eb, c.z)) vis.push(`(${a.x},${a.z})e${ea}→(${c.x},${c.z})e${eb}`);
  console.log(`- T0 start (${A.x}, ${A.z}) yaw ${A.yaw}; T1 start (${B.x}, ${B.z}) yaw ${B.yaw}; straight line ${f1(Math.hypot(A.x - B.x, A.z - B.z))} m.`);
  console.log(`- all pairs, standing/crouching both ends: ${vis.length ? "**SEES** " + vis.join(", ") : "none visible"} — ${check(vis.length === 0, "starts see each other")}`);
  for (const [lbl, s] of [["T0", A], ["T1", B]] as const) {
    let cells = 0, seeing = 0, far = 0;
    for (const k of seen) {
      const at = k.indexOf("@"); const [cx, cz] = k.slice(0, at).split(",").map(Number); const y = Number(k.slice(at + 1)); cells++;
      const x = cx / 2 - 0.25, z = cz / 2 - 0.25;
      if (sees(world, x, y + PLAYER.eyeHeight, z, s.x, s.y + PLAYER.eyeHeight, s.z)) { seeing++; far = Math.max(far, Math.hypot(x - s.x, z - s.z)); }
    }
    console.log(`- surfaces with a line to the ${lbl} start: ${seeing} of ${cells} (${((100 * seeing) / cells).toFixed(1)} %), farthest ${f1(far)} m (GÓRA: 7.9 %, 9 m).`);
  }
  const r = route({ x: A.x, y: A.y, z: A.z }, { x: B.x, y: B.y, z: B.z });
  console.log(`- start to start on foot: ${r ? `${f1(r.m)} m, ${f2(r.s)} s sprint${r.stuck ? " (STUCK)" : ""}` : "NO PATH"} (brief R7: 35–45 m).\n`);
}

/* ---------- 3. Routes from both starts to the same places ---------- */
console.log(`## 3. Walked routes from both starts (sprint held, real mover) — the SAME place from each side\n`);
let worst = 0;
if (t0.length && t1.length && Object.keys(PLACES).length) {
  console.log(`| Place | T0 path (m) | T0 (s) | T1 path (m) | T1 (s) | Δ (ms) |\n|---|---|---|---|---|---|`);
  const A = { x: t0[0].x, y: t0[0].y, z: t0[0].z }, B = { x: t1[0].x, y: t1[0].y, z: t1[0].z };
  for (const [pn, to] of Object.entries(PLACES)) {
    const a = route(A, to), c = route(B, to);
    if (!a || !c) { console.log(`| ${pn} | ${a ? f1(a.m) : "NO PATH"} | ${a ? f2(a.s) : "—"} | ${c ? f1(c.m) : "NO PATH"} | ${c ? f2(c.s) : "—"} | — |`); fails.push(`no path to ${pn}`); continue; }
    const d = Math.abs(a.s - c.s) * 1000; worst = Math.max(worst, d);
    if (a.stuck || c.stuck) fails.push(`stuck on the way to ${pn}`);
    console.log(`| ${pn} | ${f1(a.m)} | ${f2(a.s)}${a.stuck ? " STUCK" : ""} | ${f1(c.m)} | ${f2(c.s)}${c.stuck ? " STUCK" : ""} | ${d.toFixed(0)} |`);
  }
  console.log(`\nWorst side-to-side difference: **${worst.toFixed(0)} ms** (R4: ≤ 250) — this is expected to be large for places on one side; the number that matters is the CONTESTED places (mark them in PLACES with a leading "*").`);
  const contested = Object.entries(PLACES).filter(([k]) => k.startsWith("*"));
  if (contested.length) {
    let cw = 0;
    for (const [, to] of contested) { const a = route(A, to), c = route(B, to); if (a && c) cw = Math.max(cw, Math.abs(a.s - c.s) * 1000); }
    console.log(`Worst difference over the ${contested.length} contested places: **${cw.toFixed(0)} ms** — ${check(cw <= 250, "contested places differ by more than 250 ms")}\n`);
  } else console.log("");
}

/* ---------- 4. Exits ---------- */
console.log(`## 4. Choices after 2–4 s (exits within 15 / 30 m of walked path)\n`);
if (t0.length && t1.length) {
  for (const [lbl, s] of [["T0", t0[0]], ["T1", t1[0]]] as const) {
    const within = (m: number) => Object.entries(EXITS).filter(([, e]) => { const r = route({ x: s.x, y: s.y, z: s.z }, e); return r && r.m <= m; }).map(([n]) => n);
    const w15 = within(15), w30 = within(30);
    console.log(`- ${lbl}: within 15 m — ${w15.length} (${w15.join(", ") || "none"}); within 30 m — ${w30.length} of ${Object.keys(EXITS).length} — ${check(w15.length >= 3, `${lbl} has fewer than 3 exits within 15 m`)}`);
  }
  console.log("");
}

/* ---------- 5. Sight lines ---------- */
console.log(`## 5. Sight lines (standing eye to standing eye, reachable surfaces only)\n`);
{
  const live: NavPoint[] = [];
  for (const k of seen) { const at = k.indexOf("@"); const [cx, cz] = k.slice(0, at).split(",").map(Number); live.push({ x: cx / 2 - 0.25, y: Number(k.slice(at + 1)), z: cz / 2 - 0.25 }); }
  const rnd = rnd32(7); const clear: number[] = []; let max = 0, pair = ""; const N = 200000;
  for (let i = 0; i < N; i++) {
    const a = live[(rnd() * live.length) | 0], c = live[(rnd() * live.length) | 0];
    const len = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z); if (len < 1) continue;
    if (sees(world, a.x, a.y + PLAYER.eyeHeight, a.z, c.x, c.y + PLAYER.eyeHeight, c.z)) { clear.push(len); if (len > max) { max = len; pair = `(${a.x}, ${a.y}, ${a.z}) → (${c.x}, ${c.y}, ${c.z})`; } }
  }
  clear.sort((p, q) => p - q);
  const pc = (f: number) => clear.length ? clear[Math.min(clear.length - 1, Math.floor(clear.length * f))] : 0;
  const over = (m: number) => clear.length ? ((clear.filter((c) => c >= m).length / clear.length) * 100).toFixed(1) : "0";
  console.log(`- ${live.length} surfaces (${(live.length * WALK_GRID * WALK_GRID).toFixed(0)} m²), ${N} pairs, ${clear.length} clear (${((100 * clear.length) / N).toFixed(1)} %): median **${f1(pc(0.5))} m**, p90 ${f1(pc(0.9))} m, p99 ${f1(pc(0.99))} m, longest **${f1(max)} m** ${pair}.`);
  console.log(`- Clear lines over 10 m: ${over(10)} %; 15 m: ${over(15)} %; 20 m: ${over(20)} %; 30 m: ${over(30)} %; 40 m: ${over(40)} %; 50 m: ${over(50)} %.`);
  console.log(`- R5: median 8–12 → ${check(pc(0.5) >= 8 && pc(0.5) <= 12, "median sight line outside 8–12 m")}; p90 ≤ 25 → ${check(pc(0.9) <= 25, "p90 sight line over 25 m")}; longest ≥ 50 → ${check(max >= 50, "no 50 m line")}. (GÓRA: median 7.6, p90 15.0, longest 34.)\n`);
}

/* ---------- 6. Climbing ---------- */
console.log(`## 6. What can be climbed (chained real jumps from the ground)\n`);
{
  const APEX = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity), MANTLE = APEX + MOVE.airStepCrouch, REACH = (2 * PLAYER.jumpVelocity / -PLAYER.gravity) * PLAYER.sprintSpeed;
  type Top = { name: string; y: number; box: Solid["box"]; from?: string };
  const tops: Top[] = map.solids.map((s) => ({ name: name(s), y: s.box.maxY, box: s.box }));
  const gap = (a: Solid["box"], c: Solid["box"]) => Math.hypot(Math.max(0, c.minX - a.maxX, a.minX - c.maxX), Math.max(0, c.minZ - a.maxZ, a.minZ - c.maxZ));
  const canHop = (k: Top, t: Top) => { const d = gap(k.box, t.box), rise = t.y - k.y; if (d >= REACH) return false; if (rise <= 0) return true; if (d <= 0.6) return rise <= MANTLE; const u = d / REACH; return rise <= MOVE.airStepCrouch + 4 * APEX * u * (1 - u); };
  const room = (t: Top) => { for (let x = t.box.minX + 0.15; x <= t.box.maxX - 0.15 + 1e-9; x += 0.3) for (let z = t.box.minZ + 0.15; z <= t.box.maxZ - 0.15 + 1e-9; z += 0.3) if (!world.overlaps(x - 0.2, t.y + 0.02, z - 0.2, x + 0.2, t.y + PLAYER.crouchHeight, z + 0.2)) return true; return false; };
  const standable: Top[] = tops.filter((t) => GROUND.test(t.name) && t.y <= 0.05);
  if (!standable.length) standable.push(...tops.filter((t) => t.y <= 0.05));
  for (let grew = true; grew;) { grew = false; for (const t of tops) { if (standable.includes(t) || !room(t)) continue; const k = standable.find((k) => Math.abs(t.y - k.y) > 0.01 && canHop(k, t)); if (k) { t.from = k.name; standable.push(t); grew = true; } } }
  const high = standable.filter((t) => t.y >= 1.9).sort((a, c) => a.y - c.y);
  const bad = standable.filter((t) => BOUNDARY.test(t.name));
  console.log(`- mantle ${MANTLE.toFixed(2)} m beside a top; sprint jump ${REACH.toFixed(2)} m across; ${standable.length} standable tops of ${tops.length}.`);
  console.log(`- standable tops ≥ 1.9 m: ${high.length ? high.map((t) => `${t.name} ${t.y.toFixed(2)}${t.from ? ` (from ${t.from})` : ""}`).join(" · ") : "none"}`);
  console.log(`- boundary/roof names standable: ${bad.length ? "**" + bad.map((t) => `${t.name} ${t.y.toFixed(2)} (from ${t.from})`).join(", ") + "**" : "none"} — ${check(bad.length === 0, "a roof or a boundary can be climbed")}\n`);
}

/* ---------- 7. Cover language and floating ---------- */
console.log(`## 7. Cover heights (R3) and floating solids\n`);
{
  const odd: string[] = []; const buckets = { low: 0, crouch: 0, full: 0, structure: 0 };
  for (const s of map.solids) {
    if (s.invisible || GROUND.test(name(s)) || /(schod|stair|step|stopien)/i.test(name(s))) continue;
    const h = s.box.maxY;
    if (s.box.minY > 0.05) continue; // stacked pieces are judged by their base solid
    if (h < 0.5) continue;
    if (h < 1.0) buckets.low++; else if (h >= 1.2 && h <= 1.6) buckets.crouch++; else if (h >= 2.0 && h < 2.8) buckets.full++; else if (h >= 2.8) buckets.structure++; else odd.push(`${name(s)} ${h.toFixed(2)}`);
  }
  console.log(`- low (0.5–1.0) ${buckets.low} · crouch (1.2–1.6) ${buckets.crouch} · full (2.0–2.8) ${buckets.full} · structure (≥ 2.8) ${buckets.structure} · off the language: ${odd.length ? odd.join(", ") : "none"} — ${check(odd.length === 0, "cover heights off the language")}`);
  const floating: string[] = [];
  for (const s of map.solids) {
    if (s.box.minY <= 0.0) continue;
    const sits = map.solids.some((o) => o !== s && Math.abs(o.box.maxY - s.box.minY) <= 0.1 && o.box.maxX > s.box.minX && o.box.minX < s.box.maxX && o.box.maxZ > s.box.minZ && o.box.minZ < s.box.maxZ)
      || map.solids.some((o) => o !== s && o.box.maxY > s.box.minY && o.box.minY < s.box.minY && o.box.maxX > s.box.minX && o.box.minX < s.box.maxX && o.box.maxZ > s.box.minZ && o.box.minZ < s.box.maxZ); // embedded in a taller solid (e.g. a lintel in a wall)
    if (!sits) floating.push(`${name(s)} (minY ${s.box.minY})`);
  }
  console.log(`- solids not standing on the ground or on another solid: ${floating.length ? floating.join(", ") : "none"} — ${check(floating.length === 0, "floating solids")}`);
  const thin = map.solids.filter((s) => !s.invisible && !GROUND.test(name(s)) && s.box.maxY >= 1.2 && s.box.maxY < 2.8 && Math.min(s.box.maxX - s.box.minX, s.box.maxZ - s.box.minZ) < 0.9 && Math.max(s.box.maxX - s.box.minX, s.box.maxZ - s.box.minZ) < 0.9).map(name);
  console.log(`- man-height cover narrower than a body in both axes (< 0.9 m; deliberate "partial" cover only): ${thin.length ? thin.join(", ") : "none"}\n`);
}

console.log(`## Verdict\n`);
console.log(fails.length ? `**${fails.length} failing checks:**\n${fails.map((f) => `- ${f}`).join("\n")}` : `**All checks pass.**`);
