/**
 * The last line of defence for the chords no page can refuse.
 *
 * Crouch is bound to Ctrl again (players asked for it), and crouch-walking forward is Ctrl+W. The
 * browser keeps Ctrl+W, Ctrl+T, Ctrl+N and Ctrl+Q for itself: `preventDefault()` is ignored on them,
 * and `browserKeys.ts` says so. Keyboard Lock does capture them, but only on Chromium and only while
 * fullscreen — so on Firefox, on Safari, or on anyone who pressed Escape out of fullscreen, a
 * crouch-walk can still close the tab.
 *
 * `beforeunload` cannot stop that either. What it can do is make the browser ASK, which turns "the
 * match ended because my little finger was on Ctrl" into a dialog the player dismisses. That is the
 * whole of this module's ambition, and it is worth more than it looks.
 *
 * Armed only while a match is actually being played. In the menu the page behaves like a page: Ctrl+W
 * closes it, Ctrl+R reloads it, and nothing asks twice. A guard that is always on is the kind of
 * thing people install ad-blockers to get rid of.
 *
 * The message is ignored by every modern browser (they show their own wording); it is passed because
 * the older API required it and passing it costs nothing.
 */

let armed = false;
let handler: ((e: BeforeUnloadEvent) => void) | null = null;

/** True while the guard is asking the browser to confirm navigation away. */
export const isUnloadGuarded = (): boolean => armed;

/**
 * Arms or disarms the "are you sure?" prompt. Idempotent: calling it with the value it already has
 * does nothing, so the game can call it from a state change on every frame if it likes.
 */
export function guardUnload(on: boolean, target: Pick<Window, "addEventListener" | "removeEventListener"> = window): void {
  if (on === armed) return;
  armed = on;
  if (on) {
    handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    target.addEventListener("beforeunload", handler as EventListener);
  } else if (handler) {
    target.removeEventListener("beforeunload", handler as EventListener);
    handler = null;
  }
}

/** Teardown helper: drops the listener whatever state it was in. */
export function releaseUnloadGuard(target: Pick<Window, "addEventListener" | "removeEventListener"> = window): void {
  guardUnload(false, target);
}
