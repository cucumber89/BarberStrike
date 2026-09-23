import { MATCH, MAX_PLAYERS, OPEN_MAX_PLAYERS, OPEN_PLAYER_CAP_MAX } from "./constants";
import { CS_ECONOMY, CS_ROUND, csKillReward, csLossBonus } from "./cs";
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
  /**
   * The goal and the win condition in ONE sentence a first-time player reads on the loading
   * screen, in the countdown and on the pause card. `blurb` is the mode card's longer pitch.
   */
  objective: string;
}

/** Drop 4 + Drop D: the modes. FFA scores personal kills; Domination scores held flags. */
export const MODES: Record<GameMode, ModeDef> = {
  tdm: { id: "tdm", name: "TEAM DEATHMATCH", short: "TDM", blurb: `FADE kontra TAPER · pierwsza drużyna do ${MATCH.scoreLimit} zabójstw · w większym lobby limit rośnie`, teams: true, scoreLimit: MATCH.scoreLimit, shop: "all", winner: "team",
    objective: `Eliminuj przeciwników: wygrywa drużyna, która pierwsza zdobędzie limit zabójstw (${MATCH.scoreLimit} w pełnym pokoju, więcej w dużym lobby) albo prowadzi po czasie.` },
  boys: { id: "boys", name: "THE BOYS", short: "BOYS", blurb: "5 ról · przejmuj A / B / C · pierwsza drużyna do 100 punktów · B: sklep i zmiana roli", teams: true, scoreLimit: DOM.scoreLimit, shop: "all", winner: "team",
    objective: `Trzymaj punkty A / B / C jako jedna z pięciu ról: wygrywa drużyna, która pierwsza zbierze ${DOM.scoreLimit} punktów.` },
  ffa: { id: "ffa", name: "FREE FOR ALL", short: "FFA", blurb: "Każdy na siebie · pierwszy do 30 zabójstw", teams: false, scoreLimit: 30, shop: "all", winner: "player",
    objective: "Każdy na siebie: wygrywa, kto pierwszy zdobędzie 30 zabójstw albo ma ich najwięcej po czasie." },
  dom: { id: "dom", name: "DOMINATION", short: "DOM", blurb: `Trzymaj A / B / C · pierwsza drużyna do ${DOM.scoreLimit} punktów`, teams: true, scoreLimit: DOM.scoreLimit, shop: "all", winner: "team",
    objective: `Stój na flagach A / B / C, żeby je trzymać: wygrywa drużyna, która pierwsza zbierze ${DOM.scoreLimit} punktów.` },
  bomb: { id: "bomb", name: "BOMB PLANT", short: "BOMB", blurb: "Rundy taktyczne · B: sklep · T: podłóż / rozbrój · pierwsza do 7 rund · zmiana stron po 6", teams: true, scoreLimit: BOMB.wins, shop: "all", winner: "team",
    objective: `Atak podkłada ładunek na A lub B, obrona go rozbraja albo eliminuje atak: pierwsza drużyna z ${BOMB.wins} wygranymi rundami.` },
  gungame: { id: "gungame", name: "GUN GAME", short: "GUN", blurb: "Każdy na siebie · każde zabójstwo daje następną broń · zabójstwo maszynką cofa ofiarę o szczebel · pierwszy przez wszystkie 14 wygrywa", teams: false, scoreLimit: 14, shop: "none", winner: "player",
    objective: "Każde zabójstwo daje ci następną broń z drabinki: wygrywa, kto pierwszy zaliczy wszystkie 14 szczebli." },
  ostrzyzeni: { id: "ostrzyzeni", name: "OSTRZYŻENI", short: "OSTRZ", blurb: "Jeden ostrzyżony z maszynką poluje na resztę · ogolenie przenosi cię na jego stronę · przetrwaj do końca czasu", teams: true, scoreLimit: 5, shop: "survivors", winner: "player",
    objective: "Przetrwaj rundę nieostrzyżony albo, jako ostrzyżony, ogol wszystkich maszynką: po 5 rundach wygrywa najwięcej punktów." },
  duel: { id: "duel", name: "1 v 1", short: "DUEL", blurb: "Dwóch graczy · zasady jak w CS: 15 s zamrożenia na zakupy (plus 5 s po starcie) · kasa i broń zostają, jeśli przeżyjesz · zmiana stron co 3 rundy · pierwszy do 6", teams: true, scoreLimit: 6, shop: "all", winner: "team",
    objective: "Jedno życie na rundę, 60 sekund: wygrywa, kto pierwszy weźmie 6 rund." },
  // The numbers are written out rather than read from DUEL / TOURNAMENT below, because this table
  // is defined before them; `modes.test.ts` asserts the two agree, so they cannot drift quietly.
  turniej: { id: "turniej", name: "TURNIEJ 1 v 1", short: "TURNIEJ", blurb: "Drabinka na 4 albo 8 graczy · pary grają po kolei na zasadach 1 v 1 (pierwszy do 6 rund) · przegrani zostają i oglądają · wygrywa finał", teams: true, scoreLimit: 6, shop: "all", winner: "player",
    objective: "Drabinka pojedynków: wygraj swoją parę (pierwszy do 6 rund), żeby wejść wyżej — wygrywa ten, kto weźmie finał." },
};

export const MODE_ORDER: readonly GameMode[] = ["tdm", "boys", "dom", "bomb", "gungame", "ostrzyzeni", "duel", "turniej"];


// ---------------------------------------------------------------- how many people fit

/**
 * The OPEN LOBBY modes: deathmatch, team or solo.
 *
 * These two are the only modes with no roster shape to protect. TDM scores kills and FFA scores
 * kills; nothing in either of them counts sides into a site take, a flag rotation or one hunter,
 * so a crowd changes how loud it is and not how it works. Everything else keeps `MAX_PLAYERS`,
 * where a twelfth body is already a design decision.
 *
 * Consequence, and the point of the whole table: in these modes BOTS DO NOT TAKE HUMAN SEATS. A
 * room can hold a full house of `MAX_BOTS` and still admit every human the cap allows, which is
 * what "8 bots plus everybody" means in practice.
 */
export const OPEN_MODES: ReadonlySet<GameMode> = new Set<GameMode>(["tdm", "ffa"]);

/**
 * THE KILL LIMIT OF A TEAM DEATHMATCH, scaled by how many bodies are in the room.
 *
 * TDM's limit is a TEAM total, and a team total fills at the rate the room shoots: at six a side
 * the shipped 40 kills is a seven-minute match, and in the open lobby the same 40 is over in about
 * a minute. (FFA's 30 is a PERSONAL total and scales the other way — more players means each one
 * gets fewer, so it is deliberately left alone.)
 *
 * It is a function of the roster rather than a replicated field on purpose: the player map is
 * already on the wire, so the server that ends the match and the HUD that prints the target
 * compute the same number from the same thing, and no message had to be invented for it. The
 * target therefore moves a little as people join and leave, which is the honest behaviour — the
 * match is as long as the room is big.
 *
 * `bodies` counts everyone playing, bots included: a bot's kills fill the same bar.
 */
export function tdmScoreLimit(bodies: number): number {
  const scale = Math.max(1, Math.round(bodies)) / MAX_PLAYERS;
  return Math.max(MATCH.scoreLimit, Math.min(TDM_SCORE_LIMIT_MAX, Math.round(MATCH.scoreLimit * scale / 5) * 5));
}
/** A ceiling, so a freak room cannot ask for a match nobody has time to finish. */
export const TDM_SCORE_LIMIT_MAX = 150;

/** The limit a mode is played to, given the room. Only TDM's moves; everything else is its own. */
export const scoreLimitFor = (mode: GameMode, bodies: number): number =>
  mode === "tdm" ? tdmScoreLimit(bodies) : MODES[mode].scoreLimit;

/** Is this mode an open lobby (bots on top of humans) or a fixed roster (bots in the seats)? */
export const isOpenMode = (mode: GameMode): boolean => OPEN_MODES.has(mode);

/**
 * How many HUMANS a room of this mode admits. `open` is the host's open-lobby cap — normally
 * `openPlayerCap()`, which a host may move with `FB_MAX_PLAYERS`; a duel is always its two seats.
 */
export function modeCapacity(mode: GameMode, open: number = OPEN_MAX_PLAYERS): number {
  if (mode === "duel") return DUEL.players;
  // A tournament is one room holding the whole draw: everybody who is entered is in it from the
  // first pair to the final, whether they are playing that pair or watching it.
  if (mode === "turniej") return TOURNAMENT.maxSize;
  return isOpenMode(mode) ? Math.max(2, Math.min(OPEN_PLAYER_CAP_MAX, Math.round(open))) : MAX_PLAYERS;
}

/**
 * The open-lobby cap a host has chosen: `FB_MAX_PLAYERS` when it is a number this build will
 * serve, the measured default otherwise. Clamped rather than refused, because a typo in an env var
 * on somebody's VPS must not be the reason a room will not start.
 */
export function openPlayerCap(raw: string | number | undefined): number {
  // An env var that is set to nothing is UNSET, not zero — `Number("")` is 0 and would otherwise
  // clamp a host's room down to two seats for the sake of a stray `FB_MAX_PLAYERS=` in a unit file.
  if (raw === undefined || (typeof raw === "string" && raw.trim() === "")) return OPEN_MAX_PLAYERS;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n)) return OPEN_MAX_PLAYERS;
  return Math.max(2, Math.min(OPEN_PLAYER_CAP_MAX, Math.round(n)));
}


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
/**
 * The tournament's own numbers. Everything else about a pair's match — the freeze, the buy window,
 * the economy, the half swap, first to `DUEL.wins` — is the duel's, because a pair IS a duel.
 */
export const TOURNAMENT = {
  sizes: [4, 8] as const,
  maxSize: 8,
  /** The bracket card between two pairs: long enough to read who is up next, short enough to sit through. */
  breakMs: 9000,
  /** A tournament that nobody has entered waits this long for the room to fill before it draws. */
  fillMs: 45000,
} as const;

export const DUEL = {
  players: 2,
  /**
   * The frozen buy window at the start of every round — Counter-Strike's `mp_freezetime`, and the
   * same fifteen seconds it uses in competitive. It was 4 s, which is enough time to press three
   * buttons if you already know which three; the owner asked for CS's, so this is CS's.
   */
  prepMs: CS_ROUND.freezeMs,
  /**
   * And CS's `mp_buytime` on top of it: the shop stays open for this long AFTER the round goes
   * live, so 15 + 5 = the 20 s CS counts from the start of a round. It is why a CS player can
   * still buy while walking out of spawn, and why forgetting armour is not an instant loss.
   */
  buyTailMs: CS_ROUND.buyTailMs,
  /**
   * A cap on the fight, not a target: most duels are over in a fifth of it. CS's round is 1:55,
   * which for two players on a roof is two players looking for each other; 60 s keeps the match
   * moving and the clock rule (more health wins) rarely decides anything.
   */
  roundMs: 60000,
  /** Result pause between rounds. */
  breakMs: 3000,
  wins: 6,
  /** Sides swap every this many rounds: 1–3 on the first set, 4–6 on the other, and so on. */
  halfRounds: 3,
  /** A cap on the whole match; at the cap a tie is played out, a lead ends it. */
  matchMs: 15 * 60000,
  /**
   * THE ECONOMY, Counter-Strike's shape with one change the owner asked for.
   *
   * CS's: you start a half with pistol money, you are paid for the round you won, for the rounds
   * you lost (a ladder that climbs while you keep losing), and for each kill by the weapon that
   * made it; what you carry you keep, what you died holding you lose, and the wallet is reset when
   * the sides swap.
   *
   * The change: a `floor` under every round after the first of a half. In a five-player match a
   * poor round is somebody else's problem to cover; in a duel it is three rounds of being shot at
   * by a rifle while holding the free pistol, which is not a fight. The floor tops a purse up to
   * a gun-and-armour buy, so the ladder still shapes the rich rounds (a won round plus leftovers
   * buys everything) and stops shaping the desperate ones. The first round of each half is a REAL
   * pistol round — it is exempt, or the mode would never have one.
   */
  economy: {
    // CS's numbers, shared with Bomb (`CS_ECONOMY`), plus the one that is not CS's.
    ...CS_ECONOMY,
    /** The owner's floor: any round but a half's first tops up to at least this. */
    floor: 2500,
  },
} as const;

/** What a kill pays in a duel: CS's table (`csKillReward`), shared with Bomb. */
export const duelKillReward = csKillReward;

/** How a round ended FOR ONE PLAYER: they took it, they lost it, or nobody did (a trade or the clock). */
export type DuelRoundResult = "win" | "loss" | "draw";

/**
 * A player's standing in the economy between rounds. Server-side only — money is already a
 * replicated field, and a loss streak is two lines of bookkeeping that nobody needs to see.
 */
export interface DuelPurse {
  money: number;
  /** Rounds lost in a row, which is what the ladder climbs on. Reset by a win and by the swap. */
  losses: number;
}

export const freshDuelPurse = (): DuelPurse => ({ money: DUEL.economy.start, losses: 0 });

/** What the ladder pays after `losses` consecutive losses (0 = this is the first). CS's, shared. */
export const duelLossBonus = csLossBonus;

/**
 * The purse after a round ended. A win pays the round award and clears the streak; a loss pays the
 * ladder and climbs it; a draw (both dead, or the clock with even health) pays the first rung and
 * leaves the streak alone — nobody won it, so nobody should be punished for the next one.
 */
export function duelPurseAfter(purse: DuelPurse, result: DuelRoundResult): DuelPurse {
  const e = DUEL.economy;
  if (result === "win") return { money: Math.min(e.max, purse.money + e.win), losses: 0 };
  if (result === "draw") return { money: Math.min(e.max, purse.money + duelLossBonus(0)), losses: purse.losses };
  return { money: Math.min(e.max, purse.money + duelLossBonus(purse.losses)), losses: purse.losses + 1 };
}

/** Is this round the first of a half — the pistol round, where the wallet and the sides both reset? */
export const duelHalfStart = (round: number): boolean => (Math.max(1, round) - 1) % DUEL.halfRounds === 0;

/**
 * The money a player actually starts `round` with. A half's first round is the pistol round and
 * gets exactly the start money; every other round is topped up to the floor if the match has been
 * unkind. `round` is 1-based.
 */
export function duelStartMoney(purse: DuelPurse, round: number): number {
  if (duelHalfStart(round)) return DUEL.economy.start;
  return Math.min(DUEL.economy.max, Math.max(DUEL.economy.floor, purse.money));
}

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
