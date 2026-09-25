import { useRef, useSyncExternalStore } from "react";
import { BOMB, DUEL, MATCH, MODES, MatchPhase, OSTRZYZENI, parseBracket, type GameMode, type Team } from "@frankibarber/shared";
import { hud, type HudState } from "../../game/store";
import type { Side } from "./types";

/**
 * Drop U: THE PHASE MODEL — what moment of the match this is, which clock matters, which round it
 * is and whose side I am on, derived once from the replicated state plus what this client itself
 * observed (docs/UI_U_SPEC.md §6.3). Every zone reads it instead of re-deriving the phase from raw
 * fields, which is how the HUD came to print four clocks in a duel and 30:00 in a bomb freeze.
 *
 * Written by P0 to the spec, owned by P2. The exported signatures are frozen for the drop; the
 * behaviour changes only with a new named test in `phase.test.ts`.
 *
 * The model holds DEADLINES (`clockEndsAt`, `phaseEndsAt`), never milliseconds left, so it changes
 * only on events; components tick their own clocks with `clockMs` / `urgent` / `endedStage`.
 */

/** Where in the match we are. */
export type Moment = "warmup" | "countdown" | "freeze" | "live" | "break" | "halftime" | "betweenPairs" | "ended";

/** Which clock the strip shows (Principle 8). */
export type ClockKind = "warmup" | "countdown" | "freeze" | "bomb" | "round" | "match" | "break" | "none";

/** The result's three stages in Ended (§6.1): A the final round, B the verdict, C the card. */
export type EndedStage = "A" | "B" | "C";

export interface PhaseModel {
  mode: GameMode;
  /** bomb, duel, turniej, ostrzyżeni: the modes played in rounds. Turniej is a duel everywhere. */
  roundMode: boolean;
  moment: Moment;
  /** A round break (the round-end banner's time), halftime included; never between pairs. */
  inBreak: boolean;
  /** How the break was recognised: an observed Playing→Prep edge, or the rejoin fallback. */
  breakSource: "edge" | "fallback" | null;
  /** Turniej only: a pair is decided and the bracket card is up. */
  betweenPairs: boolean;
  clockKind: ClockKind;
  /** The deadline the clock counts to (server time); 0 when the clock shows a word or nothing. */
  clockEndsAt: number;
  /** The state's `phaseEndsAt`, carried for `endedStage`. */
  phaseEndsAt: number;
  /**
   * The round the player is in: bomb's current round; elsewhere the rounds finished during a break
   * (and in Ended), and the next one otherwise. 0 outside the round modes.
   */
  round: number;
  /** -1 none; 0 or 1 that team is one round from winning; 2 both are. Bomb and duel/turniej only. */
  matchPoint: -1 | 0 | 1 | 2;
  /** This round is the last before the sides swap (bomb round 6; duel rounds 3, 6, 9). */
  lastOfHalf: boolean;
  /** This round is the last the match can have (bomb 12, duel 11, ostrzyżeni 5). */
  lastRound: boolean;
  /** Bomb: this round opens the second half (round 7). */
  secondHalfStart: boolean;
  /** A break after which the sides swap: bomb's halftime, a duel break after rounds 3, 6, 9. */
  sideSwap: boolean;
  /** My side in bomb and ostrzyżeni while rounds are being played; null otherwise. */
  mySide: Side | null;
}

/** What the model reads from the store. `HudState` fits it; tests may pass just these fields. */
export type PhaseInput = Pick<HudState,
  "mode" | "phase" | "phaseEndsAt" | "matchEndsAt" | "bomb" | "round" | "roundResult" | "bracket" | "scoreA" | "scoreB" | "players" | "myTeam" | "reconnecting">;

/**
 * What this client OBSERVED since the HUD mounted (or the connection resumed) — the part of the
 * model the state alone cannot say. The break signal has no field of its own (no schema change),
 * so a break is recognised by the Playing→Prep edge that opened it, and the pair on the board by
 * the bracket `at` it had.
 */
export interface PhaseObs {
  /** A Playing→Prep edge has been seen since mount; from then on the fallback no longer applies. */
  edgeSeen: boolean;
  /** `phaseEndsAt` of the Prep the last observed Playing→Prep edge opened: the break's deadline. */
  breakEndsAt: number;
  /** Turniej: the bracket `at` of the pair being played, latched while that pair is on the board. */
  pairAt: number | null;
}

export const NO_OBS: PhaseObs = Object.freeze({ edgeSeen: false, breakEndsAt: 0, pairAt: null });

const ROUND_MODES: ReadonlySet<GameMode> = new Set<GameMode>(["bomb", "duel", "turniej", "ostrzyzeni"]);
/** Is this mode played in rounds? */
export const isRoundMode = (mode: GameMode): boolean => ROUND_MODES.has(mode);
/** Turniej is a duel everywhere (`TdmRoom.ts:265` already treats it so). */
const duelLike = (mode: GameMode): boolean => mode === "duel" || mode === "turniej";

/** The stage lengths in Ended: A 3 s (round modes only), then B 3 s, then C to the end. */
const STAGE_A_MS = 3000;
const STAGE_B_MS = 3000;
/** Urgency: a round with ≤ 10 s left, a match with ≤ 30 s. */
const ROUND_URGENT_MS = 10_000;
const MATCH_URGENT_MS = 30_000;

const bracketAt = (bracket: string): number | null => parseBracket(bracket)?.at ?? null;

/**
 * Fold one store state into the observation. Pure: `prev` is the state seen before `h` (null for
 * the first one after mount). Returns `obs` itself when nothing new was observed.
 */
export function observePhase(obs: PhaseObs, prev: PhaseInput | null, h: PhaseInput): PhaseObs {
  let next = obs;
  if (prev?.reconnecting && !h.reconnecting) {
    // The connection came back: whatever happened in the gap was not seen, and a "Playing→Prep"
    // across it may have skipped a whole break. Start over, as after a join, so the fallback applies.
    next = NO_OBS;
  } else if (prev && prev.phase === MatchPhase.Playing && h.phase === MatchPhase.Prep) {
    next = { ...next, edgeSeen: true, breakEndsAt: h.phaseEndsAt };
  }
  // The pair on the board: latched whenever that pair is visibly being played — somebody alive and
  // nobody at the winning score — so a moved `at` (the pair decided, or a walkover) stands out.
  if (h.mode === "turniej" && (h.phase === MatchPhase.Prep || h.phase === MatchPhase.Playing)
      && Math.max(h.scoreA, h.scoreB) < DUEL.wins && h.players.some((p) => p.alive)) {
    const at = bracketAt(h.bracket);
    if (at !== null && at !== next.pairAt) next = { ...next, pairAt: at };
  }
  return next;
}

/** The model for one state and what was observed up to it. Pure. */
export function derivePhase(h: PhaseInput, obs: PhaseObs = NO_OBS): PhaseModel {
  const mode = h.mode;
  const roundMode = isRoundMode(mode);
  const prep = h.phase === MatchPhase.Prep;

  // Between pairs (turniej, Prep only): the bracket moved on from the latched pair or the pair
  // reached the winning score; with nothing latched, nobody alive after a round that was not a trade.
  let betweenPairs = false;
  if (mode === "turniej" && prep) {
    if (obs.pairAt !== null) {
      const at = bracketAt(h.bracket);
      betweenPairs = (at !== null && at !== obs.pairAt) || Math.max(h.scoreA, h.scoreB) >= DUEL.wins;
    } else {
      betweenPairs = !h.players.some((p) => p.alive) && h.roundResult !== "TRADE";
    }
  }

  // A round break: the Prep an observed Playing→Prep edge opened, while its deadline is current;
  // before any edge was seen (a join, reload or reconnect mid-break), the state's own signs.
  let inBreak = false;
  let breakSource: PhaseModel["breakSource"] = null;
  if (roundMode && prep && !betweenPairs) {
    if (obs.edgeSeen) {
      if (h.phaseEndsAt > 0 && h.phaseEndsAt === obs.breakEndsAt) { inBreak = true; breakSource = "edge"; }
    } else if (mode === "bomb" ? h.bomb?.stage === "resolved" : h.roundResult !== "") {
      inBreak = true; breakSource = "fallback";
    }
  }

  const bombRound = h.bomb?.round ?? h.round;
  const ended = h.phase === MatchPhase.Ended;
  const round = !roundMode ? 0
    : mode === "bomb" ? bombRound
    : inBreak || betweenPairs || ended ? h.round : h.round + 1;
  const halftime = mode === "bomb" && inBreak && round === BOMB.halfRounds;

  const moment: Moment =
    h.phase === MatchPhase.Waiting ? "warmup"
    : h.phase === MatchPhase.Countdown ? "countdown"
    : h.phase === MatchPhase.Playing ? "live"
    : ended ? "ended"
    : betweenPairs ? "betweenPairs"
    : halftime ? "halftime"
    : inBreak ? "break"
    : "freeze";

  let clockKind: ClockKind = "none";
  let clockEndsAt = 0;
  switch (moment) {
    case "warmup": clockKind = "warmup"; break;
    case "countdown": clockKind = "countdown"; clockEndsAt = h.phaseEndsAt; break;
    case "freeze": clockKind = "freeze"; clockEndsAt = h.phaseEndsAt; break;
    case "break": case "halftime": case "betweenPairs": clockKind = "break"; clockEndsAt = h.phaseEndsAt; break;
    case "live":
      if (mode === "bomb" && h.bomb) {
        if (h.bomb.stage === "planted") { clockKind = "bomb"; clockEndsAt = h.bomb.endsAt; }
        else { clockKind = "round"; clockEndsAt = h.bomb.roundEndsAt; }
      } else if (roundMode) { clockKind = "round"; clockEndsAt = h.phaseEndsAt; }
      else { clockKind = "match"; clockEndsAt = h.matchEndsAt; }
      break;
    case "ended": break;
  }

  // The round flags describe rounds being played, so they hold only from the first freeze to the
  // last break.
  const inRounds = roundMode && (moment === "freeze" || moment === "live" || moment === "break" || moment === "halftime");
  const wins = mode === "bomb" ? BOMB.wins : duelLike(mode) ? DUEL.wins : 0;
  let matchPoint: PhaseModel["matchPoint"] = -1;
  if (inRounds && wins > 0) {
    const a = h.scoreA === wins - 1, b = h.scoreB === wins - 1;
    matchPoint = a && b ? 2 : a ? 0 : b ? 1 : -1;
  }
  const lastOfHalf = inRounds && (mode === "bomb" ? round === BOMB.halfRounds : duelLike(mode) ? round > 0 && round % DUEL.halfRounds === 0 : false);
  const lastRound = inRounds && (mode === "bomb" ? round === BOMB.maxRounds : duelLike(mode) ? round === 2 * DUEL.wins - 1 : round === OSTRZYZENI.rounds);
  const secondHalfStart = inRounds && mode === "bomb" && round === BOMB.halfRounds + 1;
  const sideSwap = (moment === "break" || moment === "halftime")
    && (mode === "bomb" ? round === BOMB.halfRounds : duelLike(mode) && round > 0 && round % DUEL.halfRounds === 0);

  let mySide: Side | null = null;
  if (inRounds && mode === "bomb" && h.bomb) mySide = h.bomb.attackTeam === h.myTeam ? "atak" : "obrona";
  else if (inRounds && mode === "ostrzyzeni") mySide = h.myTeam === OSTRZYZENI.shavedTeam ? "ostrzyzony" : "ocalony";

  return {
    mode, roundMode, moment, inBreak, breakSource, betweenPairs, clockKind, clockEndsAt, phaseEndsAt: h.phaseEndsAt,
    round, matchPoint, lastOfHalf, lastRound, secondHalfStart, sideSwap, mySide,
  };
}

/** The Ended stage at `serverNow`, or null outside Ended. */
export function endedStage(model: PhaseModel, serverNow: number): EndedStage | null {
  if (model.moment !== "ended") return null;
  const elapsed = MATCH.endedMs - (model.phaseEndsAt - serverNow);
  if (model.roundMode) return elapsed < STAGE_A_MS ? "A" : elapsed < STAGE_A_MS + STAGE_B_MS ? "B" : "C";
  return elapsed < STAGE_B_MS ? "B" : "C";
}

/** Milliseconds left on the model's clock at `serverNow`; 0 when the clock shows a word or nothing. */
export function clockMs(model: PhaseModel, serverNow: number): number {
  return model.clockEndsAt > 0 ? Math.max(0, model.clockEndsAt - serverNow) : 0;
}

/** The clock is urgent: a round (or the fuse) with ≤ 10 s left, a match with ≤ 30 s. */
export function urgent(model: PhaseModel, serverNow: number): boolean {
  const left = clockMs(model, serverNow);
  if (model.clockKind === "round" || model.clockKind === "bomb") return left > 0 && left <= ROUND_URGENT_MS;
  if (model.clockKind === "match") return left > 0 && left <= MATCH_URGENT_MS;
  return false;
}

/** Which side the strip draws where. `order` is the CSS `order` of the score-a (team 0) side and the
 * score-b (team 1) side; the clock sits at order 1 between them. */
export interface StripSides {
  left: Team | "me";
  right: Team | "best";
  order: readonly [number, number];
}

const TEAM0_LEFT: StripSides = Object.freeze({ left: 0, right: 1, order: Object.freeze([0, 2] as const) });
const TEAM1_LEFT: StripSides = Object.freeze({ left: 1, right: 0, order: Object.freeze([2, 0] as const) });
const ME_LEFT: StripSides = Object.freeze({ left: "me", right: "best", order: Object.freeze([0, 2] as const) });

/**
 * My side on the left (Principle 9): in team modes my team, by CSS `order` only — `score-a` and
 * `score-b` stay bound to team 0 and team 1; in ffa and gungame „TY” left and the best other
 * player right. Pure, and it returns one of three constant objects, so it is safe in a selector.
 */
export function stripSides(model: PhaseModel, h: Pick<HudState, "myTeam">): StripSides {
  if (!MODES[model.mode].teams) return ME_LEFT;
  return h.myTeam === 1 ? TEAM1_LEFT : TEAM0_LEFT;
}

const sameModel = (a: PhaseModel, b: PhaseModel): boolean => {
  for (const k in a) if (a[k as keyof PhaseModel] !== b[k as keyof PhaseModel]) return false;
  return true;
};

/**
 * The observer behind `usePhaseModel`: feed it every store state in order and it keeps the
 * observation and hands back the SAME model object until a field really changes. Exported so the
 * edge logic can be tested with a sequence of states, without React.
 */
export function createPhaseTracker(): { read: (h: PhaseInput) => PhaseModel; obs: () => PhaseObs } {
  let last: PhaseInput | null = null;
  let obs: PhaseObs = NO_OBS;
  let model: PhaseModel | null = null;
  return {
    read(h: PhaseInput): PhaseModel {
      if (h === last && model) return model;
      obs = observePhase(obs, last, h);
      const next = derivePhase(h, obs);
      if (!model || !sameModel(model, next)) model = next;
      last = h;
      return model;
    },
    obs: () => obs,
  };
}

/**
 * The phase model of the live store, observed from this HUD's mount. Re-renders only when the
 * model changes (the phase, a deadline, the round, the side…), not on every store commit.
 */
export function usePhaseModel(): PhaseModel {
  const tracker = useRef<ReturnType<typeof createPhaseTracker> | null>(null);
  if (!tracker.current) tracker.current = createPhaseTracker();
  const t = tracker.current;
  const read = (): PhaseModel => t.read(hud.get());
  return useSyncExternalStore(hud.subscribe, read, read);
}
