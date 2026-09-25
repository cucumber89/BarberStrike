import { Fragment, useEffect, useState } from "react";
import { MatchPhase, planById, type PlanEvent } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";

/**
 * THE LIVING ARENA, on screen — the round's plan card, zone `plan` (drop U P3, docs/UI_U_SPEC.md
 * §7 P3 WORK 3), in the left column under the money.
 *
 * Two jobs, and the second matters as much as the first:
 *  - the attacking team picks a plan during the freeze (press F1 / F2, or click);
 *  - the DEFENCE is shown the same choice, live, with the running tally. A map change the other
 *    side cannot see coming is a random event, and the brief rules those out.
 *
 * Drop U made it a CS2 card in Polish and a third of its old size: a header with the seconds
 * („PLAN RUNDY · 12s”; the defence reads „ATAK WYBIERA PLAN · 12s”), one row per option
 * („[F1] OTWÓRZ ROLETĘ · 2”, keys for the voters only), and the gain and the cost — a choice
 * without a cost is not a choice — under ONE option: the one I voted for, else the one leading
 * (a tie goes to the lower id, as `tallyVotes` settles it); before any vote, under none. Once the
 * round runs, a chip says what is in force: „PLAN: OTWÓRZ ROLETĘ” (≤ 3 words, §5.1).
 */
export function PlanPanel({ h, onVote }: { h: HudState; onVote: (id: number) => void }) {
  const p = h.plan;
  const [voted, setVoted] = useState<number | null>(null);
  const voting = !!p && p.options.length > 0 && p.chosen === 0
    && h.phase === MatchPhase.Prep && h.serverNow < p.appliesAt;
  const mine = !!p && h.myTeam === p.votingTeam;
  const compact = useCompact();

  useEffect(() => { setVoted(null); }, [p?.round]);

  useEffect(() => {
    if (!voting || !mine || !p) return;
    const down = (e: KeyboardEvent) => {
      const i = e.code === "F1" ? 0 : e.code === "F2" ? 1 : -1;
      if (i < 0 || !p.options[i]) return;
      e.preventDefault();
      uiSound("click");
      setVoted(p.options[i]);
      onVote(p.options[i]);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [voting, mine, p, onVote]);

  if (!p || !p.options.length) return null;

  // Once the round is running, all that is left to say is which plan is in force.
  if (!voting) {
    const active = planById(h.planId);
    if (!active || h.phase !== MatchPhase.Playing) return null;
    return (
      <div className="plan-active" data-zone="plan" data-testid="plan-active" title={`PLAN: ${active.name}`}>
        <span className="plan-tag">PLAN:</span> <span className="plan-active-name">{chipName(active.name)}</span>
      </div>
    );
  }

  const left = Math.max(0, Math.ceil((p.appliesAt - h.serverNow) / 1000));
  const lead = leading(p);
  // Gain and cost under ONE option: mine, else the leader. Before anyone votes, none — the names
  // alone, until a key or a teammate picks one (the words stay within the freeze card's 24).
  const focus = voted ?? lead;
  return (
    <div className={`plan${mine ? " mine" : ""}${compact ? " compact" : ""}`} data-zone="plan" data-testid="plan-vote">
      <div className="plan-head">
        <span className="plan-title">{mine ? "PLAN RUNDY" : "ATAK WYBIERA PLAN"}</span> · <span className="plan-secs">{`${left}s`}</span>
      </div>
      {p.options.map((id, i) => {
        const plan = planById(id);
        if (!plan) return null;
        const n = p.tally[i] ?? 0;
        return (
          <Fragment key={id}>
            <button
              className={`plan-option${voted === id ? " chosen" : ""}${lead === id ? " leading" : ""}`}
              disabled={!mine}
              data-testid={`plan-option-${id}`}
              onClick={() => { uiSound("click"); setVoted(id); onVote(id); }}
            >
              {mine && <><kbd className="plan-key">{`F${i + 1}`}</kbd> </>}
              <span className="plan-name">{compact ? chipName(plan.name) : polishWrap(plan.name)}</span>
              <span className="plan-votes">{` · ${n}`}</span>
            </button>
            {focus === id && !compact && (
              <div className="plan-detail">
                <p className="plan-gain">{`+ ${polishWrap(plan.gain)}`}</p>
                <p className="plan-cost">{`− ${polishWrap(plan.cost)}`}</p>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/** The option ahead right now, as `tallyVotes` would settle it (a tie to the lower id); null with no votes. */
export function leading(p: Pick<PlanEvent, "options" | "tally">): number | null {
  let best: number | null = null, bestN = 0;
  p.options.forEach((id, i) => {
    const n = p.tally[i] ?? 0;
    if (n > bestN || (n === bestN && n > 0 && best !== null && id < best)) { best = id; bestN = n; }
  });
  return best;
}

/**
 * Polish typesetting: a one-letter word („W”, „a”, „i”, „z”) never ends a line — it is tied to the
 * next word with a no-break space, so „ZBURZ MUR W ZAUŁKU” wraps as „ZBURZ MUR / W ZAUŁKU”.
 */
export const polishWrap = (s: string): string => s.replace(/(^|\s)(\p{L})\s+/gu, "$1$2\u00a0");

/** §4.2: at 600 px high and less the card is its header and its option rows, ≤ 100 px. */
const COMPACT = "(max-height: 600px)";
function useCompact(): boolean {
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(COMPACT).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(COMPACT);
    if (!mq) return;
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return on;
}

/**
 * The short name: its first two words („ZBURZ MUR W ZAUŁKU” → „ZBURZ MUR”), so the live chip
 * „PLAN: …” stays within its 3 words (§5.1) for every plan, and a row of the card on a short screen
 * stays one line (§4.2: ≤ 100 px). The full name is the chip's `title`.
 */
export const chipName = (name: string): string => name.split(/\s+/).slice(0, 2).join(" ");
