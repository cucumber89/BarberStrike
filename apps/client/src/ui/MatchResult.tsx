import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BADGES, HAIRCUTS, parseBracket, worstHaircut, type GameMode } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { CRATE_CHALLENGES, type MatchReward, type Profile } from "../game/progression/profile";
import { Razor, Scoreboard } from "./Scoreboard";
import { BracketPanel } from "./Bracket";
import { derivePhase, endedStage } from "./hud/phase";
import {
  RESULT_VIEW0, matchOutcome, resultInput, resultStage, sideNames, stageC, topReward, verdict,
  type PodiumStep, type ResultCtx, type ResultInput, type ResultTab, type ResultView,
} from "./resultText";

/**
 * The end of the match in three stages (docs/UI_U_SPEC.md P6, §6.1–6.2), the way CS2 and Call of
 * Duty stage it:
 *   A — the final round (round modes, 0–3 s): P5's banner holds the screen; this layer is mounted
 *       at opacity 0 (e2e reads `summary` from the first frame of Ended);
 *   B — the verdict (3 s): the screen dims and one word lands in the result's colour, with the
 *       score and the round or rule that decided it in three words;
 *   C — the card: the title moves up into it (FLIP), then the podium, my three numbers, the XP,
 *       the match award, the details behind one button, and the real time to the warm-up.
 * Tab, or a click on a tab, skips straight to the card (graft). Stages hide by OPACITY only (§4.5):
 * Playwright counts opacity 0 as visible, the gallery does not, and `summary` must be visible to
 * the first from t = 0 of Ended.
 *
 * The footer says what the server really does next: it restarts the match by itself into the
 * warm-up. There is no rematch button, because there is no rematch request; there is LEAVE.
 */
interface Props { h: HudState; now: number; onLeave: () => void }

/**
 * Set by `ResultLayer` while the card fades out on Ended → Waiting (400 ms): the card is still
 * drawn, but it answers no key and no click. A context rather than a prop, so the standalone
 * signature `MatchResult({h, now, onLeave})` (§7.0, `uiFit.tsx`) stays as it is.
 */
export const ResultClosing = createContext(false);

export function MatchResult({ h, now, onLeave }: Props) {
  void now; // the HUD clock: the stages run on the server's (`endedStage`)
  const closing = useContext(ResultClosing);
  const [view, setView] = useState<ResultView>(RESULT_VIEW0);
  const clockStage = endedStage(derivePhase(h), h.serverNow);
  const stage = resultStage(clockStage, view.skipped);
  const ctx: ResultCtx = h;
  const outcome = matchOutcome(ctx);
  const v = verdict(ctx);
  const c = stageC(ctx, h.reward, h.phaseEndsAt - h.serverNow);
  // The footer's clock, as `warmupLine` words it (`c.foot`): the seconds to the server's warm-up.
  const secs = Math.max(0, Math.ceil((h.phaseEndsAt - h.serverNow) / 1000));
  const tab: ResultTab = view.tab === "bracket" && !h.bracket ? "summary" : view.tab;

  const clockRef = useRef(clockStage);
  clockRef.current = clockStage;
  const act = (input: ResultInput) => setView((cur) => resultInput(cur, input, clockRef.current));

  useEffect(() => {
    if (closing) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Tab" && !e.repeat) { e.preventDefault(); act({ kind: "tabKey" }); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [closing]);

  // B → C: the verdict's word moves up and shrinks into the card's title (t5 → t4, 320 ms). The
  // title is measured where it lands and played back from where the verdict stood — a FLIP, so it
  // holds at every screen size. Nothing moves under reduced motion (§3.8).
  const titleRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  const lastStage = useRef(stage);
  useLayoutEffect(() => {
    const prev = lastStage.current;
    lastStage.current = stage;
    if (prev !== "B" || stage !== "C") return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = titleRef.current, from = verdictRef.current?.getBoundingClientRect(), to = el?.getBoundingClientRect();
    if (!el || !from || !to || !to.height || typeof el.animate !== "function") return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${from.height / to.height})` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [stage]);

  const tabBtn = (id: ResultTab, word: string, testid: string) => (
    <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => act({ kind: "tabClick", tab: id })} data-testid={testid}>{word}</button>
  );

  return (
    <div className={`result o-${outcome}${closing ? " closing" : ""}`} data-zone="result" data-testid="result" data-outcome={outcome} data-stage={stage}>
      <div className="result-dim" aria-hidden="true" />

      <div className="result-verdict" aria-hidden={stage !== "B" || undefined}>
        <div className="result-verdict-title" ref={verdictRef}>{v.title}</div>
        {v.score && <div className="result-verdict-score"><ScoreText h={h} text={v.score} /></div>}
        <div className="result-verdict-why" data-testid="result-verdict-why">{v.why}</div>
      </div>

      <div className="result-card" role="dialog" aria-label="Wynik meczu" aria-hidden={stage !== "C" || undefined}>
        <div className="result-top">
          <div className="result-title" data-testid="result-title" ref={titleRef}>{c.title}</div>
          {c.score !== null
            ? <div className="result-score" data-testid="result-score"><ScoreText h={h} text={c.score} /></div>
            : <div className="result-score is-podium" data-testid="result-score"><Podium steps={c.podium} /></div>}
          {c.placement && <div className="result-placement" data-testid="placement">{c.placement}</div>}
          <div className="result-why" data-testid="result-why">{c.why}</div>
        </div>

        <div className="result-tabs" role="tablist">
          {tabBtn("summary", c.tabs[0], "result-tab-summary")}
          {tabBtn("table", c.tabs[1], "result-tab-table")}
          {!!h.bracket && tabBtn("bracket", c.tabs[2], "result-tab-bracket")}
        </div>

        <div className="result-body" data-testid="result-body">
          {tab === "bracket" ? (
            <div className="result-bracket"><BracketPanel bracket={h.bracket} compact /></div>
          ) : tab === "table" ? (
            <Scoreboard rows={h.players} myId={h.myId} myTeam={h.myTeam} mode={h.mode as GameMode} bracket={h.bracket} />
          ) : (
            <div className={`result-summary${h.reward ? "" : " no-xp"}`}>
              {c.score !== null && <Podium steps={c.podium} />}
              {c.stats.length > 0 && (
                <div className="result-stats" data-testid="result-stats">
                  {c.stats.map((s) => <div className="result-stat" key={s.id} data-stat={s.id}><b>{s.value}</b><span>{s.label}</span></div>)}
                </div>
              )}
              {h.reward ? <Summary reward={h.reward} profile={h.profile} levelUp={c.levelUp} details={c.details} />
                : c.xp ? <p className="result-note">{c.xp}</p> : null}
              {/* Drop E: the match award. It names somebody ELSE as often as it names you, which is
                  the point — it is the thing the table talks about afterwards, not a reward. */}
              <WorstHaircut h={h} />
            </div>
          )}
        </div>

        <div className="result-foot" data-testid="result-foot">
          <span className="result-next" data-testid="result-countdown">ROZGRZEWKA ZA <b>{secs}s</b></span>
          <button className="result-leave" onClick={onLeave} data-testid="result-leave">{c.leave}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The score line with each side's name in its colour; the text stays exactly `scoreLine`'s. A
 * tournament's sides are nicknames, which are never set in the display face (Bebas has no lower
 * case, so „Kowal” would read KOWAL): they get the UI face, like the verdict's „★ nick”.
 */
function ScoreText({ h, text }: { h: HudState; text: string }) {
  if (text.startsWith("★ ")) return <><i className="podium-star" aria-hidden="true">★</i> <span className="nick">{text.slice(2)}</span></>;
  const nicks = h.mode === "turniej";
  const names = nicks ? finalNames(h.bracket) : sideNames(h.mode as GameMode);
  const m = names && text.startsWith(`${names[0]} `) && text.endsWith(` ${names[1]}`) ? text.slice(names[0].length, text.length - names[1].length) : null;
  if (!names || m === null) return <>{text}</>;
  const cls = nicks ? " nick" : "";
  return <><span className={`t0${cls}`}>{names[0]}</span>{m}<span className={`t1${cls}`}>{names[1]}</span></>;
}
const finalNames = (bracket: string): readonly [string, string] | null => {
  const view = parseBracket(bracket);
  const last = view?.matches[view.matches.length - 1];
  return last && last.a && last.b ? [last.a, last.b] : null;
};

/**
 * The top three, #1 in the middle and raised, with its star — the nick in its own case and the
 * number the mode ranks by (points, kills, the rung, the final's rounds), each step standing on
 * its side's colour in a team mode. My own step is marked.
 */
function Podium({ steps, className = "" }: { steps: readonly PodiumStep[]; className?: string }) {
  if (!steps.length) return null;
  return (
    <ol className={`podium ${className}`.trim()} data-testid="podium" aria-label="Podium">
      {steps.map((s) => (
        <li key={s.id} className={`podium-step r${s.rank}${s.team === null ? "" : ` t${s.team}`}${s.me ? " me" : ""}`} aria-label={`Miejsce ${s.rank}`}>
          <span className="podium-name">{s.rank === 1 && <i className="podium-star" aria-hidden="true">★</i>}{s.name}</span>
          <b className="podium-value">{s.value}</b>
        </li>
      ))}
    </ol>
  );
}

function WorstHaircut({ h }: { h: HudState }) {
  const worst = worstHaircut(h.players);
  if (!worst) return null;
  return (
    <div className="summary-award" data-testid="summary-worst-haircut" title={worst.look.name}>
      <Razor className="award-icon" />
      <b>NAJGORSZA FRYZURA:</b> <span className="award-nick">{worst.name}</span> <span className="award-n">×{worst.shaves}</span>
    </div>
  );
}

/**
 * What the match paid: „+790 XP · POZIOM 4” with the bar, AWANS when it moved you up; the itemised
 * lines, the headline reward, the badges and the next goal behind SZCZEGÓŁY. A bare "+1 400" tells
 * a player nothing; "8 zabójstw, 3 w głowę, wygrana" tells them what the game rewards — one click
 * away, not in the three seconds a card is read in.
 */
function Summary({ reward, profile, levelUp, details }: { reward: MatchReward; profile: Profile; levelUp: string | null; details: string | null }) {
  const { after } = reward;
  const pct = Math.max(0, Math.min(100, Math.round((after.into / Math.max(1, after.need)) * 100)));
  const badges = reward.earned.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean) as { id: string; name: string; blurb: string }[];
  const cuts = reward.haircuts.map((id) => HAIRCUTS.find((c) => c.id === id)).filter(Boolean) as { id: string; name: string }[];
  const headline = topReward(reward, { badge: (id) => BADGES.find((b) => b.id === id)?.name, haircut: (id) => HAIRCUTS.find((c) => c.id === id)?.name });
  const [open, setOpen] = useState(false);
  return (
    <div className="summary" data-testid="summary">
      <div className="summary-level">
        <b className="summary-total" data-testid="summary-total">+{reward.total} XP</b>
        <i className="summary-sep" aria-hidden="true">·</i>
        <span className="summary-lvl">POZIOM <b data-testid="summary-level">{after.level}</b></span>
        {levelUp && <span className="summary-up" data-testid="summary-levelup">{levelUp}</span>}
        {details && (
          <button className="summary-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="summary-toggle">
            {details}<i aria-hidden="true">{open ? "▴" : "▾"}</i>
          </button>
        )}
      </div>
      <div className="summary-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${after.into} / ${after.need} XP do następnego poziomu`}>
        <div className="summary-bar-fill" style={{ "--v": pct / 100 } as React.CSSProperties} />
      </div>
      {open && (
        <div className="summary-detail" data-testid="summary-detail">
          <div className="summary-lines">
            {headline && <div className="summary-headline" data-testid="summary-headline">{headline}</div>}
            <div className="summary-line"><span>{reward.title}</span><b>{after.into} / {after.need} XP</b></div>
            {reward.lines.map((l) => (
              <div className="summary-line" key={l.label}><span>{l.label}</span><b>+{l.xp}</b></div>
            ))}
            <div className="summary-line total"><span>RAZEM</span><b>+{reward.total} XP</b></div>
          </div>
          <div className="summary-side">
            <NextGoal profile={profile} />
            {(badges.length > 0 || cuts.length > 0) && (
              <div className="summary-badges" data-testid="summary-badges">
                {badges.map((b) => <div className="summary-badge" key={b.id}><b>{b.name}</b><span>{b.blurb}</span></div>)}
                {cuts.map((c) => <div className="summary-badge cut" key={c.id} data-testid="summary-haircut"><b>{c.name}</b><span>Nowa fryzura</span></div>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The one nearest cosmetic goal: the daily crate challenge closest to done, with its progress.
 * A player who just read their XP should also see the next reason to press play — one, not a
 * list, and only a real one: a challenge already claimed today is not a goal.
 */
export function nextGoal(profile: Profile): { label: string; have: number; need: number } | null {
  let best: { label: string; have: number; need: number } | null = null;
  for (const t of CRATE_CHALLENGES) {
    if (profile.challengeClaims.includes(t.id)) continue;
    const have = Math.min(t.target, Math.max(0, profile.life[t.stat] - profile.challengeBase[t.stat]));
    const left = t.target - have;
    if (!best || left < best.need - best.have) best = { label: t.label, have, need: t.target };
  }
  return best;
}

function NextGoal({ profile }: { profile: Profile }) {
  const g = nextGoal(profile);
  if (!g) return null;
  return (
    <div className="result-goal" data-testid="result-goal">
      <span className="result-goal-label">NAJBLIŻSZY CEL · SKRZYNKA</span>
      <span className="result-goal-text">{g.label} <b>{g.have} / {g.need}</b></span>
      <div className="result-goal-bar"><i style={{ "--v": g.have / g.need } as React.CSSProperties} /></div>
    </div>
  );
}
