/** sight2 — my scratch tool: the harness's sight-line sample (same seed, same N) with and without street↔street pairs. */
import { PLAYER } from "../../../../../packages/shared/src/constants";
import { makeRayHit } from "../../../../../packages/shared/src/collision";
import { buildCollisionWorld, type MapDef } from "../../../../../packages/shared/src/map";
import { walkable, reachable } from "../../../../../packages/shared/src/mapWalk";
import type { NavPoint } from "../../../../../packages/shared/src/nav";
const mod = await import(process.argv[2]); const map: MapDef = mod.MAP;
const world = buildCollisionWorld(map); const walk = walkable(map);
const seen = reachable(walk, map.spawns[0]);
const live: NavPoint[] = [];
for (const k of seen) { const at = k.indexOf("@"); const [cx, cz] = k.slice(0, at).split(",").map(Number); live.push({ x: cx / 2 - 0.25, y: Number(k.slice(at + 1)), z: cz / 2 - 0.25 }); }
const street = (p: NavPoint) => p.z < -0.5 && p.z > -8.3;
const rnd32 = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = rnd32(7); const all: number[] = [], noSS: number[] = [], ss: number[] = []; const N = 200000;
const sees = (a: NavPoint, c: NavPoint) => { const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z; const len = Math.hypot(dx, dy, dz); return !world.raycast(a.x, a.y + PLAYER.eyeHeight, a.z, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit; };
for (let i = 0; i < N; i++) { const a = live[(rnd() * live.length) | 0], c = live[(rnd() * live.length) | 0]; const len = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z); if (len < 1) continue; if (!sees(a, c)) continue; all.push(len); if (street(a) && street(c)) ss.push(len); else noSS.push(len); }
const pc = (arr: number[], f: number) => { const s = [...arr].sort((p, q) => p - q); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const over = (arr: number[], m: number) => (100 * arr.filter((v) => v >= m).length / arr.length).toFixed(1);
for (const [n, arr] of [["all pairs", all], ["without street↔street", noSS], ["street↔street only", ss]] as const) console.log(`${n}: ${arr.length} clear, median ${pc(arr, 0.5).toFixed(1)}, p90 ${pc(arr, 0.9).toFixed(1)}, p99 ${pc(arr, 0.99).toFixed(1)}, >25 m ${over(arr, 25)} %`);
