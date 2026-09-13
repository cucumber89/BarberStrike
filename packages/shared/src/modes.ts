import { MATCH } from "./constants";
import { DOM } from "./dom";
import { BOMB } from "./bomb";
import type { GameMode, Team } from "./types";
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
  boys: { id: "boys", name: "THE BOYS", short: "BOYS", blurb: "5 classes · capture A / B / C · first to 100 points · B to buy / change class", teams: true, scoreLimit: DOM.scoreLimit, shop: "all", winner: "team" },
  ffa: { id: "ffa", name: "FREE FOR ALL", short: "FFA", blurb: "Everyone for themselves · first to 30 kills", teams: false, scoreLimit: 30, shop: "all", winner: "player" },
  dom: { id: "dom", name: "DOMINATION", short: "DOM", blurb: `Hold A / B / C · first to ${DOM.scoreLimit} points`, teams: true, scoreLimit: DOM.scoreLimit, shop: "all", winner: "team" },
  bomb: { id: "bomb", name: "BOMB PLANT", short: "BOMB", blurb: "Tactical rounds · B to buy · T to plant / defuse · first to 7 · sides swap after 6", teams: true, scoreLimit: BOMB.wins, shop: "all", winner: "team" },
  gungame: { id: "gungame", name: "GUN GAME", short: "GUN", blurb: "Everyone for themselves · every kill hands you the next gun · a clippers kill shaves a rung off the victim · first through all 14 wins", teams: false, scoreLimit: 14, shop: "none", winner: "player" },
  ostrzyzeni: { id: "ostrzyzeni", name: "OSTRZYŻENI", short: "OSTRZ", blurb: "One shaved barber with clippers hunts the rest · a clippers kill shaves you onto their side · survive the clock", teams: true, scoreLimit: 5, shop: "survivors", winner: "player" },
  duel: { id: "duel", name: "1 v 1", short: "DUEL", blurb: "Two players · B to buy in the 4 s freeze · a round is one life or 60 s · sides swap every 3 rounds · first to 6", teams: true, scoreLimit: 6, shop: "all", winner: "team" },
};

export const MODE_ORDER: readonly GameMode[] = ["tdm", "boys", "dom", "bomb", "gungame", "ostrzyzeni", "duel"];


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
  ladder: ["pistol", "revolver", "machinepistol", "smg", "smg2", "shotgun", "autoshotgun", "carbine", "rifle", "lmg", "dmr", "sniper", "launcher", "clippers"] as readonly WeaponId[],
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
  /**
   * What an Ostrzyżony is made of, and half of why the chase lands at all.
   *
   * A chaser whose only weapon reaches 2.1 m has to cross a room somebody is shooting across, so
   * speed alone does not buy the distance. MEASURED as the mode was first written (100 HP, like
   * everyone else, ordinary spawns): a bot chaser reached its prey again and again and converted
   * NOBODY across three 90 s rounds against armed bots. Over eight seeded rounds of five players
   * the same setup managed 9 conversions of 40 with THREE rounds producing none at all.
   *
   * With the hunt spawn below and this pool, the same sweep repeated: 14–22 of 40, with zero or
   * one blank round rather than three. The spread between repeats is wide and the spread between
   * 220 and 255 sat inside it, so this is "the chase lands now", not a tuned number. The survivors
   * still usually hold out the clock — the chaser dies three or four times a round — which is the
   * shape the mode wants. Bots shoot better than people do, so a room of humans is the easier room
   * to hunt in, and a playtest is what should move this next.
   *
   * It stays under 255 because `PlayerState.health` is a uint8 and 300 would silently arrive at a
   * client as 44. It is also the WHOLE lever: no extra damage, no armour, nothing gated (L1), and
   * a head shot still takes exactly what it always took.
   */
  shavedHealth: 220,
  /**
   * How close a returning chaser may be put to the nearest survivor. Below this it starts to read
   * as a spawn ambush rather than a chase; above it the walk back is the whole round again.
   */
  huntSpawnMinM: 14,
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

// ---------------------------------------------------------------- 1 v 1 (GÓRA tournament pass)

/**
 * The duel: two players, one life a round, first to `wins`. Built on the same Prep / Playing round
 * machine as Bomb and Ostrzyżeni (the round counter is `state.bomb.round`, the scores are
 * `scoreA` / `scoreB`), so it adds no replicated field and no message.
 *
 * Why these numbers: a round is a single fight, so 60 s is a cap, not a target — most rounds end in
 * a third of that; the 4 s freeze is long enough to buy and short enough that a match of eleven
 * rounds is under ten minutes; `roundMoney` buys any one gun on the roster plus armour, so the
 * choice each round is the loadout and never the wallet (L1: nothing is gated). Sides swap every
 * `halfRounds` so a map that is not perfectly symmetric still gives both players both starts.
 */
export const DUEL = {
  players: 2,
  /** The frozen buy window at the start of every round. */
  prepMs: 4000,
  roundMs: 60000,
  /** Result pause between rounds. */
  breakMs: 3000,
  wins: 6,
  /** Sides swap every this many rounds: 1–3 on the first set, 4–6 on the other, and so on. */
  halfRounds: 3,
  /** Every round starts with this much and a clean wallet; nothing carries over. */
  roundMoney: 6000,
  /** A cap on the whole match; at the cap a tie is played out, a lead ends it. */
  matchMs: 15 * 60000,
} as const;

/** The smallest view of a player the duel rule needs. */
export interface DuelPlayer { team: number; alive: boolean; connected: boolean; health: number }

/** Which spawn SET a team uses for the round about to be played (1-based). */
export const duelSpawnSide = (team: Team, round: number): Team =>
  ((team + Math.floor((Math.max(1, round) - 1) / DUEL.halfRounds)) % 2) as Team;

/**
 * Who has won the round, if anyone. A side with nobody standing loses; a mutual wipe is a draw
 * (nobody scores); at the clock the side with more health left wins, and equal health is a draw.
 * Null while the round is still on. Sides that have nobody CONNECTED are not judged at all — the
 * room holds the clock while a player is reconnecting.
 */
export function duelRoundWinner(players: readonly DuelPlayer[], now: number, roundEndsAt: number): { winner: Team | -1; reason: string } | null {
  const side = (t: number) => players.filter((p) => p.connected && p.team === t);
  const a = side(0), b = side(1);
  if (a.length === 0 || b.length === 0) return null;
  const hp = (s: DuelPlayer[]) => s.reduce((sum, p) => sum + (p.alive ? p.health : 0), 0);
  const aAlive = a.some((p) => p.alive), bAlive = b.some((p) => p.alive);
  if (!aAlive && !bAlive) return { winner: -1, reason: "TRADE" };
  if (!aAlive) return { winner: 1, reason: "ELIMINATED" };
  if (!bAlive) return { winner: 0, reason: "ELIMINATED" };
  if (now < roundEndsAt) return null;
  const ha = hp(a), hb = hp(b);
  if (ha === hb) return { winner: -1, reason: "TIME · EVEN" };
  return { winner: ha > hb ? 0 : 1, reason: "TIME · MORE HEALTH" };
}
