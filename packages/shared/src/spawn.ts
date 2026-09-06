import type { MapDef, SpawnPoint } from "./map";
import type { Team } from "./types";

export interface SpawnCandidateContext {
  /** Positions of living enemies. */
  enemies: { x: number; y: number; z: number }[];
  /** Positions of living teammates (mild preference to spawn near them). */
  allies: { x: number; y: number; z: number }[];
  /** Optional line-of-sight test: true if `a` can see `b`. */
  canSee?: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean;
  rand: () => number;
  danger?: (x: number, y: number, z: number) => boolean;
}

/**
 * Picks the spawn point that maximises distance from enemies, penalising points an enemy can see.
 * A little randomness among the top candidates prevents predictable spawns.
 */
export function pickSpawn(map: MapDef, team: Team, ctx: SpawnCandidateContext, anyTeam = false): SpawnPoint {
  // FFA (drop 4): every spawn point is fair game; distance from everyone else decides.
  const own = anyTeam ? [...map.spawns, ...(map.arenaSpawns ?? [])] : map.spawns.filter((s) => s.team === team);
  const pool = own.length ? own : map.spawns;
  const scored = pool.map((s) => {
    let minEnemy = Infinity;
    for (const e of ctx.enemies) minEnemy = Math.min(minEnemy, Math.hypot(e.x - s.x, e.z - s.z));
    let score = Math.min(minEnemy, 40); // beyond 40 m more distance doesn't matter
    if (minEnemy < 8) score -= 70;
    if (ctx.danger?.(s.x, s.y, s.z)) score -= 200;
    if (ctx.canSee) {
      for (const e of ctx.enemies) {
        if (ctx.canSee(e.x, e.y + 1.6, e.z, s.x, s.y + 1.2, s.z)) { score -= 75; break; }
      }
    }
    let minAlly = Infinity;
    for (const a of ctx.allies) minAlly = Math.min(minAlly, Math.hypot(a.x - s.x, a.z - s.z));
    // Near a teammate is good; ON one is not. A respawn wave (drop 7) spawns the whole team in one
    // pass and each one becomes a living ally at that exact point, so the +2 below was pulling the
    // next player onto the same spot — and with everyone frozen for the countdown they stayed
    // stacked, which is both ugly and one grenade at the release.
    if (minAlly < 3) score -= 20;
    else if (minAlly < 12) score += 2;
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(3, scored.length)).filter((c) => c.score >= scored[0].score - 6);
  return top[Math.floor(ctx.rand() * top.length)].s;
}
