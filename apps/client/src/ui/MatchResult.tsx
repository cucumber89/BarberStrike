import React, { useEffect, useState } from "react";
import { BADGES, HAIRCUTS, MODES, worstHaircut, type GameMode } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { CRATE_CHALLENGES, type MatchReward, type Profile } from "../game/progression/profile";
import { Razor, Scoreboard } from "./Scoreboard";
import { OUTCOME_TITLE, keyStats, matchOutcome, matchWhy, roundEnd, scoreLine, topReward } from "./resultText";

/**
 * The end of the match, in the order a player reads it: the verdict from their seat and the
 * score, one sentence on how it was decided, three numbers that matter in this mode, then the
 * XP with its bar and the one reward worth a headline. The itemised XP lines and the badges sit
 * under a disclosure, and the full table under its own tab, so neither can push the verdict or
 * the footer off a 720p screen — the old screen mounted all of it in one centred column and had
 * nowhere to go but off the bottom.
 *
 * The footer says what the server really does next: it restarts the match by itself. There is no
 * rematch button, because there is no rematch request; there is LEAVE, because that exists.
 */
interface Props { h: HudState; now: number; onLeave: () => void }

export function MatchResult({ h, now, onLeave }: Props) {
  const [tab, setTab] = useState<"summary" | "table">("summary");
  const outcome = matchOutcome(h);
  const me = h.players.find((p) => p.id === h.myId);
  const stats = keyStats(h.mode as GameMode, me);
  const worst = worstHaircut(h.players);
  const left = Math.max(0, Math.ceil((h.phaseEndsAt - h.serverNow) / 1000));

  // Tab flips the table in and out, the way it does in play; Escape does nothing here — the
  // pause card is not for a match that is over, and the browser has already released the mouse.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Tab" && !e.repeat) { e.preventDefault(); setTab((t) => (t === "table" ? "summary" : "table")); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  return (
    <div className="result" data-testid="result" data-outcome={outcome}>
      <div className="result-card" role="dialog" aria-label="Wynik meczu">
        <div className="result-top">
          <div className={`result-title ${outcome}`} data-testid="result-title">{OUTCOME_TITLE[outcome]}</div>
          <div className="result-score" data-testid="result-score">{scoreLine(h)}</div>
          <div className="result-why" data-testid="result-why">{matchWhy(h)}</div>
        </div>

        <div className="result-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "summary"} className={tab === "summary" ? "on" : ""} onClick={() => setTab("summary")} data-testid="result-tab-summary">PODSUMOWANIE</button>
          <button role="tab" aria-selected={tab === "table"} className={tab === "table" ? "on" : ""} onClick={() => setTab("table")} data-testid="result-tab-table">TABELA <kbd>TAB</kbd></button>
        </div>

        <div className="result-body" data-testid="result-body">
          {tab === "summary" ? (
            <>
              {stats.length > 0 && (
                <div className="result-stats" data-testid="result-stats">
                  {stats.map((s) => <div className="result-stat" key={s.label}><b>{s.value}</b><span>{s.label}</span></div>)}
                </div>
              )}
              {h.reward ? <Reward reward={h.reward} /> : outcome === "over" ? <p className="result-note">Oglądasz — bez nagród za ten mecz.</p> : null}
              {h.reward && <NextGoal profile={h.profile} />}
              {/* Drop E: the match award. It names somebody ELSE as often as it names you, which is the
                  point — it is the thing the table talks about afterwards, not a reward you collect. */}
              {worst && (
                <div className="summary-award" data-testid="summary-worst-haircut">
                  <Razor className="award-icon" />
                  <div>
                    <b>NAJGORSZA FRYZURA</b>
                    <span>{worst.name} — {worst.look.name}, ogolony {worst.shaves}×</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Scoreboard rows={h.players} myId={h.myId} mode={h.mode as GameMode} />
          )}
        </div>

        <div className="result-foot" data-testid="result-foot">
          <span className="result-next">{MODES[h.mode as GameMode].name} · następny mecz startuje sam za <b data-testid="result-countdown">{left} s</b></span>
          <button className="menu-btn" onClick={onLeave} data-testid="result-leave">WYJDŹ DO MENU</button>
        </div>
      </div>
    </div>
  );
}

/**
 * What the match paid: the total, the level bar, the one headline reward; the lines and every
 * badge under "szczegóły". A bare "+1 400" tells a player nothing; "8 zabójstw, 3 w głowę,
 * wygrana" tells them what the game rewards, which is the only job a cosmetic progression has.
 */
function Reward({ reward }: { reward: MatchReward }) {
  const { after, levelsGained } = reward;
  const pct = Math.max(0, Math.min(100, Math.round((after.into / Math.max(1, after.need)) * 100)));
  const badges = reward.earned.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean) as { id: string; name: string; blurb: string }[];
  const cuts = reward.haircuts.map((id) => HAIRCUTS.find((c) => c.id === id)).filter(Boolean) as { id: string; name: string }[];
  const headline = topReward(reward, { badge: (id) => BADGES.find((b) => b.id === id)?.name, haircut: (id) => HAIRCUTS.find((c) => c.id === id)?.name });
  const [open, setOpen] = useState(false);
  return (
    <div className="summary" data-testid="summary">
      <div className="summary-level">
        <div className="summary-rank">
          <span className="summary-lvl" data-testid="summary-level">{after.level}</span>
          <span className="summary-title">{reward.title}</span>
          <b className="summary-total" data-testid="summary-total">+{reward.total} XP</b>
          {levelsGained > 0 && <span className="summary-up" data-testid="summary-levelup">AWANS {levelsGained > 1 ? `×${levelsGained}` : ""}</span>}
        </div>
        <div className="summary-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="summary-bar-fill" style={{ "--v": pct / 100 } as React.CSSProperties} /></div>
        <div className="summary-xp">{after.into} / {after.need} XP do następnego poziomu</div>
        {headline && <div className="summary-headline" data-testid="summary-headline">{headline}</div>}
      </div>
      <button className="summary-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="summary-toggle">
        {open ? "UKRYJ SZCZEGÓŁY" : "SZCZEGÓŁY XP I ODZNAKI"}
      </button>
      {open && (
        <div className="summary-detail" data-testid="summary-detail">
          <div className="summary-lines">
            {reward.lines.map((l) => (
              <div className="summary-line" key={l.label}><span>{l.label}</span><b>+{l.xp}</b></div>
            ))}
            <div className="summary-line total"><span>RAZEM</span><b>+{reward.total} XP</b></div>
          </div>
          {(badges.length > 0 || cuts.length > 0) && (
            <div className="summary-badges" data-testid="summary-badges">
              {badges.map((b) => <div className="summary-badge" key={b.id}><b>{b.name}</b><span>{b.blurb}</span></div>)}
              {cuts.map((c) => <div className="summary-badge cut" key={c.id} data-testid="summary-haircut"><b>{c.name}</b><span>Nowa fryzura</span></div>)}
            </div>
          )}
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
      <span className="result-goal-label">NAJBLIŻSZY CEL · skrzynka</span>
      <span className="result-goal-text">{g.label} <b>{g.have} / {g.need}</b></span>
      <div className="result-goal-bar"><i style={{ "--v": g.have / g.need } as React.CSSProperties} /></div>
    </div>
  );
}

/**
 * Between rounds (Bomb, 1 v 1, Ostrzyżeni): who took the round, why, the score, the clock to the
 * next one. Shown only during the break that follows a round — `breakEndsAt` is the deadline of
 * the first Prep window after Playing, so the buy window that follows (a second Prep with a new
 * deadline) never shows a stale reason.
 */
export function RoundBreak({ h }: { h: HudState }) {
  // `roundResult` and not `bomb.result`: the bomb block is only mirrored in Bomb, so the 1 v 1 —
  // which runs on the same round machine — was passing "" here and the card NEVER appeared. Its
  // players were told who won a round nowhere at all.
  const end = roundEnd(h.mode as GameMode, h.roundResult, h.roundWinner, h.bomb ? (h.bomb.attackTeam as 0 | 1) : -1, h.myTeam);
  if (!end) return null;
  const [a, b] = h.mode === "ostrzyzeni" ? ["OCALENI", "OSTRZYŻENI"] : ["FADE", "TAPER"];
  const left = Math.max(0, Math.ceil((h.phaseEndsAt - h.serverNow) / 1000));
  // The 1 v 1 carries a loadout between rounds (CS's rule), and whether YOURS carried is decided
  // by whether you are standing here. That is worth one line: it is the difference between the
  // next round being a rifle round and a pistol round.
  const carry = h.mode === "duel" ? (h.alive ? "Przeżyłeś — broń i płyta zostają z tobą" : "Zginąłeś — broń przepada, wracasz z pistoletem") : "";
  return (
    <div className={`round-end ${end.mine === null ? "even" : end.mine ? "mine" : "theirs"}`} data-testid="round-end" role="status">
      <div className="round-end-title">{end.title}</div>
      <div className="round-end-why">{end.why}</div>
      {carry && <div className="round-end-carry" data-testid="round-end-carry">{carry}</div>}
      <div className="round-end-score">{a} <b>{h.scoreA}</b> : <b>{h.scoreB}</b> {b}</div>
      <div className="round-end-next">następna runda za {left} s</div>
    </div>
  );
}
