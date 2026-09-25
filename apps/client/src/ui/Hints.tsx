import { useEffect, useRef, useState } from "react";
import { MatchPhase } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { cutBeforeRead, loadSeen, nextHint, saveSeen, type HintDef } from "./hintRules";

/**
 * One short line, bottom-centre, during a player's first match. See `hintRules.ts` for the rules;
 * this is only the plumbing: watch the state, show what `nextHint` returns, remember it, let it go.
 * Drop U (P3): zone `hint`, at the bottom edge between the health and the ammo plates, in at most
 * two lines of t1 and never cut short with an ellipsis (docs/UI_U_SPEC.md §7 P3 WORK 5).
 *
 * It never takes the keyboard and never blocks a click — `pointer-events: none` in the CSS — so
 * the worst a hint can do at the wrong moment is be ignored.
 */
export function Hints({ h, covered = false }: { h: HudState; covered?: boolean }) {
  const [seen] = useState(loadSeen);
  const [current, setCurrent] = useState<HintDef | null>(null);
  const startedAt = useRef(0);
  /**
   * The latest HUD state, read by the interval below WITHOUT being one of its dependencies.
   *
   * It used to be a dependency, and `HudState` is replaced wholesale on every store commit — 10 to
   * 60 times a second — so the interval was torn down and rebuilt on every commit and its 700 ms
   * tick never once survived long enough to fire. Two faults for the price of one: a timer created
   * and destroyed sixty times a second for a whole match, and a hint system that showed nothing.
   */
  const latest = useRef(h);
  latest.current = h;
  /** The hint on screen and when it came up — so a cover that cuts it short can give it back. */
  const shown = useRef<{ def: HintDef; at: number } | null>(null);

  /**
   * The hint on screen goes away. If it was cut before it could be read (a cover came down or the
   * line unmounted within HINT_READ_MS), it is un-remembered, so the one-time plan-vote hint is not
   * spent on a player who pressed B the moment the freeze began (ULTRON P3 defect, hint burn).
   */
  const release = useRef(() => {
    const s = shown.current;
    if (!s) return;
    shown.current = null;
    if (cutBeforeRead(performance.now() - s.at, s.def.ms)) { seen.delete(s.def.id); saveSeen(seen); }
  });

  useEffect(() => { startedAt.current = performance.now(); }, []);
  // Unmounted (pause card, dormant HUD, the match's end) while a hint is up: same rule.
  useEffect(() => { const r = release.current; return () => r(); }, []);

  // Pick: only while nothing is up AND the zone is visible — never under the shop, Tab, pause or
  // death (HintsMount folds `!alive` into `covered`; `nextHint` checks `alive` again itself).
  useEffect(() => {
    if (current || covered) return;
    const t = window.setInterval(() => {
      const h = latest.current;
      const totals: [number, number] = [0, 0];
      for (const p of h.players) if (p.connected) totals[p.team]++;
      const next = nextHint({
        alive: h.alive,
        connected: h.connected && h.phase !== MatchPhase.Ended,
        shopOpen: h.shopOpen,
        covered,
        buyWindowLeft: h.buyWindowLeft,
        planVoteMine: !!h.plan && h.plan.options.length > 0 && h.plan.chosen === 0 && h.plan.votingTeam === h.myTeam,
        teamTotals: totals,
        myTeam: h.myTeam,
        elapsedMs: performance.now() - startedAt.current,
      }, seen);
      if (!next) return;
      seen.add(next.id);
      saveSeen(seen);
      shown.current = { def: next, at: performance.now() };
      setCurrent(next);
    }, 700);
    return () => window.clearInterval(t);
  }, [current, covered, seen]);

  // Let it go after its time. A separate effect: the picker's cleanup must not cancel this timer.
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => { shown.current = null; setCurrent(null); }, current.ms);
    return () => window.clearTimeout(t);
  }, [current]);

  // A cover came down over a hint on screen: take it off (and give it back if it was not read).
  useEffect(() => {
    if (!covered || !current) return;
    release.current();
    setCurrent(null);
  }, [covered, current]);

  if (!current) return null;
  return <div className="hint" data-zone="hint" data-testid="hint" role="status">{current.text}</div>;
}
