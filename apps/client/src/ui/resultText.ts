import { BOMB, DUEL, GUN_GAME, MODES, OSTRZYZENI, parseHaircut, scoreLimitFor, type GameMode, type Team } from "@frankibarber/shared";
import type { MatchReward } from "../game/progression/profile";
import type { ScoreRow } from "../game/store";
import { sideNames } from "./hud/roundText";

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
}

/** Win / loss / draw from the local player's seat; "over" for somebody with no row (a watcher). */
export function matchOutcome(c: ResultCtx): Outcome {
  const me = c.players.find((p) => p.id === c.myId);
  if (!me) return "over";
  if (MODES[c.mode].winner === "team") return c.winner === -1 ? "draw" : c.winner === c.myTeam ? "win" : "loss";
  return c.winnerId === "" ? "draw" : c.winnerId === c.myId ? "win" : "loss";
}

/** The score line under the title: sides, or the named winner, or both (Ostrzyżeni). */
export function scoreLine(c: ResultCtx): string {
  const [a, b] = sideNames(c.mode);
  if (MODES[c.mode].winner === "team") return `${a} ${c.scoreA} — ${c.scoreB} ${b}`;
  const named = c.winnerName ? `${c.winnerName} bierze tę noc` : "Nikt nie bierze tej nocy";
  return c.mode === "ostrzyzeni" ? `${a} ${c.scoreA} — ${c.scoreB} ${b} · ${named}` : named;
}

const unitOf: Partial<Record<GameMode, string>> = { tdm: "zabójstw", dom: "punktów", boys: "punktów", bomb: "wygranych rund", duel: "wygranych rund" };

/** One sentence on how the match was decided. */
export function matchWhy(c: ResultCtx): string {
  const def = MODES[c.mode];
  // TDM's limit is the room's (`scoreLimitFor`), not the mode's: the result screen has to explain
  // the match that was actually played.
  const limit = scoreLimitFor(c.mode, c.players.length);
  const top = Math.max(c.scoreA, c.scoreB);
  const connected = (t: Team) => c.players.some((p) => p.connected && p.team === t);
  if (c.mode === "gungame") {
    const lead = c.players.find((p) => p.id === c.winnerId);
    if (lead && lead.score >= GUN_GAME.ladder.length) return `${lead.name} przeszedł całą drabinkę ${GUN_GAME.ladder.length} broni jako pierwszy`;
    return c.winnerId ? `Czas minął — ${c.winnerName} jest najwyżej na drabince` : "Czas minął przy równej drabince";
  }
  if (c.mode === "ostrzyzeni") {
    const rounds = `Po ${OSTRZYZENI.rounds} rundach: ocaleni ${c.scoreA}, ostrzyżeni ${c.scoreB}`;
    return c.winnerName ? `${rounds} · najwięcej punktów ma ${c.winnerName}` : `${rounds} · równa liczba punktów`;
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
  if (top >= limit) return c.mode === "bomb" ? `Pierwsza drużyna z ${BOMB.wins} wygranymi rundami` : c.mode === "duel" ? `Pierwszy do ${DUEL.wins} wygranych rund` : `Pierwsza drużyna do ${limit} ${unitOf[c.mode] ?? "punktów"}`;
  if (!connected(0) || !connected(1)) return "Druga strona opuściła mecz";
  if (c.scoreA === c.scoreB) return "Czas minął przy równym wyniku";
  return `Czas minął — wyższy wynik ${unitOf[c.mode] ? "w liczbie " + unitOf[c.mode] : ""} wygrywa`.replace(/\s+/g, " ");
}

export interface KeyStat { label: string; value: string }

/** The three numbers that matter in this mode, for the local player's row. */
export function keyStats(mode: GameMode, row: ScoreRow | undefined): KeyStat[] {
  if (!row) return [];
  const k = { label: "Zabójstwa", value: String(row.kills) };
  const d = { label: "Zgony", value: String(row.deaths) };
  const a = { label: "Asysty", value: String(row.assists) };
  const pts = { label: "Punkty", value: String(row.score) };
  switch (mode) {
    case "dom": case "boys": return [pts, k, a];
    case "bomb": return [k, a, d];
    case "gungame": return [{ label: "Szczebel", value: `${Math.min(GUN_GAME.ladder.length, row.score)} / ${GUN_GAME.ladder.length}` }, k, d];
    case "ostrzyzeni": return [pts, { label: "Razy ogolony", value: String(parseHaircut(row.haircut).shaves) }, k];
    default: return [k, d, a];
  }
}

/** The one reward worth a headline, or null: a haircut beats a badge beats a level. */
export function topReward(r: MatchReward, names: { badge: (id: string) => string | undefined; haircut: (id: string) => string | undefined }): string | null {
  const cut = r.haircuts.map(names.haircut).find(Boolean);
  if (cut) return `Nowa fryzura: ${cut}`;
  const badge = r.earned.map(names.badge).find(Boolean);
  if (badge) return `Odznaka: ${badge}`;
  if (r.levelsGained > 0) return `Awans na poziom ${r.after.level}`;
  return null;
}
