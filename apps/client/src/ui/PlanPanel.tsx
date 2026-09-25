import { Fragment, useEffect, useState } from "react";
import { MatchPhase, planById } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";
import { chipName, planCard, polishWrap } from "./hud/walletToasts";

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
 *
 * What the card says is decided by `planCard` (`hud/walletToasts.ts`, pure, tested over every
 * offer the rounds make): it holds the freeze card's 24 words (§5.1) for every pair of plans, and
 * when two long names and a long gain and cost would not fit, the OTHER option's name gives way to
 * its two-word short form first. This only draws it; every row's full name is its accessible name.
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

  const card = planCard({
    options: p.options, tally: p.tally, mine, voted, compact,
    secs: Math.ceil((p.appliesAt - h.serverNow) / 1000),
  });
  return (
    <div className={`plan${mine ? " mine" : ""}${compact ? " compact" : ""}`} data-zone="plan" data-testid="plan-vote">
      <div className="plan-head">
        <span className="plan-title">{card.title}</span> · <span className="plan-secs">{card.secs}</span>
      </div>
      {card.rows.map((row) => (
        <Fragment key={row.id}>
          <button
            className={`plan-option${row.chosen ? " chosen" : ""}${row.leading ? " leading" : ""}`}
            disabled={!mine}
            data-testid={`plan-option-${row.id}`}
            aria-label={`${row.key ? `${row.key} ` : ""}${row.full} · ${row.votes}`}
            title={row.full}
            onClick={() => { uiSound("click"); setVoted(row.id); onVote(row.id); }}
          >
            {row.key && <><kbd className="plan-key">{row.key}</kbd> </>}
            {/* The count rides on the name's last word (no-break spaces), as „OTWÓRZ ROLETĘ · 2”. */}
            <span className="plan-name">{polishWrap(row.name)}<span className="plan-votes">{`\u00a0·\u00a0${row.votes}`}</span></span>
          </button>
          {row.detail && (
            <div className="plan-detail">
              <p className="plan-gain">{`+ ${polishWrap(row.detail.gain)}`}</p>
              <p className="plan-cost">{`− ${polishWrap(row.detail.cost)}`}</p>
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

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
