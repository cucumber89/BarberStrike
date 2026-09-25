import { useEffect, useRef } from "react";
import { useHud } from "../../game/store";
import { TUTORIAL_STEPS, TUTORIAL_LAST_STEP, stepDone, type TutorialContext } from "./tutorialRules";
import { tutorial, useTutorial } from "./tutorialStore";
import "./onboarding.css";

/**
 * The five-step tutorial, laid OVER an ordinary match (§5, §7 P8b). It never takes the keyboard and
 * never blocks a click (`pointer-events: none` on the card, only QUIT is clickable) — the worst it
 * can do is be ignored, exactly like the first-run hints it sits beside. Each step advances the
 * instant the player does the thing it asks for; five actions walk `tutorial-step` 1 → 5, which is
 * the whole contract the e2e tool checks.
 *
 * It reads two sources, and only those: the HUD store (§5 asks the tutorial to reuse the hint
 * context — `aiming`, `reloading`, `ammo`, `weapon` all come off `HudState`) and raw input events
 * (WASD / mouse buttons / weapon keys), so a step is satisfied whether we catch the action through
 * the game state or the keypress that caused it. No game internals, no dev harness — this is a plain
 * overlay a match happens to run under.
 */
export function TutorialOverlay() {
  const { active, step } = useTutorial();
  const h = useHud();
  // Per-step, since-the-step-began flags collected from raw input; cleared when the step changes so
  // "fired" on step 3 is not a shot the player took while reading step 2.
  const seen = useRef({ moved: false, fired: false, switched: false });
  const stepRef = useRef(step);
  const weaponAtStep = useRef(h.weapon);
  const reloadedRef = useRef(false);

  // A new step: reset the per-step observations and remember the weapon we started it with.
  useEffect(() => {
    if (stepRef.current !== step) {
      stepRef.current = step;
      seen.current = { moved: false, fired: false, switched: false };
      weaponAtStep.current = h.weapon;
      reloadedRef.current = false;
    }
  }, [step, h.weapon]);

  // Raw input, so movement and the mouse buttons register even under pointer lock (the canvas has
  // it, so these land on `document`). WASD → moved; LMB → fired; RMB is read off `HudState.aiming`
  // instead (a held button, not an event); wheel / 1 / 2 → switched; R → a reload attempt.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(k)) seen.current.moved = true;
      if (k === "1" || k === "2" || k === "x") seen.current.switched = true;
      if (k === "r") reloadedRef.current = true;
    };
    const onMouseMove = () => { seen.current.moved = true; };
    const onMouseDown = (e: MouseEvent) => { if (e.button === 0) seen.current.fired = true; };
    const onWheel = () => { seen.current.switched = true; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("wheel", onWheel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, [active]);

  // The advance loop. It merges the raw-input flags with what the HUD state reports (the reload in
  // flight, the weapon that changed, the ADS the player is holding) and, when the step is done,
  // steps the store forward. Once past the last step the tutorial stops itself (the match plays on).
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const s = tutorial.get();
      if (!s.active) return;
      const cur = s.step;
      const ctx: TutorialContext = {
        alive: h.alive,
        connected: h.connected,
        moved: seen.current.moved,
        aiming: h.aiming,
        fired: seen.current.fired,
        reloaded: reloadedRef.current || h.reloading,
        switched: seen.current.switched || h.weapon !== weaponAtStep.current,
      };
      if (stepDone(cur, ctx)) {
        const next = cur + 1;
        if (next > TUTORIAL_LAST_STEP) tutorial.stop();
        else tutorial.goto(next);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [active, h]);

  if (!active) return null;
  const def = TUTORIAL_STEPS[Math.min(step, TUTORIAL_LAST_STEP) - 1];
  return (
    <div className="tut-overlay" data-testid="tutorial-overlay" data-step={step} role="status">
      <div className="tut-card">
        <div className="tut-head">
          <span className="tut-kicker">SAMOUCZEK</span>
          <b className="tut-count" data-testid="tutorial-step" data-step={step}>
            KROK {Math.min(step, TUTORIAL_LAST_STEP)} / {TUTORIAL_LAST_STEP}
          </b>
        </div>
        <p className="tut-text">{def.text}</p>
        <div className="tut-foot">
          <kbd className="tut-key">{def.key}</kbd>
          <button type="button" className="tut-quit" data-testid="tutorial-quit" onClick={() => tutorial.stop()}>
            ZAKOŃCZ SAMOUCZEK
          </button>
        </div>
        <div className="tut-dots" aria-hidden="true">
          {TUTORIAL_STEPS.map((s) => <i key={s.n} className={s.n <= step ? "on" : ""} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * Mounted once at the app root (a sibling of `<App/>` in `main.tsx`), so the overlay outlives the
 * menu that starts it: picking SAMOUCZEK unmounts the menu and brings up the match, and the overlay
 * has to be there through the swap. It renders nothing until a tutorial is running.
 */
export function TutorialMount() {
  const { active } = useTutorial();
  return active ? <TutorialOverlay /> : null;
}
