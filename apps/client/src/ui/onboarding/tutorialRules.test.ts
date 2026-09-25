import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  isFinished, loadOnboard, markWelcomed, nextStep, ONBOARD_KEY, resetOnboard, stepDone,
  TUTORIAL_LAST_STEP, TUTORIAL_STEPS, type TutorialContext,
} from "./tutorialRules";

// The client's vitest runs in the `node` environment (no DOM), so the welcome-flag tests get a
// tiny in-memory localStorage — the same surface the real code touches (getItem/setItem/removeItem).
beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    } as Storage;
  }
});

const base: TutorialContext = {
  alive: true, connected: true, moved: false, aiming: false, fired: false, reloaded: false, switched: false,
};
const ctx = (o: Partial<TutorialContext> = {}): TutorialContext => ({ ...base, ...o });

describe("tutorial steps", () => {
  it("has exactly five steps, numbered 1..5 in order", () => {
    expect(TUTORIAL_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(TUTORIAL_LAST_STEP).toBe(5);
  });

  it("keeps every line short enough to read mid-match, in Polish, with a key chip", () => {
    for (const s of TUTORIAL_STEPS) {
      expect(s.text.length, `step ${s.n}`).toBeLessThan(78);
      expect(s.key.length, `step ${s.n}`).toBeGreaterThan(0);
    }
  });

  it("advances a step only when its one action is done", () => {
    expect(stepDone(1, ctx())).toBe(false);
    expect(stepDone(1, ctx({ moved: true }))).toBe(true);
    expect(stepDone(2, ctx({ aiming: true }))).toBe(true);
    expect(stepDone(3, ctx({ fired: true }))).toBe(true);
    expect(stepDone(4, ctx({ reloaded: true }))).toBe(true);
    expect(stepDone(5, ctx({ switched: true }))).toBe(true);
  });

  it("does not let one action satisfy a different step", () => {
    expect(stepDone(1, ctx({ fired: true }))).toBe(false);
    expect(stepDone(3, ctx({ moved: true }))).toBe(false);
    expect(stepDone(5, ctx({ reloaded: true }))).toBe(false);
  });

  it("never advances while the player is dead or disconnected (respawn / drop safe)", () => {
    expect(stepDone(1, ctx({ moved: true, alive: false }))).toBe(false);
    expect(stepDone(3, ctx({ fired: true, connected: false }))).toBe(false);
  });

  it("walks 1 → 5 over five actions and then finishes", () => {
    // The five actions the e2e tool drives, one per step.
    const actions: Partial<TutorialContext>[] = [
      { moved: true }, { aiming: true }, { fired: true }, { reloaded: true }, { switched: true },
    ];
    let step = 1;
    for (const a of actions) step = nextStep(step, ctx(a));
    expect(step).toBe(TUTORIAL_LAST_STEP + 1);
    expect(isFinished(step)).toBe(true);
  });

  it("holds on a step until its action, then moves exactly one forward", () => {
    expect(nextStep(2, ctx())).toBe(2);         // nothing done → stays
    expect(nextStep(2, ctx({ aiming: true }))).toBe(3);
    expect(nextStep(2, ctx({ fired: true }))).toBe(2); // wrong action → stays
  });

  it("caps the last step at finished and never runs off the end", () => {
    expect(nextStep(5, ctx({ switched: true }))).toBe(6);
    expect(isFinished(5)).toBe(false);
    expect(isFinished(6)).toBe(true);
  });
});

describe("one-time welcome flag", () => {
  beforeEach(() => { resetOnboard(); });

  it("starts un-welcomed and reads back true once marked", () => {
    expect(loadOnboard().welcomed).toBe(false);
    markWelcomed();
    expect(loadOnboard().welcomed).toBe(true);
  });

  it("persists under the spec's key so a returning player is never greeted", () => {
    markWelcomed();
    expect(localStorage.getItem(ONBOARD_KEY)).toContain("welcomed");
    expect(loadOnboard().welcomed).toBe(true);
  });

  it("survives a garbage value without throwing", () => {
    localStorage.setItem(ONBOARD_KEY, "{not json");
    expect(loadOnboard().welcomed).toBe(false);
  });

  it("reset shows the welcome again", () => {
    markWelcomed();
    resetOnboard();
    expect(loadOnboard().welcomed).toBe(false);
  });
});
