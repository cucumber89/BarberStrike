/** both — my scratch check for R5: does any reachable cell see BOTH duel starts (standing or crouching eyes)? */
import { PLAYER } from "../../../../../packages/shared/src/constants";
import { makeRayHit } from "../../../../../packages/shared/src/collision";
import { buildCollisionWorld, type MapDef } from "../../../../../packages/shared/src/map";
import { walkable, reachable } from "../../../../../packages/shared/src/mapWalk";
const mod = await import(process.argv[2]); const map: MapDef = mod.MAP;
const world = buildCollisionWorld(map); const walk = walkable(map); const seen = reachable(walk, map.spawns[0]);
const A = map.spawns.find(s => s.team === 0)!, B = map.spawns.find(s => s.team === 1)!;
const sees = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => { const dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz); return !world.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit; };
let both = 0; const ex: string[] = [];
for (const k of seen) { const at = k.indexOf("@"); const [cx, cz] = k.slice(0, at).split(",").map(Number); const y = Number(k.slice(at + 1)); const x = cx / 2 - 0.25, z = cz / 2 - 0.25;
  for (const e of [PLAYER.eyeHeight, PLAYER.crouchEyeHeight]) for (const t of [PLAYER.eyeHeight, PLAYER.crouchEyeHeight]) if (sees(x, y + e, z, A.x, A.y + t, A.z) && sees(x, y + e, z, B.x, B.y + t, B.z)) { both++; if (ex.length < 5) ex.push(`(${x},${z})`); } }
console.log(`cells seeing BOTH starts (any eye pair): ${both} ${ex.join(" ")}`);
