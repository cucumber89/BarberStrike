import type { Team } from "./types";

/**
 * Bomb Plant (2.2): the classic rules.
 *
 * One attacker is handed the charge at random each round. They can drop it (a key, or by dying),
 * any attacker walking over it picks it up, and it is planted by HOLDING the objective key while
 * standing still ANYWHERE inside one of the two marked site zones — the charge lands where the
 * planter stood, not on a pre-set spot, so a good plant is a decision. Defenders defuse the same
 * way, next to the charge: ten seconds, or five with a defuse kit bought in the buy phase. Kits,
 * like plates, are lost on death.
 *
 * Pure rules, shared: the server steps them and the client reads the same numbers for the HUD.
 */
export const BOMB = {
  roundMs: 115000, fuseMs: 40000, plantMs: 3200, defuseMs: 10000, defuseKitMs: 5000, breakMs: 5000, buyMs: 10000,
  halfRounds: 6, maxRounds: 12, wins: 7, startMoney: 800, winMoney: 3250, plantMoney: 300, defuseMoney: 300, kitPrice: 400,
  /** Walking within this of a dropped charge picks it up; defusing needs the defender within it too. */
  pickupRadius: 1.4, defuseRadius: 1.8,
  /**
   * Whoever dropped the charge on purpose cannot scoop it straight back: a drop is a hand-over.
   * They get it back the CS way — by stepping this far away from it and walking over it again.
   */
  redropLeaveRadius: 2.2,
} as const;

export const bombAttackTeam = (round: number): Team => round <= BOMB.halfRounds ? 0 : 1;

/** A site is a rectangle on the floor (centre, half extents); `x/y/z` double as the bots' target. */
export interface BombSite { id: "A" | "B"; name: string; x: number; y: number; z: number; hw: number; hd: number }
export const BOMB_SITES: readonly BombSite[] = [
  { id: "A", name: "DEPOT", x: -35, y: 0, z: 24.5, hw: 5, hd: 4 },
  { id: "B", name: "COURTYARD", x: 43, y: 0, z: 24.5, hw: 5, hd: 4 },
] as const;

export const insideSite = (p: { x: number; y: number; z: number }, s: BombSite): boolean =>
  Math.abs(p.x - s.x) <= s.hw && Math.abs(p.z - s.z) <= s.hd && p.y >= s.y - 0.5 && p.y <= s.y + 1.2;

export const siteAt = (p: { x: number; y: number; z: number }): BombSite | undefined => BOMB_SITES.find((s) => insideSite(p, s));

export interface BombData {
  round: number; attackTeam: number; stage: string; carrier: string; site: string;
  x: number; y: number; z: number; endsAt: number; roundEndsAt: number;
  actor: string; progress: number; result: string;
  /** Who dropped the charge on purpose and when — they cannot pick it back up until they step away. */
  droppedBy: string; droppedAt: number;
}
export interface BombPlayer {
  id: string; team: number; alive: boolean; connected: boolean; x: number; y: number; z: number;
  using: boolean;
  /** Defuse kit carried (halves the defuse). */
  kit?: boolean;
}

/** Starts the next round: bumps the round, picks the side and hands the charge to a random attacker. */
export function resetBomb(b: BombData, now: number, players: readonly BombPlayer[], rand: () => number = Math.random): void {
  b.round++; b.attackTeam = bombAttackTeam(b.round);
  const attackers = players.filter(p => p.alive && p.connected && p.team === b.attackTeam);
  const carrier = attackers.length ? attackers[Math.min(attackers.length - 1, Math.floor(rand() * attackers.length))] : undefined;
  b.carrier = carrier?.id ?? ""; b.stage = carrier ? "carried" : "dropped";
  b.x = carrier?.x ?? 0; b.y = carrier?.y ?? 0; b.z = carrier?.z ?? 0;
  b.site = ""; b.endsAt = 0; b.roundEndsAt = now + BOMB.roundMs;
  b.actor = ""; b.progress = 0; b.result = "";
  b.droppedBy = ""; b.droppedAt = 0;
}

/**
 * The carrier lets go of the charge on purpose: it lands a step ahead of them, so a teammate can
 * take it. Returns false when `playerId` is not holding it (nothing changes).
 */
export function dropBomb(b: BombData, playerId: string, now: number, forward: [number, number] = [0, 0]): boolean {
  if (b.stage !== "carried" || b.carrier !== playerId) return false;
  b.stage = "dropped"; b.carrier = ""; b.actor = ""; b.progress = 0;
  b.x += forward[0] * 0.6; b.z += forward[1] * 0.6;
  b.droppedBy = playerId; b.droppedAt = now;
  return true;
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
    if (!c?.alive || !c.connected) { b.stage = "dropped"; b.carrier = ""; b.actor = ""; b.progress = 0; b.droppedBy = ""; b.droppedAt = now; }
  }
  if (b.stage === "dropped") {
    // The dropper is barred only while they are still standing over it: once they have stepped
    // away (or died) the charge is anyone's again, theirs included.
    const dropper = b.droppedBy ? alive.find(p => p.id === b.droppedBy) : undefined;
    if (b.droppedBy && (!dropper || !near(dropper, b, BOMB.redropLeaveRadius))) b.droppedBy = "";
    const pickup = alive.find(p => p.team === atk && near(p, b, BOMB.pickupRadius) && p.id !== b.droppedBy);
    if (pickup) { b.carrier = pickup.id; b.stage = "carried"; b.droppedBy = ""; b.x = pickup.x; b.y = Math.max(0, pickup.y); b.z = pickup.z; }
  }
  let actor: BombPlayer | undefined;
  let site: BombSite | undefined;
  if (b.stage === "carried") {
    const c = alive.find(p => p.id === b.carrier && p.using);
    // Anywhere inside the zone counts; cover inside a site is exactly where a good plant hides.
    if (c) { site = siteAt(c); if (site) actor = c; }
  } else if (b.stage === "planted") {
    const eligible = alive.filter(p => p.team === def && p.using && near(p, b, BOMB.defuseRadius) && clear(p, b));
    actor = eligible.find(p => p.id === b.actor) ?? eligible[0];
  }
  if (!actor) { b.actor = ""; b.progress = 0; return null; }
  if (b.actor !== actor.id) { b.actor = actor.id; b.progress = 0; }
  const need = b.stage === "planted" ? (actor.kit ? BOMB.defuseKitMs : BOMB.defuseMs) : BOMB.plantMs;
  b.progress = Math.min(1, b.progress + dt / need);
  if (b.progress < 1 - 1e-6) return null;
  if (b.stage === "planted") return finish(def, "BOMB DEFUSED");
  b.stage = "planted"; b.site = site!.id; b.x = actor.x; b.y = Math.max(site!.y, actor.y); b.z = actor.z;
  b.endsAt = now + BOMB.fuseMs; b.carrier = ""; b.actor = ""; b.progress = 0;
  return null;
}

/** Seconds the current action needs from scratch, for the HUD's hint. */
export const actionMs = (b: BombData, kit: boolean): number => (b.stage === "planted" ? (kit ? BOMB.defuseKitMs : BOMB.defuseMs) : BOMB.plantMs);
