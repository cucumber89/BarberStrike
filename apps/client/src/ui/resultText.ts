import { BOMB, DUEL, GUN_GAME, MATCH, MODES, OSTRZYZENI, parseBracket, parseHaircut, scoreLimitFor, worstHaircut, type GameMode, type Team } from "@frankibarber/shared";
import type { MatchReward } from "../game/progression/profile";
import type { ScoreRow } from "../game/store";
import { countWords } from "./hud/format";
import type { EndedStage } from "./hud/phase";
import { roundReasonShort, sideNames } from "./hud/roundText";

// The round's words (side names, round reasons, the round card) moved to `hud/roundText.ts` in
// drop U; they are re-exported here so every caller reads them from where it always did.
export { OSTRZYZENI_SIDES, roundEnd, roundReasonText, sideNames, type RoundEnd } from "./hud/roundText";

/**
 * The words on the result screens, computed from the replicated state and nothing else. Pure so
 * the "why did that round / match end" sentence can be unit-tested against every ending the
 * server actually produces, instead of being discovered by playing seven-minute matches.
 *
 * RULE: no sentence here claims a cause the state does not carry. Where the server does not say
 * (a Domination match can end on time or on points, and both leave the same fields), the
 * sentence is derived from the score against the mode's limit, which is the rule the server ran.
 *
 * Drop U (docs/UI_U_SPEC.md P6): the match end is read in three stages — A the final round (P5's
 * banner, round modes only), B the verdict, C the card — and every stage is a function here, so
 * the reading budget (§6.5: at most three words per second on screen) is a unit test over every
 * outcome and every reason instead of a hope.
 */

export type Outcome = "win" | "loss" | "draw" | "over";

export const OUTCOME_TITLE: Record<Outcome, string> = { win: "ZWYCIĘSTWO", loss: "PORAŻKA", draw: "REMIS", over: "KONIEC MECZU" };

export interface ResultCtx {
  mode: GameMode;
  winner: Team | -1;
  winnerId: string;
  winnerName: string;
  myId: string;
  myTeam: Team;
  scoreA: number;
  scoreB: number;
  players: readonly ScoreRow[];
  /** The last round's server reason (`bomb.result`, mirrored for every round mode); "" when none. */
  roundResult?: string;
  /** The tournament's bracket string; "" outside a tournament. */
  bracket?: string;
}

/** One life a round, a freeze, a break (§6.3). Written out: `phase.ts` is P2's to move. */
const ROUND_MODES: ReadonlySet<GameMode> = new Set<GameMode>(["bomb", "duel", "turniej", "ostrzyzeni"]);
export const isRoundModeResult = (mode: GameMode): boolean => ROUND_MODES.has(mode);

/** Win / loss / draw from the local player's seat; "over" for somebody with no row (a watcher). */
export function matchOutcome(c: ResultCtx): Outcome {
  const me = c.players.find((p) => p.id === c.myId);
  if (!me) return "over";
  if (MODES[c.mode].winner === "team") return c.winner === -1 ? "draw" : c.winner === c.myTeam ? "win" : "loss";
  return c.winnerId === "" ? "draw" : c.winnerId === c.myId ? "win" : "loss";
}

/** The final of a finished bracket (its last pair), or null when there is no bracket to read. */
function finalOf(bracket: string | undefined): { a: string; b: string; scoreA: number; scoreB: number } | null {
  const view = parseBracket(bracket ?? "");
  const m = view?.matches[view.matches.length - 1];
  return m && m.a && m.b ? m : null;
}

/**
 * The score line under the title: the sides (the veto keeps „FADE 40 — 31 TAPER”; Ostrzyżeni's are
 * OCALENI and OSTRZYŻENI), the final's two names and score in a tournament, or the named winner in
 * FFA and gun game. Ostrzyżeni's winner is a player, but the podium's ★ names them: the line used
 * to add „· X bierze tę noc”, four words the card's budget (§6.5, ≤ 42) has no room for twice.
 */
export function scoreLine(c: ResultCtx): string {
  const [a, b] = sideNames(c.mode);
  if (MODES[c.mode].winner === "team" || c.mode === "ostrzyzeni") return `${a} ${c.scoreA} — ${c.scoreB} ${b}`;
  const final = c.mode === "turniej" ? finalOf(c.bracket) : null;
  if (final) return `${final.a} ${final.scoreA} — ${final.scoreB} ${final.b}`;
  return c.winnerName ? `${c.winnerName} bierze tę noc` : "Nikt nie bierze tej nocy";
}

/**
 * Stage B's second line. The score line, except where it is a sentence: in FFA and gun game the
 * verdict names the winner with the podium's star („★ xXPiotrekXx”), and says nothing on a draw —
 * three seconds hold nine words at most (§6.5), and „Nikt nie bierze tej nocy” alone is five.
 */
export function verdictScore(c: ResultCtx): string {
  if (hasScoreLine(c.mode)) return scoreLine(c);
  return c.winnerName ? `★ ${c.winnerName}` : "";
}

/** FFA and gun game have no sides: the podium is their score, so the card prints no score line. */
export const hasScoreLine = (mode: GameMode): boolean => MODES[mode].teams;

const unitOf: Partial<Record<GameMode, string>> = { tdm: "zabójstw", dom: "punktów", boys: "punktów" };
const bothSidesHere = (c: ResultCtx): boolean => {
  const connected = (t: Team) => c.players.some((p) => p.connected && p.team === t);
  return connected(0) && connected(1);
};

/** One sentence on how the match was decided (the card's why when no round decided it). */
export function matchWhy(c: ResultCtx): string {
  // TDM's limit is the room's (`scoreLimitFor`), not the mode's: the result screen has to explain
  // the match that was actually played.
  const limit = scoreLimitFor(c.mode, c.players.length);
  const top = Math.max(c.scoreA, c.scoreB);
  if (c.mode === "gungame") {
    const lead = c.players.find((p) => p.id === c.winnerId);
    if (lead && lead.score >= GUN_GAME.ladder.length) return `${lead.name} przeszedł całą drabinkę ${GUN_GAME.ladder.length} broni`;
    return c.winnerId ? `Czas minął — ${c.winnerName} jest najwyżej na drabince` : "Czas minął przy równej drabince";
  }
  if (c.mode === "ostrzyzeni") {
    // The score is on the line above; the why only names who took the night (drop U: it printed
    // the score a second time).
    return c.winnerName ? `Po ${OSTRZYZENI.rounds} rundach najwięcej punktów ma ${c.winnerName}` : `Po ${OSTRZYZENI.rounds} rundach równa liczba punktów`;
  }
  if (c.mode === "ffa") {
    const lead = c.players.find((p) => p.id === c.winnerId);
    if (lead && lead.kills >= limit) return `Pierwszy do ${limit} zabójstw`;
    return c.winnerId ? "Czas minął — najwięcej zabójstw wygrywa" : "Czas minął przy równej liczbie zabójstw";
  }
  // Team modes.
  // A tournament is decided by the FINAL, not by a limit: the pair scores on the screen are one
  // pair's, and "the first team to 6 points" is a sentence about a mode this is not.
  if (c.mode === "turniej") return c.winnerName ? `${c.winnerName} wygrał finał drabinki` : "Drabinka rozegrana";
  if (top >= limit) return c.mode === "bomb" ? `Pierwsza drużyna z ${BOMB.wins} wygranymi rundami` : c.mode === "duel" ? `Pierwszy do ${DUEL.wins} wygranych rund` : `Pierwsi do ${limit} ${unitOf[c.mode] ?? "punktów"}`;
  if (!bothSidesHere(c)) return "Druga strona opuściła mecz";
  if (c.scoreA === c.scoreB) return "Czas minął przy równym wyniku";
  return "Wyższy wynik po czasie";
}

/**
 * Stage C's why (`result-why`). In a round mode the match was decided by its last round, so the
 * line names it — `${short} w ostatniej rundzie` (graft) — and falls back to the match's rule when
 * the state holds no reason (a duel capped during a freeze: the server clears `bomb.result` at
 * every freeze).
 */
export function resultWhy(c: ResultCtx): string {
  const rr = c.roundResult ?? "";
  if (isRoundModeResult(c.mode) && rr !== "") return `${roundReasonShort(rr)} w ostatniej rundzie`;
  return matchWhy(c);
}

/**
 * Stage B's why (`result-verdict-why`), at most three words: the deciding round's short reason in
 * a round mode (§5.4), otherwise the rule — „Limit zabójstw”, „Wynik po czasie”, „Cała drabinka”,
 * „Finał drabinki” — with „Limit punktów” for the two points modes (a kill limit would be false
 * there) and „Walkower” when a side left (what the pair card calls it, §5.2 #31).
 */
export function verdictWhy(c: ResultCtx): string {
  const rr = c.roundResult ?? "";
  if (isRoundModeResult(c.mode) && rr !== "") return roundReasonShort(rr);
  if (c.mode === "turniej") return "Finał drabinki";
  if (c.mode === "gungame") {
    const lead = c.players.find((p) => p.id === c.winnerId);
    return lead && lead.score >= GUN_GAME.ladder.length ? "Cała drabinka" : "Wynik po czasie";
  }
  if (c.mode === "ffa") {
    const lead = c.players.find((p) => p.id === c.winnerId);
    return lead && lead.kills >= scoreLimitFor(c.mode, c.players.length) ? "Limit zabójstw" : "Wynik po czasie";
  }
  if (c.mode === "ostrzyzeni") return "Wynik po czasie";
  const limit = scoreLimitFor(c.mode, c.players.length);
  if (Math.max(c.scoreA, c.scoreB) >= limit && (c.mode === "tdm" || c.mode === "dom" || c.mode === "boys")) return c.mode === "tdm" ? "Limit zabójstw" : "Limit punktów";
  if (!bothSidesHere(c)) return "Walkower";
  return "Wynik po czasie";
}

/** Stage B, the verdict: the title in the result's colour, the score line, the short why. */
export interface Verdict { title: string; score: string; why: string }
export const verdict = (c: ResultCtx): Verdict => ({ title: OUTCOME_TITLE[matchOutcome(c)], score: verdictScore(c), why: verdictWhy(c) });

export interface KeyStat { id: "objective" | "kills" | "assists" | "deaths"; label: string; value: string }

/**
 * The three numbers under the verdict, in ONE order in every mode (drop U): the mode's objective
 * first where it has one of its own (points, the rung), then kills, assists, deaths — cut to three.
 * Where kills ARE the objective (TDM, FFA) or the objective is the team's rounds (Bomb, the 1 v 1,
 * the tournament), it reads K, A, D. The old per-mode orders (K D A here, K A D in Bomb, shaves in
 * Ostrzyżeni) made the same number sit in a different box every match.
 */
export function keyStats(mode: GameMode, row: ScoreRow | undefined): KeyStat[] {
  if (!row) return [];
  const k: KeyStat = { id: "kills", label: "ZABÓJSTWA", value: String(row.kills) };
  const a: KeyStat = { id: "assists", label: "ASYSTY", value: String(row.assists) };
  const d: KeyStat = { id: "deaths", label: "ZGONY", value: String(row.deaths) };
  const objective: KeyStat | null =
    mode === "gungame" ? { id: "objective", label: "SZCZEBEL", value: `${Math.min(GUN_GAME.ladder.length, row.score)} / ${GUN_GAME.ladder.length}` }
      : mode === "dom" || mode === "boys" || mode === "ostrzyzeni" ? { id: "objective", label: "PUNKTY", value: String(row.score) }
        : null;
  return (objective ? [objective, k, a, d] : [k, a, d]).slice(0, 3);
}

/** One step of the podium: who, the number that ranked them, and whether it is me. */
export interface PodiumStep { id: string; name: string; value: string; rank: 1 | 2 | 3; me: boolean }

const byScore = (a: ScoreRow, b: ScoreRow): number => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths;
const byKills = (a: ScoreRow, b: ScoreRow): number => b.kills - a.kills || a.deaths - b.deaths;

/** Everybody, best first, by the number the podium shows for the mode (turniej by the bracket). */
export function ranking(c: ResultCtx): { row: ScoreRow; value: number }[] {
  if (c.mode === "ffa") return [...c.players].sort(byKills).map((row) => ({ row, value: row.kills }));
  if (c.mode === "gungame") return [...c.players].sort(byScore).map((row) => ({ row, value: Math.min(GUN_GAME.ladder.length, row.score) }));
  if (c.mode === "turniej") {
    // The champion, the finalist, then everyone knocked out earlier by the rounds they took in the
    // pair that knocked them out — all of it read off the bracket the server replicates.
    const view = parseBracket(c.bracket ?? "");
    if (view) {
      const out = new Map<string, { depth: number; took: number }>();
      view.matches.forEach((m) => {
        if (!m.winner) return;
        const [w, l, tw, tl] = m.winner === "a" ? [m.a, m.b, m.scoreA, m.scoreB] : [m.b, m.a, m.scoreB, m.scoreA];
        out.set(l, { depth: m.round, took: tl });
        const prev = out.get(w);
        if (!prev || prev.depth <= m.round) out.set(w, { depth: m.round + 1, took: tw });
      });
      const at = (r: ScoreRow) => out.get(r.name) ?? { depth: -1, took: 0 };
      return [...c.players].sort((a, b) => at(b).depth - at(a).depth || at(b).took - at(a).took || byScore(a, b)).map((row) => ({ row, value: at(row).took }));
    }
  }
  return [...c.players].sort(byScore).map((row) => ({ row, value: row.score }));
}

/** The top three (fewer when fewer played), #1 first. */
export function podium(c: ResultCtx): PodiumStep[] {
  return ranking(c).slice(0, 3).map(({ row, value }, i) => ({ id: row.id, name: row.name, value: String(value), rank: (i + 1) as 1 | 2 | 3, me: row.id === c.myId }));
}

/** „MIEJSCE #n Z m” (§5.2 #62), in FFA and gun game only, and only when I am off the podium. */
export function placement(c: ResultCtx): string | null {
  if (hasScoreLine(c.mode)) return null;
  const all = ranking(c);
  const i = all.findIndex((r) => r.row.id === c.myId);
  return i >= 3 ? `MIEJSCE #${i + 1} Z ${all.length}` : null;
}

/** „+790 XP · POZIOM 4” — the XP and the level it left you on. */
export const xpLine = (r: MatchReward): string => `+${r.total} XP · POZIOM ${r.after.level}`;

/** „NAJGORSZA FRYZURA: RYSIEK ×3”, or null when nobody was shaved. */
export function worstLine(players: readonly ScoreRow[]): string | null {
  const w = worstHaircut(players);
  return w ? `NAJGORSZA FRYZURA: ${w.name} ×${w.shaves}` : null;
}

/** The footer's clock: the real time to the warm-up the server restarts by itself. */
export const warmupLine = (msLeft: number): string => `ROZGRZEWKA ZA ${Math.max(0, Math.ceil(msLeft / 1000))}s`;

export const TAB_WORDS = { summary: "PODSUMOWANIE", table: "TABELA", bracket: "DRABINKA" } as const;
export const DETAILS_WORD = "SZCZEGÓŁY";
export const LEAVE_WORD = "WYJDŹ DO MENU";
export const WATCHER_NOTE = "Oglądasz — bez nagród za ten mecz.";

/** Everything stage C prints before a click, as strings — what `MatchResult` renders and the budget test counts. */
export interface StageC {
  title: string;
  /** Null in FFA and gun game, where the podium is the score. */
  score: string | null;
  why: string;
  tabs: string[];
  podium: PodiumStep[];
  placement: string | null;
  stats: KeyStat[];
  /** The XP line, or the watcher's note; null when neither applies. */
  xp: string | null;
  levelUp: string | null;
  worst: string | null;
  details: string | null;
  foot: string;
  leave: string;
}

export function stageC(c: ResultCtx, reward: MatchReward | null, msLeft: number): StageC {
  const outcome = matchOutcome(c);
  const me = c.players.find((p) => p.id === c.myId);
  return {
    title: OUTCOME_TITLE[outcome],
    score: hasScoreLine(c.mode) ? scoreLine(c) : null,
    why: resultWhy(c),
    tabs: [TAB_WORDS.summary, TAB_WORDS.table, ...(c.bracket ? [TAB_WORDS.bracket] : [])],
    podium: podium(c),
    placement: placement(c),
    stats: keyStats(c.mode, me),
    xp: reward ? xpLine(reward) : outcome === "over" ? WATCHER_NOTE : null,
    // One word however many levels: the XP line already names the level it left you on.
    levelUp: reward && reward.levelsGained > 0 ? "AWANS" : null,
    worst: worstLine(c.players),
    details: reward ? DETAILS_WORD : null,
    foot: warmupLine(msLeft),
    leave: LEAVE_WORD,
  };
}

/** The words stage C shows, counted the gallery's way (`countWords`, §3.10). */
export function stageCWords(s: StageC): number {
  const parts = [
    s.title, s.score ?? "", s.why, ...s.tabs, ...s.podium.flatMap((p) => [p.name, p.value]), s.placement ?? "",
    ...s.stats.flatMap((x) => [x.value, x.label]), s.xp ?? "", s.levelUp ?? "", s.worst ?? "", s.details ?? "", s.foot, s.leave,
  ];
  return parts.reduce((n, p) => n + countWords(p), 0);
}

/** Stage B's words. */
export const verdictWords = (v: Verdict): number => countWords(v.title) + countWords(v.score) + countWords(v.why);

/**
 * The stage the result layer shows: the clock's (`endedStage`), unless the player skipped to the
 * card with Tab or a tab click (graft), and C once the match is no longer Ended (the card fading
 * out on Ended → Waiting keeps the face it had).
 */
export function resultStage(stage: EndedStage | null, skipped: boolean): EndedStage {
  if (skipped || stage === null) return "C";
  return stage;
}

export type ResultTab = "summary" | "table" | "bracket";
/** What the player has done to the result: skipped to the card, and which tab it shows. */
export interface ResultView { skipped: boolean; tab: ResultTab }
export const RESULT_VIEW0: ResultView = Object.freeze({ skipped: false, tab: "summary" });
export type ResultInput = { kind: "tabKey" } | { kind: "tabClick"; tab: ResultTab };

/**
 * The result's two inputs. A Tab press before the card jumps to it (graft, §6.1); on the card Tab
 * flips the table in and out, as it does in play. A click on a tab opens that tab, and jumps to the
 * card if it was not up yet.
 */
export function resultInput(v: ResultView, input: ResultInput, stage: EndedStage | null): ResultView {
  if (input.kind === "tabClick") return { skipped: true, tab: input.tab };
  if (resultStage(stage, v.skipped) !== "C") return { ...v, skipped: true };
  return { ...v, tab: v.tab === "table" ? "summary" : "table" };
}

/** How long each stage is on screen, from `MATCH.endedMs` and the stage lengths (§6.2). */
export const STAGE_SECONDS = {
  verdict: 3,
  cardRound: (MATCH.endedMs - 6_000) / 1000,
  cardContinuous: (MATCH.endedMs - 3_000) / 1000,
} as const;

/** Ended → Waiting: the card fades out over this long, mounted with its listeners off (§6.1). */
export const RESULT_EXIT_MS = 400;

/** The one reward worth a headline, or null: a haircut beats a badge beats a level. */
export function topReward(r: MatchReward, names: { badge: (id: string) => string | undefined; haircut: (id: string) => string | undefined }): string | null {
  const cut = r.haircuts.map(names.haircut).find(Boolean);
  if (cut) return `Nowa fryzura: ${cut}`;
  const badge = r.earned.map(names.badge).find(Boolean);
  if (badge) return `Odznaka: ${badge}`;
  if (r.levelsGained > 0) return `Awans na poziom ${r.after.level}`;
  return null;
}

/** The shave count a row carries (the scoreboard's ✂ column). */
export const shavesOf = (r: ScoreRow): number => parseHaircut(r.haircut).shaves;

// ---------------------------------------------------------------- the Tab board's round history

/** The four reason icons of the history strip (§5.2 #52): ✹ detonation, ✂ defuse, ☠ elimination, ⏱ time. */
export type HistoryKind = "detonation" | "defuse" | "elimination" | "time";
const HISTORY_KIND: Record<string, HistoryKind> = {
  "BOMB DETONATED": "detonation", "BOMB DEFUSED": "defuse",
  "DEFENDERS ELIMINATED": "elimination", "ATTACKERS ELIMINATED": "elimination", "ELIMINATED": "elimination", "TRADE": "elimination", "ALL SHAVED": "elimination",
  "SITE SECURED": "time", "TIME · EVEN": "time", "TIME · MORE HEALTH": "time", "SURVIVORS HELD": "time",
};

/** One slot of the strip: a round that was played and SEEN (winner, reason), or an empty one. */
export interface HistorySlot {
  n: number;
  /** Who took it; null when this client did not see it end (it joined later) or it is still to come. */
  winner: Team | -1 | null;
  kind: HistoryKind | null;
  reason: string;
  /** The round being played now. */
  now: boolean;
  /** The sides swap after this round: a gap in the strip. */
  gapAfter: boolean;
}

/**
 * The history strip of a round mode: one slot per round the match can run to, filled only from
 * the rounds this client observed (`hud.roundHistory`) — a round before I joined is an empty slot,
 * never a guess (Principle 13). Null where there is no strip: continuous modes, and the tournament,
 * whose rounds belong to one pair at a time (the bracket is its history).
 */
export function historySlots(mode: GameMode, history: readonly { round: number; winner: Team | -1; reason: string }[], current: number): HistorySlot[] | null {
  const total = mode === "bomb" ? BOMB.maxRounds : mode === "duel" ? 2 * DUEL.wins - 1 : mode === "ostrzyzeni" ? OSTRZYZENI.rounds : 0;
  if (!total) return null;
  const seen = new Map(history.map((r) => [r.round, r]));
  return Array.from({ length: total }, (_, i): HistorySlot => {
    const n = i + 1;
    const r = seen.get(n);
    const gapAfter = n < total && (mode === "bomb" ? n === BOMB.halfRounds : mode === "duel" ? n % DUEL.halfRounds === 0 : false);
    return { n, winner: r ? r.winner : null, kind: r ? HISTORY_KIND[r.reason] ?? "elimination" : null, reason: r?.reason ?? "", now: !r && n === current, gapAfter };
  });
}
