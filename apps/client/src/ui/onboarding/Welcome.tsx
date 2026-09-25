import { useState } from "react";
import { loadOnboard, markWelcomed } from "./tutorialRules";
import "./onboarding.css";

/**
 * The one-time welcome for a brand-new player (drop V, P8b — §5, §7 P8b). Shown ONCE, ever
 * (localStorage `bs_onboard_v1`), over the menu, with three ways in:
 *
 *   - SAMOUCZEK — a five-step tutorial laid over an ordinary duel with a bot (`onStart("tutorial")`);
 *   - TRENING — a duel against bots, no overlay (`onStart("training")`);
 *   - POMIŃ — straight to the menu (`onSkip`).
 *
 * Any of the three marks the player as welcomed, so it never greets a returning player. It blocks
 * nothing permanent: L1 holds (nothing is gated), and a player who skips has lost nothing — the
 * first-run hints still fire in their first real match.
 */
export function Welcome({ onStart, onSkip }: { onStart: (kind: "tutorial" | "training") => void; onSkip: () => void }) {
  // Read once at mount: a returning player never sees this, and the parent only renders it when the
  // flag is unset, so this is the belt to that render-time braces.
  const [gone, setGone] = useState(() => loadOnboard().welcomed);
  if (gone) return null;

  const done = (after: () => void) => { markWelcomed(); setGone(true); after(); };

  return (
    <div className="onb" data-testid="onboarding-welcome" role="dialog" aria-label="Witaj w BarberStrike">
      <div className="onb-card">
        <div className="onb-head">
          <span className="onb-kicker">PIERWSZY RAZ TUTAJ?</span>
          <h2 className="onb-title">Witaj w <b>BARBERSTRIKE</b></h2>
          <p className="onb-sub">Nic nie jest zablokowane — grasz od razu. Wybierz, jak chcesz zacząć.</p>
        </div>
        <div className="onb-choices">
          <button type="button" className="onb-choice primary" data-testid="onb-tutorial" onClick={() => done(() => onStart("tutorial"))}>
            <b>SAMOUCZEK</b>
            <span>Pięć kroków na żywym meczu — ruch, celowanie, strzał, przeładowanie, zmiana broni.</span>
          </button>
          <button type="button" className="onb-choice" data-testid="onb-training" onClick={() => done(() => onStart("training"))}>
            <b>TRENING Z BOTAMI</b>
            <span>Pojedynek z botem, bez presji. Rozgrzej się, zanim wejdziesz między ludzi.</span>
          </button>
          <button type="button" className="onb-choice ghost" data-testid="onb-skip" onClick={() => done(onSkip)}>
            <b>POMIŃ</b>
            <span>Znam już takie gry — przejdź do menu.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
