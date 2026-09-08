import type { Team } from "./types";

export const BOMB = { roundMs: 115000, fuseMs: 40000, plantMs: 3200, defuseMs: 10000, breakMs: 5000, buyMs: 30000,
  halfRounds: 6, maxRounds: 12, wins: 7, startMoney: 800, winMoney: 3250, useRadius: 2.5 } as const;
export const bombAttackTeam = (round: number): Team => round <= BOMB.halfRounds ? 0 : 1;
export const BOMB_SITES = [
  { id: "A", name: "DEPOT", x: -35, y: 0, z: 24 },
  { id: "B", name: "COURTYARD", x: 43, y: 0, z: 24 },
] as const;
export interface BombData {
  round: number; attackTeam: number; stage: string; carrier: string; site: string;
  x: number; y: number; z: number; endsAt: number; roundEndsAt: number;
  actor: string; progress: number; result: string;
}
export interface BombPlayer {
  id: string; team: number; alive: boolean; connected: boolean; x: number; y: number; z: number;
  using: boolean;
}
export function resetBomb(b: BombData, now: number, players: readonly BombPlayer[]): void {
  b.round++; b.attackTeam = bombAttackTeam(b.round);
  const carrier = players.find(p => p.alive && p.connected && p.team === b.attackTeam);
  b.carrier = carrier?.id ?? ""; b.stage = carrier ? "carried" : "dropped";
  b.x = carrier?.x ?? 0; b.y = carrier?.y ?? 0; b.z = carrier?.z ?? 0;
  b.site = ""; b.endsAt = 0; b.roundEndsAt = now + BOMB.roundMs;
  b.actor = ""; b.progress = 0; b.result = "";
}
const near = (p: BombPlayer, q: { x: number; y: number; z: number }, r: number) => Math.hypot(p.x - q.x, p.z - q.z) <= r && Math.abs(p.y - q.y) < 1.5;

/** Authoritative, deterministic objective rules. A single uninterrupted action is required. */
export function stepBomb(b: BombData, players: readonly BombPlayer[], now: number, dt: number,
  clear: (p: BombPlayer, q: { x: number; y: number; z: number }) => boolean = () => true): Team | null {
  if (b.stage === "idle" || b.stage === "buy" || b.stage === "resolved") return null;
  const atk = b.attackTeam as Team, def = (1 - atk) as Team;
  const alive = players.filter(p => p.alive && p.connected);
  const finish = (team: Team, reason: string): Team => { b.stage = "resolved"; b.result = reason; b.actor = ""; b.progress = 0; return team; };
  if (b.stage === "planted" && now >= b.endsAt) return finish(atk, "BOMB DETONATED");
  if (!alive.some(p => p.team === def)) return finish(atk, "DEFENDERS ELIMINATED");
  if (b.stage !== "planted") {
    if (!alive.some(p => p.team === atk)) return finish(def, "ATTACKERS ELIMINATED");
    if (now >= b.roundEndsAt) return finish(def, "SITE SECURED");
  }
  if (b.stage === "carried") {
    const c = players.find(p => p.id === b.carrier);
    if (c) { b.x = c.x; b.y = Math.max(0, c.y); b.z = c.z; }
    if (!c?.alive || !c.connected) { b.stage = "dropped"; b.carrier = ""; b.actor = ""; b.progress = 0; }
  }
  if (b.stage === "dropped") {
    const pickup = alive.find(p => p.team === atk && near(p, b, 1.5) && clear(p, b));
    if (pickup) { b.carrier = pickup.id; b.stage = "carried"; }
  }
  let actor: BombPlayer | undefined;
  let site: typeof BOMB_SITES[number] | undefined;
  if (b.stage === "carried") {
    const c = alive.find(p => p.id === b.carrier && p.using);
    if (c) { site = BOMB_SITES.find(s => near(c, s, BOMB.useRadius) && clear(c, s)); if (site) actor = c; }
  } else if (b.stage === "planted") {
    const eligible = alive.filter(p => p.team === def && p.using && near(p, b, BOMB.useRadius) && clear(p, b));
    actor = eligible.find(p => p.id === b.actor) ?? eligible[0];
  }
  if (!actor) { b.actor = ""; b.progress = 0; return null; }
  if (b.actor !== actor.id) { b.actor = actor.id; b.progress = 0; }
  b.progress = Math.min(1, b.progress + dt / (b.stage === "planted" ? BOMB.defuseMs : BOMB.plantMs));
  if (b.progress < 1 - 1e-6) return null;
  if (b.stage === "planted") return finish(def, "BOMB DEFUSED");
  b.stage = "planted"; b.site = site!.id; b.x = site!.x; b.y = site!.y; b.z = site!.z;
  b.endsAt = now + BOMB.fuseMs; b.carrier = ""; b.actor = ""; b.progress = 0;
  return null;
}
