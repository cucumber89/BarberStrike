import { useEffect, useRef, useState } from "react";
import { MatchPhase } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { loadSeen, nextHint, saveSeen, type HintDef } from "./hintRules";

/**
 * One short line, bottom-centre, during a player's first match. See `hints.ts` for the rules; this
 * is only the plumbing: watch the state, show what `nextHint` returns, remember it, let it go.
 *
 * It never takes the keyboard and never blocks a click — `pointer-events: none` in the CSS — so
 * the worst a hint can do at the wrong moment is be ignored.
 */
export function Hints({ h }: { h: HudState }) {
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

  useEffect(() => { startedAt.current = performance.now(); }, []);

  useEffect(() => {
    if (current) return;
    let hide = 0;
    const t = window.setInterval(() => {
      const h = latest.current;
      const totals: [number, number] = [0, 0];
      for (const p of h.players) if (p.connected) totals[p.team]++;
      const next = nextHint({
        alive: h.alive,
        connected: h.connected && h.phase !== MatchPhase.Ended,
        shopOpen: h.shopOpen,
        buyWindowLeft: h.buyWindowLeft,
        mode: h.mode,
        bombStage: h.bomb?.stage ?? "",
        carrying: !!h.bomb && h.bomb.carrier === h.myId,
        planVoteMine: !!h.plan && h.plan.options.length > 0 && h.plan.chosen === 0 && h.plan.votingTeam === h.myTeam,
        teamTotals: totals,
        myTeam: h.myTeam,
        elapsedMs: performance.now() - startedAt.current,
      }, seen);
      if (!next) return;
      seen.add(next.id);
      saveSeen(seen);
      setCurrent(next);
      hide = window.setTimeout(() => setCurrent(null), next.ms);
    }, 700);
    return () => { window.clearInterval(t); if (hide) window.clearTimeout(hide); };
  }, [current, seen]);

  if (!current) return null;
  return <div className="hint" data-testid="hint" role="status">{current.text}</div>;
}
