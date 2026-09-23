import { parseBracket, roundName, type BracketView } from "@frankibarber/shared";

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

/** One line for the HUD while a pair is being played: which round it is, and who is on. */
export function bracketLine(bracket: string): string {
  const view = parseBracket(bracket);
  if (!view) return "";
  const m = view.matches[view.at];
  if (!m) return "";
  // Rounds still to play, counting this one: a four-bracket's first pair has two (a semi-final and
  // the final), so it reads PÓŁFINAŁ — which is how `roundName` names them, from the end.
  return `${roundName(totalRounds(view) - m.round)} · ${m.a || "—"} vs ${m.b || "—"}`;
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
