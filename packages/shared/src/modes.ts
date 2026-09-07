import { MATCH } from "./constants";
import { DOM } from "./dom";
import { BOMB } from "./bomb";
import type { GameMode } from "./types";
import type { WeaponId } from "./weapons";
import type { PerkId } from "./perks";

export interface ModeDef {
  id: GameMode;
  name: string;
  short: string;
  blurb: string;
  /** Two sides (TDM, Domination, Bomb, Ostrzyżeni) or everyone for themselves (FFA, Gun Game). */
  teams: boolean;
  /** Team score (TDM kills, Domination points, rounds) or personal kills (FFA) that ends the match. */
  scoreLimit: number;
  /**
   * Drop D: who may buy. "all" = the buy windows as they were; "none" = no economy at all (Gun
   * Game); "survivors" = only the unshaved side, at the start of a round (Ostrzyżeni).
   */
  shop: "all" | "none" | "survivors";
  /**
   * Drop D: who the result screen names. Team modes name a side; Gun Game names the player who
   * finished the ladder; Ostrzyżeni has sides but everyone changes side, so it names the top score.
   */
  winner: "team" | "player";
}

/** Drop 4 + Drop D: the modes. FFA scores personal kills; Domination scores held flags. */
export const MODES: Record<GameMode, ModeDef> = {
  tdm: { id: "tdm", name: "TEAM DEATHMATCH", short: "TDM", blurb: `FADE vs TAPER · first to ${MATCH.scoreLimit} kills`, teams: true, scoreLimit: MATCH.scoreLimit, shop: "all", winner: "team" },
  ffa: { id: "ffa", name: "FREE FOR ALL", short: "FFA", blurb: "Everyone for themselves · first to 30 kills", teams: false, scoreLimit: 30, shop: "all", winner: "player" },
  dom: { id: "dom", name: "DOMINATION", short: "DOM", blurb: `Hold A / B / C · first to ${DOM.scoreLimit} points`, teams: true, scoreLimit: DOM.scoreLimit, shop: "all", winner: "team" },
  bomb: { id: "bomb", name: "BOMB PLANT", short: "BOMB", blurb: "Tactical rounds · B to buy · T to plant / defuse · first to 7 · sides swap after 6", teams: true, scoreLimit: BOMB.wins, shop: "all", winner: "team" },
  gungame: { id: "gungame", name: "GUN GAME", short: "GUN", blurb: "Everyone for themselves · every kill hands you the next gun · a clippers kill shaves a rung off the victim · first through all 11 wins", teams: false, scoreLimit: 11, shop: "none", winner: "player" },
  ostrzyzeni: { id: "ostrzyzeni", name: "OSTRZYŻENI", short: "OSTRZ", blurb: "One shaved barber with clippers hunts the rest · a clippers kill shaves you onto their side · survive the clock", teams: true, scoreLimit: 5, shop: "survivors", winner: "player" },
};

export const MODE_ORDER: readonly GameMode[] = ["tdm", "ffa", "dom", "bomb", "gungame", "ostrzyzeni"];

// ---------------------------------------------------------------- Gun Game (Drop D)

/**
 * The ladder is data: sidearms first, then the close-range guns, the rifles, the precision pieces,
 * the launcher, and the clippers as the last rung — the winning kill is a shave.
 *
 * Everyone carries the clippers in the melee slot the whole match (as in every mode), so a clippers
 * kill can happen from any rung. It does not advance the killer unless the clippers ARE their rung
 * (the classic knife rule: the reward for the humiliation is the victim's setback, not a free rung —
 * otherwise the clippers would be strictly better than the rung weapon and nobody would use the
 * ladder). Bots and humans play by the same table.
 */
export const GUN_GAME = {
  ladder: ["pistol", "revolver", "smg", "smg2", "shotgun", "rifle", "lmg", "dmr", "sniper", "launcher", "clippers"] as readonly WeaponId[],
  /** Back on your feet in three seconds: a party mode has no waves and no shop to spend them in. */
  respawnMs: 3000,
  /** A clippers kill sets the victim back this many rungs (never below the first). */
  setback: 1,
} as const;

/** Which rung a weapon is, or -1 when it is not on the ladder. */
export const ladderRung = (weapon: string): number => GUN_GAME.ladder.indexOf(weapon as WeaponId);

/** The weapon a player on `rung` carries; past the end (the winner) it is still the last rung. */
export const ladderWeapon = (rung: number): WeaponId =>
  GUN_GAME.ladder[Math.max(0, Math.min(GUN_GAME.ladder.length - 1, rung))];

/** Has this rung index finished the ladder — the last rung's kill has been made? */
export const ladderDone = (rung: number): boolean => rung >= GUN_GAME.ladder.length;

/**
 * Where both players stand after a kill. `weapon` is what the kill was made with.
 * - A kill with the killer's rung weapon moves the killer up one.
 * - A clippers kill sets the victim back `setback` rungs; it only moves the killer up when the
 *   clippers are their rung.
 * - Anything else (a kill with a weapon that is not the rung — a fall, a wall of fire) changes nothing.
 */
export function ladderAfterKill(killerRung: number, victimRung: number, weapon: string): { killer: number; victim: number } {
  const rungWeapon = ladderWeapon(killerRung);
  const advances = weapon === rungWeapon;
  const shave = weapon === "clippers";
  return {
    killer: advances ? killerRung + 1 : killerRung,
    victim: shave ? Math.max(0, victimRung - GUN_GAME.setback) : victimRung,
  };
}

// ---------------------------------------------------------------- Ostrzyżeni (Drop D)

/**
 * Infection. One random player starts each round shaved (Ostrzyżony): clippers only, the energy
 * perk for the whole round, a bare head everyone can see. A clippers kill shaves the victim onto
 * the shaved side. Survivors buy at the start of the round and win the round if anyone unshaved is
 * still standing when the clock runs out; the shaved side wins when nobody unshaved remains.
 *
 * Sides reuse the team plumbing: survivors are team 0, the shaved are team 1, so friendly fire,
 * bot enemy filters and the HUD's team bar all work unchanged. The match is `rounds` rounds; the
 * result screen names the top score, because everyone plays both sides.
 */
export const OSTRZYZENI = {
  /** Team indices, named so the room and the HUD never disagree about which side is which. */
  survivorTeam: 0 as const,
  shavedTeam: 1 as const,
  rounds: 5,
  /** The buy window at the start of a round — survivors shop, the shaved one waits. */
  prepMs: 8000,
  roundMs: 90000,
  /** Result pause between rounds. */
  breakMs: 5000,
  /** Every survivor starts a round with this much; wallets do not carry over. */
  roundMoney: 3000,
  /** The shaved side is back on its feet on a short timer; survivors stay down until the round ends. */
  shavedRespawnMs: 3000,
  speedPerk: "energy" as PerkId,
  /** Score: surviving a round, converting somebody, and a kill on a shaved chaser. */
  surviveScore: 300,
  convertScore: 100,
  killScore: 50,
} as const;

/**
 * Does a kill shave the victim onto the shaved side? Only the clippers convert, only an unshaved
 * victim can be converted, and only while the round is live (the room passes `live`).
 */
export const convertsOnKill = (weapon: string, victimShaved: boolean, live = true): boolean =>
  live && weapon === "clippers" && !victimShaved;

/** The smallest view of a player the round rule needs. */
export interface InfectionPlayer { alive: boolean; connected: boolean; shaved: boolean }

/**
 * Who has won the round, if anyone: the shaved side when nobody unshaved is standing, the survivors
 * when the clock has run out with somebody still unshaved. Null while it is still on.
 */
export function infectionRoundWinner(players: readonly InfectionPlayer[], now: number, roundEndsAt: number): "survivors" | "shaved" | null {
  let unshaved = 0;
  for (const p of players) if (p.connected && p.alive && !p.shaved) unshaved++;
  if (unshaved === 0) return "shaved";
  if (now >= roundEndsAt) return "survivors";
  return null;
}

/**
 * Who starts the round shaved: one random connected player. `rand` is the room's seeded RNG so a
 * test can name the victim. Returns null with nobody to pick from.
 */
export function pickFirstShaved<T extends { connected: boolean }>(players: readonly T[], rand: () => number): T | null {
  const pool = players.filter((p) => p.connected);
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
