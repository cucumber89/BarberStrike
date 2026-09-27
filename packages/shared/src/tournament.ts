import type { GameMode } from "./types";

/**
 * The 1 v 1 tournament (drop T): a single-elimination bracket played out inside ONE room.
 *
 * The owner asked for a tournament that can be run on a Friday evening without anybody making an
 * account: four or eight people join a room, the server draws the bracket, and the pairs are played
 * one after another on the duel's own rules while everybody else watches. So there is nothing here
 * about identity, nothing is written to disk, and a bracket lives exactly as long as its room —
 * which is also why this file is pure data and pure functions, tested without a server.
 *
 * WHAT IS AND IS NOT HERE. This module owns the SHAPE of a tournament: who plays whom, who goes
 * through, whose turn it is, and the one string the clients are sent to draw it. It knows nothing
 * about rounds, money, spawning or the clock — a pair's match is an ordinary duel and the room runs
 * it with the code that already exists.
 */

/**
 * How many entrants a bracket is drawn for. Four is one evening; eight is the full night; sixteen
 * and thirty-two are the parallel-arena tournament of drop V, where every pair is its own room.
 */
export type TournamentSize = number;
export const TOURNAMENT_SIZES: readonly TournamentSize[] = [4, 8, 16, 32];

/**
 * The tournament seat slider (drop V follow-up, owner's brief): the host does not know if 18, 24 or
 * 32 will turn up, so the picker is any EVEN count from two to the hard cap, and byes fill the gap.
 */
export const LOBBY_SEATS = { min: 2, max: 32, step: 2 } as const;
/** A valid seat count off the slider: an even number in [2, 32]. Guards a value read from the UI. */
export const isLobbySeats = (n: number): boolean =>
  Number.isInteger(n) && n >= LOBBY_SEATS.min && n <= LOBBY_SEATS.max && n % 2 === 0;
/** The bracket that holds `seats` players — the next power of two, clamped to [2, 32]. Byes fill the rest. */
export const bracketCapacity = (seats: number): number => {
  let c = 2;
  while (c < seats) c *= 2;
  return Math.min(32, Math.max(2, c));
};

/**
 * The rounds, largest first, as the screen names them. The three names near the end stay the words a
 * player reads (ĆWIERĆFINAŁ / PÓŁFINAŁ / FINAŁ); the earlier rounds of a large draw are the fractions
 * a bracket is spoken with — "1/8" (round of sixteen), "1/16" (round of thirty-two).
 */
export const roundName = (roundsLeft: number): string =>
  roundsLeft <= 1 ? "FINAŁ"
  : roundsLeft === 2 ? "PÓŁFINAŁ"
  : roundsLeft === 3 ? "ĆWIERĆFINAŁ"
  : `1/${2 ** (roundsLeft - 1)}`;

export interface TourMatch {
  /** 0 = the first round played. */
  round: number;
  /** Entrant ids. An empty slot is a BYE: the other side goes through without playing. */
  a: string;
  b: string;
  /** The id that went through, or "" while the match has not been decided. */
  winner: string;
  /** Rounds won by each side in this pair's duel. */
  scoreA: number;
  scoreB: number;
}

export interface Bracket {
  size: TournamentSize;
  /** Every match, in the order they are played. A bracket of N has N − 1 of them. */
  matches: TourMatch[];
  /** The match being played now; `matches.length` once the final is over. */
  at: number;
  /** Display names, by id, kept here so a player who leaves is still named on the bracket. */
  names: Record<string, string>;
}

/** The number of rounds a bracket of this size has (4 → 2, 8 → 3, 16 → 4, 32 → 5). */
export const roundsOf = (size: TournamentSize): number => Math.log2(size);

/**
 * Draw the bracket.
 *
 * `rnd` is the room's own seeded generator, so a draw is reproducible from the room's seed and a
 * test can pin one. Fewer entrants than the size is normal — a pair with an empty slot is a bye,
 * and `settleByes` walks them through before anybody is asked to play.
 */
export function seedBracket(entrants: { id: string; name: string }[], size: TournamentSize, rnd: () => number): Bracket {
  // The picker is any even seat count now (LOBBY_SEATS); the bracket itself is always a power of two,
  // so a draw of 18 or 24 plays in a 32-slot bracket with the empty seats as byes.
  const cap = bracketCapacity(size);
  const ids = entrants.map((e) => e.id);
  // Fisher-Yates on a copy: the draw is the only random thing in a tournament, and it happens once.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  while (ids.length < cap) ids.push("");
  const names: Record<string, string> = {};
  for (const e of entrants) names[e.id] = e.name;

  const matches: TourMatch[] = [];
  for (let i = 0; i < cap; i += 2) matches.push({ round: 0, a: ids[i], b: ids[i + 1], winner: "", scoreA: 0, scoreB: 0 });
  for (let round = 1; round < roundsOf(cap); round++) {
    const count = cap / 2 ** (round + 1);
    for (let i = 0; i < count; i++) matches.push({ round, a: "", b: "", winner: "", scoreA: 0, scoreB: 0 });
  }
  return settleByes({ size: cap, matches, at: 0, names });
}

/** Where the winner of match `index` goes: the match in the next round, and which side of it. */
function nextSlot(b: Bracket, index: number): { match: number; side: "a" | "b" } | null {
  const m = b.matches[index];
  const first = b.matches.findIndex((x) => x.round === m.round);
  const within = index - first;
  const nextRound = b.matches.findIndex((x) => x.round === m.round + 1);
  if (nextRound < 0) return null;              // the final: its winner goes nowhere
  return { match: nextRound + Math.floor(within / 2), side: within % 2 === 0 ? "a" : "b" };
}

/**
 * Walk past every match that needs no playing: a bye, and (after a walkover) a pair that has become
 * one player. Called after the draw and after every result, so `currentMatch` is always a real pair
 * or nothing at all.
 */
function settleByes(b: Bracket): Bracket {
  while (b.at < b.matches.length) {
    const m = b.matches[b.at];
    // Two empty slots: nothing to play and nobody to send on. It happens in a bracket of eight
    // that six people entered, and it has to be STEPPED OVER rather than waited on — a bracket
    // that stops here is a tournament that never reaches its final.
    if (!m.a && !m.b) { b = { ...b, at: b.at + 1 }; continue; }
    const lone = m.a && !m.b ? m.a : !m.a && m.b ? m.b : "";
    if (!lone) break;                          // a real pair: somebody has to play it
    b = advance(b, lone);
  }
  return b;
}

/** Put `winner` through from the match at `at`, and move on. Does not validate: the room does. */
function advance(b: Bracket, winner: string): Bracket {
  const matches = b.matches.map((m) => ({ ...m }));
  const m = matches[b.at];
  m.winner = winner;
  const slot = nextSlot({ ...b, matches }, b.at);
  if (slot) matches[slot.match][slot.side] = winner;
  return { ...b, matches, at: b.at + 1 };
}

/** The pair playing now, or null when the bracket has not started or is over. */
export const currentMatch = (b: Bracket): TourMatch | null =>
  b.at < b.matches.length && b.matches[b.at].a && b.matches[b.at].b ? b.matches[b.at] : null;

export const isDone = (b: Bracket): boolean => b.at >= b.matches.length;

/** Who won the whole thing, or "" while it is still being played. */
export const champion = (b: Bracket): string => (isDone(b) && b.matches.length ? b.matches[b.matches.length - 1].winner : "");

/** How many rounds are still to be played, including the one in progress (1 = the final). */
export function roundsLeft(b: Bracket): number {
  const m = b.matches[Math.min(b.at, b.matches.length - 1)];
  return roundsOf(b.size) - m.round;
}

/** Record the score of the pair being played, without deciding it. */
export function setScore(b: Bracket, scoreA: number, scoreB: number): Bracket {
  if (b.at >= b.matches.length) return b;
  const matches = b.matches.map((m) => ({ ...m }));
  matches[b.at] = { ...matches[b.at], scoreA, scoreB };
  return { ...b, matches };
}

/**
 * The pair being played is over: `winner` goes through, and the bracket moves to the next pair that
 * actually needs playing. A winner who is not in the current pair is ignored, so a stray call
 * cannot corrupt a bracket.
 */
export function reportWinner(b: Bracket, winner: string, scoreA = 0, scoreB = 0): Bracket {
  const m = b.matches[b.at];
  if (!m || (winner !== m.a && winner !== m.b)) return b;
  return settleByes(advance(setScore(b, scoreA, scoreB), winner));
}

/**
 * Somebody left. In the pair being played it is a walkover for the other side; anywhere else the
 * id is struck out of the draw, so the bracket keeps its shape and whoever would have met them
 * goes through instead of waiting for a player who is not coming back.
 */
export function withdraw(b: Bracket, id: string): Bracket {
  if (!id) return b;
  const cur = b.matches[b.at];
  if (cur && (cur.a === id || cur.b === id)) {
    const other = cur.a === id ? cur.b : cur.a;
    return other ? reportWinner(b, other, cur.scoreA, cur.scoreB) : { ...b, at: b.at + 1 };
  }
  const matches = b.matches.map((m) => ({
    ...m,
    a: m.a === id ? "" : m.a,
    b: m.b === id ? "" : m.b,
  }));
  return settleByes({ ...b, matches });
}

// ------------------------------------------------------------------ the wire

/** `|` and `;` separate the fields of the replicated string, so a nickname may not carry them. */
const clean = (s: string): string => s.replace(/[|;]/g, " ").slice(0, 16);

/**
 * The whole bracket as ONE short string, which is how it reaches the clients.
 *
 * `<size>|<at>;<a>|<b>|<scoreA>|<scoreB>|<winner a|b|-> ; …` — names rather than ids, because a
 * player who has left the room is still on the bracket and the client would have nothing to look
 * their name up in. An eight-player bracket is seven matches and about 250 bytes, written only
 * when something about it changes.
 */
export function bracketString(b: Bracket): string {
  const name = (id: string) => (id ? clean(b.names[id] ?? id) : "");
  const rows = b.matches.map((m) => {
    const w = m.winner === m.a && m.a ? "a" : m.winner === m.b && m.b ? "b" : "-";
    return `${name(m.a)}|${name(m.b)}|${m.scoreA}|${m.scoreB}|${w}`;
  });
  return [`${b.size}|${b.at}`, ...rows].join(";");
}

export interface BracketView {
  size: TournamentSize;
  at: number;
  matches: { round: number; a: string; b: string; scoreA: number; scoreB: number; winner: "a" | "b" | "" }[];
}

/** The client's side of `bracketString`. Returns null for anything it does not understand. */
export function parseBracket(s: string): BracketView | null {
  if (!s) return null;
  const parts = s.split(";");
  const head = parts[0]?.split("|") ?? [];
  const size = Number(head[0]), at = Number(head[1]);
  if (!TOURNAMENT_SIZES.includes(size as TournamentSize) || !Number.isFinite(at)) return null;
  const matches: BracketView["matches"] = [];
  let round = 0, left = size / 2, inRound = 0;
  for (const row of parts.slice(1)) {
    const f = row.split("|");
    if (f.length < 5) return null;
    matches.push({
      round, a: f[0], b: f[1],
      scoreA: Number(f[2]) || 0, scoreB: Number(f[3]) || 0,
      winner: f[4] === "a" ? "a" : f[4] === "b" ? "b" : "",
    });
    if (++inRound >= left) { round++; left = Math.max(1, left / 2); inRound = 0; }
  }
  return { size: size as TournamentSize, at, matches };
}

/** Is this the mode that runs a bracket? One place to ask, so nothing tests the string twice. */
export const isTournament = (mode: GameMode): boolean => mode === "turniej";
