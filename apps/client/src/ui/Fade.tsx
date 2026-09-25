import { forwardRef, useCallback, useRef, useState } from "react";

/**
 * Drop U §6.1 (P7): the black every screen change goes through, as in CS2 and Call of Duty — menu →
 * loading, loading → match, match → menu, loading → menu and error → menu. Nothing swaps in view:
 * the old screen goes black, the new one is mounted UNDER the black, and only then does it clear.
 *
 * The layer sits inside `.app` (App.tsx), because the fullscreen element is `.app` and a layer
 * outside it would not be painted in fullscreen (PLAN_2_1.md:501-507). It stacks above the loading
 * card (z 100) at z 150, set on its own root in `screens.css` (§3.9; `--z-fade` is scoped to the
 * HUD and the loading card and does not reach this layer). While it is going black it takes the
 * clicks, so a second GRAJ or a click on a screen that is leaving lands nowhere.
 */
export interface FadeState {
  /** Black (true) or clear (false): the target the layer is moving to. */
  on: boolean;
  /** How long the move takes; 0 is a cut (and always 0 under reduced motion): no transition at all. */
  ms: number;
}

export const Fade = forwardRef<HTMLDivElement, FadeState>(function Fade({ on, ms }, ref) {
  return (
    <div ref={ref} className={`fade${on ? " on" : ""}`} data-testid="fade" data-zone="fade" aria-hidden="true"
      style={{ transitionDuration: `${ms}ms`, transitionProperty: ms > 0 ? "opacity" : "none" }} />
  );
});

/** One frame, or 50 ms when the tab is hidden and frames stop (a player who alt-tabbed mid-load). */
const frame = (): Promise<void> => new Promise((resolve) => {
  const t = window.setTimeout(resolve, 50);
  requestAnimationFrame(() => { window.clearTimeout(t); resolve(); });
});
const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));
const reducedMotion = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A transition through black: the ms to go black, what to swap under it, the ms to clear. */
export interface Through {
  inMs: number;
  /** Runs once the screen is fully black. Whatever it mounts is committed before the black clears. */
  swap: () => void | Promise<void>;
  outMs: number;
  /** Called as the black starts to clear (the HUD's zone stagger starts here, §6.1). */
  onClear?: () => void;
}

/**
 * The fade's controller. Transitions are QUEUED, never interleaved: a leave requested while the
 * menu → loading black is still coming in waits for that swap, then runs its own. A transition
 * that has a newer one queued behind it does not clear the screen — the newer one keeps it black —
 * so an instant connection failure reads as one black, not black, flash, black.
 */
export function useFade() {
  const [state, setState] = useState<FadeState>({ on: false, ms: 0 });
  const el = useRef<HTMLDivElement>(null);
  const isOn = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const gen = useRef(0);

  /**
   * Move to black or clear, resolving when the layer is REALLY there. After the transition's own
   * length the layer SNAPS to its target (transition off), then the computed opacity is read back
   * until it holds. Both halves are measured: a timer of the transition's length fires before a
   * transition that started a frame later has finished, and a page busy enough to stop producing
   * frames (a headless browser entering fullscreen: 4 s without one, measured) freezes a CSS
   * transition part-way — the old version gave up waiting and uncovered the live canvas at 1 %
   * black. A frozen transition now ends as a cut, never as a shared frame.
   */
  const fadeTo = useCallback(async (on: boolean, ms: number): Promise<void> => {
    if (isOn.current === on) return;
    isOn.current = on;
    const d = reducedMotion() ? 0 : ms;
    setState({ on, ms: d });
    await sleep(d);
    setState({ on, ms: 0 });
    for (let i = 0; i < 250; i++) {
      const node = el.current;
      if (!node) return;
      const o = Number(getComputedStyle(node).opacity);
      if (on ? o >= 0.999 : o <= 0.001) return;
      await sleep(16);
    }
  }, []);

  const through = useCallback((t: Through): Promise<void> => {
    const mine = ++gen.current;
    const run = async (): Promise<void> => {
      await fadeTo(true, t.inMs);
      await t.swap();
      // Two frames: React commits what the swap set, and the browser paints it, still under black.
      await frame(); await frame();
      if (gen.current !== mine) return; // a newer transition holds the black
      t.onClear?.();
      await fadeTo(false, t.outMs);
    };
    const p = queue.current.then(run, run);
    queue.current = p.catch(() => undefined);
    return p;
  }, [fadeTo]);

  return { state, ref: el, through };
}
