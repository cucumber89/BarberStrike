/**
 * Onboarding for new players (drop V, P8b — V_SPEC §5, §7 P8b).
 *
 * The brief: a welcome shown ONCE (localStorage `bs_onboard_v1`) with three ways in — a five-step
 * tutorial laid over an ordinary match, a bots-only training match, or skip — and the tutorial must
 * reuse the first-run hint context (`hintRules.ts`) rather than invent a second notion of "what is
 * happening in the round". This module is the pure part: the five steps, the rule that says a step
 * is done, and the one-time welcome flag. Everything here is a function of state, so it is unit-
 * tested rather than discovered by playing (same discipline as `hintRules.ts`).
 *
 * The tutorial does NOT block play: it never takes the keyboard, nothing has to be dismissed, and a
 * step advances the instant the player does the thing it asked for. Five steps, five actions —
 * that is the whole contract the e2e tool (`tutorial.mjs`) checks: five actions move
 * `tutorial-step` 1 → 5.
 */

export interface TutorialStepDef {
  /** 1..5, the number the overlay shows and the e2e tool asserts on. */
  n: number;
  /** The line, written to be read at a glance mid-match (Polish, like the hints). */
  text: string;
  /** The key(s) the player presses to satisfy the step, shown as a chip. */
  key: string;
}

/**
 * Five steps, in the order a new player meets the game: look around and move, aim down the sights,
 * fire, reload, switch weapon. Deliberately the same five things the `move` hint hints at, spelled
 * out one at a time so nobody is left staring at a wall of text (§5, `hintRules.ts` discipline).
 */
export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  { n: 1, text: "Rozejrzyj się i rusz — WASD, a myszą patrz dookoła.", key: "WASD" },
  { n: 2, text: "Wyceluj przez muszkę — przytrzymaj prawy przycisk myszy.", key: "PPM" },
  { n: 3, text: "Strzel — lewy przycisk myszy.", key: "LPM" },
  { n: 4, text: "Przeładuj magazynek — R.", key: "R" },
  { n: 5, text: "Zmień broń — 1 / 2 albo kółko myszy.", key: "1 / 2" },
] as const;

export const TUTORIAL_LAST_STEP = TUTORIAL_STEPS.length; // 5

/**
 * What the tutorial needs to know about the player's actions this frame, to decide whether the
 * current step is done. It is a superset of the hint context's flat, boring shape (§5 asks the
 * tutorial to reuse that context): `aiming`, `reloading` and the two counters come straight off the
 * `HudState` the hints already read, so the overlay does not invent a second source of truth.
 */
export interface TutorialContext {
  /** The player is connected to a live match and has a body. */
  alive: boolean;
  connected: boolean;
  /** The player has moved since the tutorial started (position changed). */
  moved: boolean;
  /** Aiming down the sights right now (`HudState.aiming`). */
  aiming: boolean;
  /** A shot has been fired since the last check (ammo went down, or a hit was confirmed). */
  fired: boolean;
  /** A reload is in progress or has completed (`HudState.reloading` seen true). */
  reloaded: boolean;
  /** The carried weapon changed since the step began (`HudState.weapon` differs). */
  switched: boolean;
}

/**
 * Is the given step satisfied by what the player just did? One predicate per step, keyed by its
 * number, so the overlay advances 1 → 5 exactly as the player performs the five actions. A step is
 * never satisfied while the player is dead or disconnected — the same guard the hints use, so the
 * tutorial does not skip a step during a respawn or a drop.
 */
export function stepDone(step: number, ctx: TutorialContext): boolean {
  if (!ctx.connected || !ctx.alive) return false;
  switch (step) {
    case 1: return ctx.moved;
    case 2: return ctx.aiming;
    case 3: return ctx.fired;
    case 4: return ctx.reloaded;
    case 5: return ctx.switched;
    default: return false;
  }
}

/** The step to show after `step` is done: the next one, capped at "finished" (LAST + 1). */
export function nextStep(step: number, ctx: TutorialContext): number {
  return stepDone(step, ctx) ? Math.min(step + 1, TUTORIAL_LAST_STEP + 1) : step;
}

/** The tutorial is over once the player has done the last action. */
export function isFinished(step: number): boolean {
  return step > TUTORIAL_LAST_STEP;
}

// --------------------------------------------------------------------- one-time welcome flag

/**
 * The welcome is shown ONCE, ever, and remembered across sessions (§5, key `bs_onboard_v1`). The
 * flag is the string the e2e tool reads: `onb-skip` (and choosing the tutorial or training) sets
 * `welcomed` true, so the welcome never greets a returning player.
 */
export const ONBOARD_KEY = "bs_onboard_v1";

export interface OnboardState {
  welcomed: boolean;
}

export function loadOnboard(): OnboardState {
  try {
    const raw = localStorage.getItem(ONBOARD_KEY);
    if (!raw) return { welcomed: false };
    const v: unknown = JSON.parse(raw);
    return { welcomed: !!(v && typeof v === "object" && (v as { welcomed?: unknown }).welcomed) };
  } catch { return { welcomed: false }; }
}

export function markWelcomed(): void {
  try { localStorage.setItem(ONBOARD_KEY, JSON.stringify({ welcomed: true })); } catch { /* private mode */ }
}

/** For settings / tests: let a player ask to see the welcome again. */
export function resetOnboard(): void {
  try { localStorage.removeItem(ONBOARD_KEY); } catch { /* private mode */ }
}
