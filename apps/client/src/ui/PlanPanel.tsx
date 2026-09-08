import { useEffect, useState } from "react";
import { MatchPhase, TEAM_NAMES, planById } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";

/**
 * THE LIVING ARENA, on screen.
 *
 * Two jobs, and the second matters as much as the first:
 *  - the attacking team picks a plan during the buy window (click, or press F1 / F2);
 *  - the DEFENCE is shown the same choice, live, with the running tally. A map change the other
 *    side cannot see coming is a random event, and the brief rules those out. Being able to watch
 *    the vote is what turns it into information both teams play around.
 *
 * Every option states its cost next to its gain, because a choice without a cost is not a choice.
 */
export function PlanPanel({ h, onVote }: { h: HudState; onVote: (id: number) => void }) {
  const p = h.plan;
  const [voted, setVoted] = useState<number | null>(null);
  const voting = !!p && p.options.length > 0 && p.chosen === 0
    && h.phase === MatchPhase.Prep && h.serverNow < p.appliesAt;
  const mine = !!p && h.myTeam === p.votingTeam;

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
      <div className="plan-active" data-testid="plan-active">
        <span className="plan-tag">IN FORCE</span>
        <span className="plan-active-name">{active.name}</span>
      </div>
    );
  }

  const left = Math.max(0, Math.ceil((p.appliesAt - h.serverNow) / 1000));
  return (
    <div className="plan" data-testid="plan-vote">
      <div className="plan-head">
        <span className="plan-title">TACTICAL PLAN · ROUND {p.round}</span>
        <span className="plan-sub">
          {mine ? `Your call, ${TEAM_NAMES[p.votingTeam]} — ${left}s` : `${TEAM_NAMES[p.votingTeam]} are choosing — ${left}s`}
        </span>
      </div>
      <div className="plan-options">
        {p.options.map((id, i) => {
          const plan = planById(id);
          if (!plan) return null;
          return (
            <button
              key={id}
              className={`plan-option ${voted === id ? "chosen" : ""}`}
              disabled={!mine}
              data-testid={`plan-option-${id}`}
              onClick={() => { uiSound("click"); setVoted(id); onVote(id); }}
            >
              <span className="plan-key">F{i + 1}</span>
              <span className="plan-name">{plan.name}</span>
              <span className="plan-gain">{plan.gain}</span>
              <span className="plan-cost">Costs you: {plan.cost}</span>
              <span className="plan-votes">{p.tally[i] ?? 0} {(p.tally[i] ?? 0) === 1 ? "vote" : "votes"}</span>
            </button>
          );
        })}
      </div>
      <p className="plan-foot">
        {mine
          ? "The change lasts this round only, and both teams can see what you pick."
          : "You can see exactly what they are choosing. Plan for it."}
      </p>
    </div>
  );
}
