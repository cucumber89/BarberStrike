import { Fragment, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
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
  const cardRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(cardRef);

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
    <div ref={cardRef} className={`plan${mine ? " mine" : ""}${compact ? " compact" : ""}`} data-zone="plan" data-testid="plan-vote">
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
/** §4.2: the full card's box is at most 200 px high. */
const FULL_MAX_PX = 200;
/** What the chat keeps under a full card: the §4.3 12 px, then 2 lines × 22 (§4.2's floor). */
const CHAT_KEEP_PX = 12 + 2 * 22;

/**
 * The card is compact at ≤ 600 px high (§4.2), and ALSO wherever its full box would leave the chat
 * less than two lines under it: between 601 and ~662 px high (a 1366×768 laptop's browser, say)
 * the column's radar is still 144 px, so a full card reaches within a line of the chat's bottom
 * (`--hud-chat-bottom`, 148 px up) and the chat had no line left. The test uses the card's own top
 * and the full box's cap — never the card's current height — so it cannot flip-flop between the
 * two forms. The top moves only with the column above (the radar, the wallet), which re-renders
 * this card with the HUD, and with the window.
 */
function useCompact(card: RefObject<HTMLElement | null>): boolean {
  const [short, setShort] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(COMPACT).matches);
  const [tight, setTight] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.(COMPACT);
    if (!mq) return;
    const sync = () => setShort(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const measure = () => {
    const el = card.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const chatBottom = window.innerHeight - (parseFloat(getComputedStyle(el).getPropertyValue("--hud-chat-bottom")) || 148);
    setTight(top > 0 && top + FULL_MAX_PX + CHAT_KEEP_PX > chatBottom);
  };
  const latest = useRef(measure);
  latest.current = measure;
  useLayoutEffect(measure);
  useEffect(() => {
    const onResize = () => latest.current();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return short || tight;
}
