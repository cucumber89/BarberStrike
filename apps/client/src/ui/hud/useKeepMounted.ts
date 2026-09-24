import { useEffect, useReducer, useState } from "react";

/**
 * Drop U: keep a closing layer mounted for its exit animation, with its listeners off.
 *
 * The shop (160 ms) and the result card (400 ms) keep their CONDITIONAL mounts (veto): when they
 * close they must leave the tree, not linger hidden. This gives them a short, explicit "closing"
 * window in between — mounted so the fade-out can play, but no longer answering keys or clicks —
 * and then removes them.
 *
 * Owned by P0 and frozen for the drop (docs/UI_U_SPEC.md §7.0).
 */

/** `open`: mounted and live. `closing`: mounted for the exit, listeners off. `closed`: unmount. */
export type KeepMounted = "open" | "closing" | "closed";

/**
 * Pure: the state of a layer that is `open` now, or was closed at `closedAt` (a clock reading; 0 =
 * it has not been closed since it was last open, or it was never open), at time `now`, when its
 * exit lasts `ms`.
 */
export function keepMountedState(open: boolean, closedAt: number, now: number, ms: number): KeepMounted {
  if (open) return "open";
  return closedAt > 0 && now - closedAt < ms ? "closing" : "closed";
}

/**
 * The hook: `open` as the component's own condition, `ms` the exit's length. Render the layer while
 * the result is not `closed`, and attach its listeners only while it is `open`.
 */
export function useKeepMounted(open: boolean, ms: number): KeepMounted {
  // The open → closed edge is taken DURING render (React's "adjust state on a prop change"
  // pattern), so the very render in which `open` goes false already reads `closing` — the layer
  // never unmounts for a frame and comes back.
  const [seenOpen, setSeenOpen] = useState(open);
  const [closedAt, setClosedAt] = useState(0);
  if (seenOpen !== open) {
    setSeenOpen(open);
    setClosedAt(open ? 0 : performance.now());
  }
  const state = keepMountedState(open, closedAt, performance.now(), ms);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (state !== "closing") return;
    const id = window.setTimeout(rerender, Math.max(0, closedAt + ms - performance.now()) + 1);
    return () => window.clearTimeout(id);
  }, [state, closedAt, ms]);
  return state;
}
