import { useSyncExternalStore } from "react";
import { TUTORIAL_LAST_STEP } from "./tutorialRules";

/**
 * The tutorial's running state, kept OUTSIDE the React tree.
 *
 * The overlay is laid over an ordinary match (§5), so it has to outlive the menu: the moment the
 * player picks SAMOUCZEK the menu unmounts and the match screens come up. A module-level store,
 * mounted once at the app root (`TutorialMount` in `main.tsx`), is what survives that swap — the
 * same shape the HUD store uses. `active` gates the whole overlay; `step` is the 1..5 the overlay
 * shows and the e2e tool asserts on.
 */
interface TutorialState {
  active: boolean;
  /** 1..5 while running, LAST+1 once the player has done every action. */
  step: number;
}

let state: TutorialState = { active: false, step: 1 };
const listeners = new Set<() => void>();
const emit = (): void => { for (const l of listeners) l(); };

function set(next: Partial<TutorialState>): void {
  state = { ...state, ...next };
  emit();
}

export const tutorial = {
  get: (): TutorialState => state,
  subscribe: (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  /** SAMOUCZEK: begin at step 1 (the match itself is launched by the menu's `play`). */
  start(): void { set({ active: true, step: 1 }); },
  /** Advance to `n` (called by the overlay as each step's action is seen). */
  goto(n: number): void { if (n !== state.step) set({ step: Math.min(n, TUTORIAL_LAST_STEP + 1) }); },
  /** tutorial-quit, or the tutorial running its course. */
  stop(): void { if (state.active) set({ active: false, step: 1 }); },
};

export function useTutorial(): TutorialState {
  return useSyncExternalStore(tutorial.subscribe, tutorial.get, tutorial.get);
}
