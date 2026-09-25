import { DUEL, parseBracket, roundName, type BracketView } from "@frankibarber/shared";
import { roundReasonShort } from "./hud/roundText";

/**
 * The tournament bracket (drop T), drawn from the one string the server replicates.
 *
 * It is a whole column per round, left to right, the way a knockout is read on paper: four pairs,
 * then two, then the final. The pair being played is the one the room is on (`at`), and it is the
 * only one that pulses — everything else is either a result or a slot nobody has reached yet.
 *
 * There is no state here and nothing is fetched: the string is the state, and a client that joins
 * in the middle of the third pair draws the same bracket as everybody else on its first snapshot.
 */
export function BracketPanel({ bracket, compact = false }: { bracket: string; compact?: boolean }) {
  const view = parseBracket(bracket);
  if (!view) return null;
  const rounds = groupRounds(view);
  return (
    <div className={`bracket ${compact ? "compact" : ""}`} data-testid="bracket">
      {rounds.map((matches, round) => (
        <div className="bracket-round" key={round}>
          <h4>{roundName(rounds.length - round)}</h4>
          {matches.map((m) => {
            const playing = m.index === view.at;
            const done = m.winner !== "";
            return (
              <div
                className={`bracket-pair ${playing ? "now" : ""} ${done ? "done" : ""}`}
                key={m.index} data-testid={playing ? "bracket-now" : undefined}
              >
                <span className={m.winner === "a" ? "won" : m.winner === "b" ? "lost" : ""}>
                  <b>{m.a || "—"}</b>{done || playing ? <i>{m.scoreA}</i> : null}
                </span>
                <span className={m.winner === "b" ? "won" : m.winner === "a" ? "lost" : ""}>
                  <b>{m.b || "—"}</b>{done || playing ? <i>{m.scoreB}</i> : null}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Where YOU stand in the draw, which is what the screen owes somebody who is not alive.
 *
 * A tournament leaves six of eight people dead for whole minutes at a time, and the death card
 * would otherwise count down a respawn that is never coming. The bracket already says everything
 * needed to tell the three cases apart, so nothing new is sent to find out.
 */
export function standing(bracket: string, name: string): "playing" | "waiting" | "out" | "" {
  const view = parseBracket(bracket);
  if (!view || !name) return "";
  const cur = view.matches[view.at];
  if (cur && (cur.a === name || cur.b === name)) return "playing";
  // Lost a pair that has been decided: out, and watching the rest.
  const lost = view.matches.some((m) => m.winner && ((m.a === name && m.winner === "b") || (m.b === name && m.winner === "a")));
  if (lost) return "out";
  // Still in the draw: either drawn into a pair that has not come up, or through and waiting to be
  // placed against whoever wins the pair on the board.
  const entered = view.matches.some((m) => m.a === name || m.b === name);
  return entered || view.at < view.matches.length ? "waiting" : "out";
}

/**
 * The two names playing right now, in side order — `a` is team 0, which is how the room seats a
 * pair. The scoreboard's two sides are two PEOPLE in a tournament, and reading FADE 3 — 6 TAPER
 * off a bracket of eight tells you nothing about which of them you are watching.
 */
export function pairNames(bracket: string): readonly [string, string] | null {
  const view = parseBracket(bracket);
  const m = view?.matches[view.at];
  return m && m.a && m.b ? [m.a, m.b] : null;
}

/** One line for the HUD while a pair is being played: which round it is, and who is on. */
export function bracketLine(bracket: string): string {
  const view = parseBracket(bracket);
  if (!view) return "";
  const m = view.matches[view.at];
  if (!m) return "";
  return `${stageOf(view, m.round)} · ${m.a || "—"} vs ${m.b || "—"}`;
}

/**
 * Drop U (P2): the pair the strip's two scores belong to. While a pair is on the board it is that
 * pair (`pairNames`). Once the final has been played (`at` past the last match) the room still holds
 * the final's score for the match end's stage A, so the strip names the final's two players beside
 * it, never the FADE / TAPER fallback (Principle 9, §5.2 row 28). null when neither is known: no
 * bracket yet, or a pair on the board with an empty slot.
 */
export function stripPair(bracket: string): readonly [string, string] | null {
  const now = pairNames(bracket);
  if (now) return now;
  const view = parseBracket(bracket);
  if (!view || view.at < view.matches.length) return null;
  const last = lastDecided(view, view.matches.length);
  return last ? [last.a, last.b] : null;
}

/** The last REAL decided pair before index `before` (a pair of two names with a winner); byes are walked past. */
function lastDecided(view: BracketView, before: number): BracketView["matches"][number] | null {
  for (let i = Math.min(before, view.matches.length) - 1; i >= 0; i--) {
    const m = view.matches[i];
    if (m.a && m.b && m.winner) return m;
  }
  return null;
}

/**
 * Drop U: the stage of the pair on the board and nothing else — „PÓŁFINAŁ”, „FINAŁ” (in a draw of
 * eight also „ĆWIERĆFINAŁ”). The strip's second row carries it beside the round number, and the pair
 * card's title names the NEXT pair's stage with it; the two names are on the strip's sides already.
 * "" when nobody is on (no bracket, or the final has been played).
 */
export function bracketStage(bracket: string): string {
  const view = parseBracket(bracket);
  const m = view?.matches[view.at];
  return view && m ? stageOf(view, m.round) : "";
}

/**
 * Rounds still to play, counting this one: a four-bracket's first pair has two (a semi-final and
 * the final), so it reads PÓŁFINAŁ — which is how `roundName` names them, from the end.
 */
const stageOf = (view: BracketView, round: number): string => roundName(totalRounds(view) - round);

/** The pair card between two pairs (§5.2 rows 30 and 31), every line of it as the player reads it. */
export interface PairCard {
  /** „ZDZICHU PRZECHODZI DALEJ”, or after a walkover „WALKOWER · ZDZICHU DALEJ”. The nick keeps its case. */
  eyebrow: string;
  /** „6 : 4 · Przeciwnik wyeliminowany” — the winner's score first and the last round's short reason; null after a walkover. */
  verdict: string | null;
  /** „NASTĘPNA PARA · FINAŁ”. */
  title: string;
  /** „Kowal vs ZDZICHU”: the next pair, `a` (team 0) first. */
  next: string;
  /** Where I stand: „GRASZ TERAZ”, „CZEKASZ NA SWOJĄ PARĘ”, „ODPADŁEŚ Z TURNIEJU”, or "" when the bracket does not know me. */
  standing: string;
  /** Which of the three it is, for its colour. */
  standingKind: ReturnType<typeof standing>;
  walkover: boolean;
}

const STANDING_TEXT: Record<ReturnType<typeof standing>, string> = {
  playing: "GRASZ TERAZ",
  waiting: "CZEKASZ NA SWOJĄ PARĘ",
  out: "ODPADŁEŚ Z TURNIEJU",
  "": "",
};

/**
 * Drop U (P2): the card between two pairs — who went through and how, and who is up next. Pure: the
 * bracket string, my own name and the last round's reason (`bomb.result`) say everything.
 *
 * The decided pair is the last REAL pair before `at` (`at − 1`, unless byes were walked past after
 * it). A pair decided below `DUEL.wins` with no round reason on the board is a WALKOVER: somebody
 * left (`withdraw` reports the scores as they stood, and the freeze had already cleared the reason),
 * so the card says so and prints no score. A pair capped by the match clock below `DUEL.wins` still
 * has its last round's reason, and reads as a normal result.
 */
export function pairCard(bracket: string, myName: string, roundResult: string): PairCard | null {
  const view = parseBracket(bracket);
  if (!view) return null;
  const done = lastDecided(view, view.at);
  if (!done) return null;
  const winner = done.winner === "a" ? done.a : done.b;
  const [won, lost] = done.winner === "a" ? [done.scoreA, done.scoreB] : [done.scoreB, done.scoreA];
  const walkover = Math.max(done.scoreA, done.scoreB) < DUEL.wins && roundResult === "";
  const reason = roundResult ? roundReasonShort(roundResult) : "";
  const next = view.matches[view.at];
  const where = standing(bracket, myName);
  return {
    eyebrow: walkover ? `WALKOWER · ${winner} DALEJ` : `${winner} PRZECHODZI DALEJ`,
    verdict: walkover ? null : `${won} : ${lost}${reason ? ` · ${reason}` : ""}`,
    title: next ? `NASTĘPNA PARA · ${stageOf(view, next.round)}` : "DRABINKA",
    next: next ? `${next.a || "—"} vs ${next.b || "—"}` : "",
    standing: STANDING_TEXT[where],
    standingKind: where,
    walkover,
  };
}

/** How many rounds this bracket has in total (a draw of four has two). */
const totalRounds = (view: BracketView): number => view.matches.reduce((n, m) => Math.max(n, m.round), 0) + 1;

/** The matches split into their rounds, each carrying its index so the current pair is findable. */
function groupRounds(view: BracketView): { index: number; a: string; b: string; scoreA: number; scoreB: number; winner: "a" | "b" | "" }[][] {
  const rounds: ReturnType<typeof groupRounds> = [];
  view.matches.forEach((m, index) => {
    (rounds[m.round] ??= []).push({ index, a: m.a, b: m.b, scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winner });
  });
  return rounds;
}
