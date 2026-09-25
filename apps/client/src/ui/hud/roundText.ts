import { BOMB, OSTRZYZENI, TEAM_NAMES, bombAttackTeam, parseBracket, roundName, type GameMode, type Team } from "@frankibarber/shared";
import { money, plPlural } from "./format";

/**
 * Drop U: the words for how a ROUND ended — the round banner's, the pair card's and the result's —
 * and for how the next one starts. Moved verbatim out of `ui/resultText.ts` by P0 (which still
 * re-exports every name, so no caller changed); owned by P5 from here (docs/UI_U_SPEC.md §5.4,
 * §7.0). Pure: the moment bus (`bus.ts`) decides WHEN a banner shows, this decides what it SAYS.
 */

/** Ostrzyżeni's sides, in the team slots (see TopStrip.tsx `sideNamesOf`). */
export const OSTRZYZENI_SIDES = ["OCALENI", "OSTRZYŻENI"] as const;
export const sideNames = (mode: GameMode): readonly [string, string] => (mode === "ostrzyzeni" ? OSTRZYZENI_SIDES : TEAM_NAMES);

/** Polish for the server's bomb / duel round reasons (`bomb.result`). Unknown strings pass through. */
const ROUND_REASON: Record<string, string> = {
  "BOMB DETONATED": "Ładunek wybuchł",
  "BOMB DEFUSED": "Ładunek rozbrojony",
  "DEFENDERS ELIMINATED": "Obrońcy wyeliminowani",
  "ATTACKERS ELIMINATED": "Atakujący wyeliminowani",
  "SITE SECURED": "Czas minął, ładunku nie podłożono",
  "TRADE": "Obaj padli — runda bez punktu",
  "ELIMINATED": "Przeciwnik wyeliminowany",
  "TIME · EVEN": "Czas minął przy równym zdrowiu",
  "TIME · MORE HEALTH": "Czas minął — więcej zdrowia wygrywa",
  "SURVIVORS HELD": "Ktoś dotrwał nieostrzyżony do końca czasu",
  "ALL SHAVED": "Wszyscy ostrzyżeni",
};
export const roundReasonText = (result: string): string => ROUND_REASON[result] ?? result;

/**
 * The SHORT reason (≤ 3 words) that banners and the result's first two stages print (spec §5.4).
 * Seeded by Ultron ahead of wave 2 because P2's pair card and P6's result read it (a frozen export)
 * and would not compile against P5's branch alone; P5 owns it from here.
 */
const ROUND_REASON_SHORT: Record<string, string> = {
  "BOMB DETONATED": "Ładunek wybuchł",
  "BOMB DEFUSED": "Ładunek rozbrojony",
  "DEFENDERS ELIMINATED": "Obrona wybita",
  "ATTACKERS ELIMINATED": "Atak wybity",
  "SITE SECURED": "Czas minął",
  "TRADE": "Obaj padli",
  "ELIMINATED": "Przeciwnik wyeliminowany",
  "TIME · EVEN": "Czas — remis",
  "TIME · MORE HEALTH": "Czas — więcej zdrowia",
  "SURVIVORS HELD": "Ocaleni dotrwali",
  "ALL SHAVED": "Wszyscy ostrzyżeni",
};
export const roundReasonShort = (result: string): string => ROUND_REASON_SHORT[result] ?? roundReasonText(result);

/**
 * The server reason a round card names. It is `bomb.result` in every round mode since P-SRV (which
 * writes „SURVIVORS HELD” / „ALL SHAVED” in Ostrzyżeni); an Ostrzyżeni break with the field still
 * empty (a server from before P-SRV, or the first snapshot after the event) falls back to the
 * winner the Prep event carried. "" when the state does not say.
 */
export function roundReason(mode: GameMode, result: string, roundWinner: Team | -1): string {
  if (result || mode !== "ostrzyzeni" || roundWinner === -1) return result;
  return roundWinner === OSTRZYZENI.survivorTeam ? "SURVIVORS HELD" : "ALL SHAVED";
}

const duelLike = (mode: GameMode): boolean => mode === "duel" || mode === "turniej";

/**
 * Which team took the round, or -1 for a round without one (a duel trade); null when the state
 * does not say. Bomb names it through the result and the attacking side; the duel (and so the
 * tournament) through the winner the Prep event carried; Ostrzyżeni through its result, else that
 * winner.
 */
function roundTaker(mode: GameMode, result: string, roundWinner: Team | -1, attackTeam: Team | -1): Team | -1 | null {
  if (mode === "bomb") {
    if (!result || attackTeam === -1) return null;
    const attackers = result === "BOMB DETONATED" || result === "DEFENDERS ELIMINATED";
    return (attackers ? attackTeam : 1 - attackTeam) as Team;
  }
  if (duelLike(mode)) return result ? roundWinner : null;
  if (mode === "ostrzyzeni") {
    const t = result === "SURVIVORS HELD" ? OSTRZYZENI.survivorTeam : result === "ALL SHAVED" ? OSTRZYZENI.shavedTeam : roundWinner;
    return t === -1 ? null : t;
  }
  return null;
}

export interface RoundEnd { title: string; why: string; mine: boolean | null }

/**
 * The round card: who took the round and why, from the mode's real signals — the bomb's `result`
 * string (whose side follows from it and the attacking team), the duel's reason string plus the
 * winner the Prep event carried, Ostrzyżeni's result (else its winner). Turniej is a duel: `names`
 * are the pair's two players, team 0 first, and the title names the winner. Null when the state
 * does not say.
 */
export function roundEnd(mode: GameMode, bombResult: string, roundWinner: Team | -1, attackTeam: Team | -1, myTeam: Team, names?: readonly [string, string] | null): RoundEnd | null {
  const [a, b] = names ?? sideNames(mode);
  const reason = roundReason(mode, bombResult, roundWinner);
  const t = roundTaker(mode, reason, roundWinner, attackTeam);
  if (t === null) return null;
  const why = roundReasonText(reason);
  if (t === -1) return { title: "RUNDA BEZ ROZSTRZYGNIĘCIA", why, mine: null };
  return { title: `RUNDA DLA ${t === 0 ? a : b}`, why, mine: t === myTeam };
}

// ------------------------------------------------------------------------------------ banner copy

/** A colour a banner part is drawn in (§3.4): the two teams, or a state. */
export type Tone = "team0" | "team1" | "ok" | "danger" | "warn" | "dim" | "tx";

/** One chip of a banner's eyebrow row. */
export interface Chip { text: string; tone: Tone }

/** One part of a banner's line; the parts are joined with „ · ”. `testid` marks a pinned part. */
export interface LinePart { text: string; testid?: string }

/**
 * A banner's words (§3.7): exactly three rows — the eyebrow (chips, t1), the title (t5, one line)
 * and one line (t2). A row may be empty; it still holds its place, so every banner is one box.
 */
export interface BannerCopy {
  eyebrow: Chip[];
  title: string;
  titleTone: Tone;
  line: LinePart[];
  /** The colour of the band's two rules. */
  rule: Tone;
}

/** The round-end banner's class (§8.5, `multiplayer.spec.ts:162-163`): whose round it was to me. */
export type RoundEndClass = "mine" | "theirs" | "even" | "watch";

export interface RoundBannerCopy extends BannerCopy { cls: RoundEndClass }

/** The round's MVP as the store carries it (`HudRoundMvp`, P1's producer; null when not observed). */
export interface MvpLike { name: string; kills: number; why: "plant" | "defuse" | "kills" }

/** „MVP Kowal · podłożenie”, „MVP xXPiotrekXx · 3 zabójstwa” — the nick in its own case. */
export const mvpText = (m: MvpLike): string =>
  `MVP ${m.name} · ${m.why === "plant" ? "podłożenie" : m.why === "defuse" ? "rozbrojenie" : `${m.kills} ${plPlural(m.kills, "zabójstwo", "zabójstwa", "zabójstw")}`}`;

export interface RoundBannerInput {
  mode: GameMode;
  /** `bomb.result` (the store's `roundResult`). */
  result: string;
  roundWinner: Team | -1;
  attackTeam: Team | -1;
  myTeam: Team;
  /** Turniej: the pair on the board, team 0 first; null elsewhere. */
  names?: readonly [string, string] | null;
  /** Turniej: I am not in the pair on the board, only watching it. */
  watching?: boolean;
  /** The duel's carry: a survivor keeps the gun, the fallen lose it. */
  alive: boolean;
  /** Duel / turniej: the sides swap after this round (rounds 3, 6, 9). */
  sideSwap: boolean;
  mvp: MvpLike | null;
  /** The final round, at the match's end (stage A): eyebrow „OSTATNIA RUNDA”, and no MVP. */
  final?: boolean;
}

/**
 * The round-end banner (§5.2 rows 20, 21, 26, 29, 58): the eyebrow says whether I won it, the
 * title whose round it was, the line why — the SHORT reason (§5.4) — with the MVP in bomb or the
 * carry in the 1 v 1. No score and no countdown: the strip carries both (Principle 1).
 */
export function roundBannerCopy(i: RoundBannerInput): RoundBannerCopy | null {
  const end = roundEnd(i.mode, i.result, i.roundWinner, i.attackTeam, i.myTeam, i.names);
  if (!end) return null;
  const reason = roundReason(i.mode, i.result, i.roundWinner);
  const taker = roundTaker(i.mode, reason, i.roundWinner, i.attackTeam);
  const cls: RoundEndClass = i.watching ? "watch" : end.mine === null ? "even" : end.mine ? "mine" : "theirs";
  const teamTone: Tone = taker === 0 ? "team0" : taker === 1 ? "team1" : "dim";
  const outcome: Tone = cls === "mine" ? "ok" : cls === "theirs" ? "danger" : "dim";
  const eyebrow: Chip[] = i.final ? [{ text: "OSTATNIA RUNDA", tone: outcome }]
    : cls === "watch" ? []
    : [{ text: cls === "mine" ? "WYGRANA" : cls === "theirs" ? "PRZEGRANA" : "REMIS", tone: outcome }];
  if (!i.final && duelLike(i.mode) && i.sideSwap) eyebrow.push({ text: "ZMIANA STRON", tone: "warn" });
  const line: LinePart[] = [{ text: roundReasonShort(reason) }];
  if (!i.final && i.mode === "bomb" && i.mvp) line.push({ text: mvpText(i.mvp), testid: "round-mvp" });
  if (!i.final && duelLike(i.mode) && !i.watching) line.push({ text: i.alive ? "Broń zostaje" : "Broń przepada", testid: "round-end-carry" });
  return { cls, eyebrow, title: end.title, titleTone: teamTone, line, rule: teamTone };
}

/**
 * The halftime card (§5.2 row 23): after round `BOMB.halfRounds` the sides swap and everyone starts
 * again from the start money. It follows the round-end banner at +7000 ms of the 15 s break. Null
 * for any other round and outside bomb.
 */
export function halftimeCard(mode: GameMode, round: number, myTeam: Team): BannerCopy | null {
  if (mode !== "bomb" || round !== BOMB.halfRounds) return null;
  const next = bombAttackTeam(round + 1) === myTeam ? "Teraz atakujesz" : "Teraz bronisz";
  return {
    eyebrow: [{ text: "PRZERWA", tone: "warn" }], title: "ZMIANA STRON", titleTone: "warn",
    line: [{ text: next }, { text: `wszyscy zaczynają od ${money(BOMB.startMoney)}` }], rule: "warn",
  };
}

/** What the freeze-start banner reads from the phase model (`phase.ts`, P2). */
export interface FreezeInput {
  mode: GameMode;
  round: number;
  matchPoint: -1 | 0 | 1 | 2;
  lastOfHalf: boolean;
  lastRound: boolean;
  secondHalfStart: boolean;
  mySide: "atak" | "obrona" | "ocalony" | "ostrzyzony" | null;
  myTeam: Team;
  /** Turniej: the bracket string, for the stage and the pair. */
  bracket: string;
}

/** Turniej: the pair on the board, team 0 first, and its stage („PÓŁFINAŁ”); null when unreadable. */
export function turniejPair(bracket: string): { names: readonly [string, string]; stage: string } | null {
  const view = parseBracket(bracket);
  const m = view?.matches[view.at];
  if (!view || !m || !m.a || !m.b) return null;
  const rounds = view.matches.reduce((n, x) => Math.max(n, x.round), 0) + 1;
  return { names: [m.a, m.b], stage: roundName(rounds - m.round) };
}

/**
 * The freeze-start banner (§5.2 row 19): an optional eyebrow — match point first, then the last
 * round, the last round of a half, the second half; in turniej the stage — the title „RUNDA n”,
 * and the line: my side in bomb, the pair in turniej's round 1. The eyebrow glows (`glow`) when it
 * is a match point.
 */
export function freezeCopy(i: FreezeInput): BannerCopy & { glow: boolean } {
  const pair = i.mode === "turniej" ? turniejPair(i.bracket) : null;
  const names = pair?.names ?? sideNames(i.mode);
  const eyebrow: Chip[] = [];
  if (i.matchPoint === 2) eyebrow.push({ text: "MECZBOL DLA OBU", tone: "warn" });
  else if (i.matchPoint === 0 || i.matchPoint === 1) eyebrow.push({ text: `MECZBOL · ${names[i.matchPoint]}`, tone: "warn" });
  else if (i.lastRound) eyebrow.push({ text: "OSTATNIA RUNDA", tone: "warn" });
  else if (i.lastOfHalf) eyebrow.push({ text: "OSTATNIA RUNDA POŁOWY", tone: "warn" });
  else if (i.secondHalfStart) eyebrow.push({ text: "DRUGA POŁOWA", tone: "warn" });
  else if (pair) eyebrow.push({ text: pair.stage, tone: "dim" });
  const line: LinePart[] = [];
  if (i.mode === "bomb" && i.mySide) line.push({ text: i.mySide === "atak" ? "ATAKUJESZ" : "BRONISZ" });
  else if (pair && i.round === 1) line.push({ text: `${pair.names[0]} vs ${pair.names[1]}` });
  const mine: Tone = i.myTeam === 0 ? "team0" : "team1";
  return { eyebrow, title: `RUNDA ${i.round}`, titleTone: "tx", line, rule: i.matchPoint >= 0 ? "warn" : mine, glow: i.matchPoint >= 0 };
}

/**
 * Ostrzyżeni's role card, in place of „RUNDA n” (§5.2 row 39): the chaser is told to shave, a
 * survivor to survive — and who has the clippers, by the nick in its own case.
 */
export function roleCopy(chaser: boolean, chaserName: string): BannerCopy {
  return chaser
    ? { eyebrow: [], title: "MASZ MASZYNKĘ", titleTone: "danger", line: [{ text: "OGOL WSZYSTKICH" }], rule: "danger" }
    : { eyebrow: [], title: "PRZETRWAJ", titleTone: "team0", line: chaserName ? [{ text: `${chaserName} MA MASZYNKĘ` }] : [], rule: "team0" };
}
