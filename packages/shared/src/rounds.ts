import { Btn, MatchPhase } from "./types";

/**
 * Respawn waves and the frozen preparation window (1.1 drop 7).
 *
 * The rule the owner asked for: "there is a countdown before both teams respawn, so you can calmly
 * prepare". So a match is not one continuous scramble with players trickling back three seconds
 * after they die. It alternates:
 *
 *   LIVE (MATCH.waveMs)  →  PREP (MATCH.prepMs)  →  LIVE  →  …
 *
 * Everyone who died during the wave comes back at the START of prep — not at its end — because the
 * point is to PREPARE: you want to see where you are, look at the map, buy, and reload before the
 * fight restarts. During prep nobody can move, shoot or throw, so both sides are released from the
 * line at the same instant and nobody can take a position (or a spawn) while the others wait.
 *
 * These rules live in `shared` for one reason that is not tidiness: the client PREDICTS movement
 * with the same `simulateBody` the server runs. If the freeze were implemented only on the server,
 * a frozen player would walk on their own screen and be yanked back every frame. Both sides mask
 * the same buttons out of the same input, so prediction and authority never disagree about it.
 */

/**
 * Is the room live — can players act? False during prep and on the result screen.
 *
 * WARM-UP IS LIVE. Waiting and Countdown stay playable on purpose: a warm-up you cannot shoot in is
 * just a loading screen, and `TdmRoom.test.ts` pins that warm-up combat works.
 */
export const isLive = (phase: MatchPhase): boolean => phase !== MatchPhase.Prep && phase !== MatchPhase.Ended;

/** Is the room in the frozen preparation window? */
export const isFrozen = (phase: MatchPhase): boolean => phase === MatchPhase.Prep;

/**
 * Buttons that MOVE a body. Stripped while frozen.
 *
 * Crouch and lean are deliberately NOT here. They change your pose, not where you are, and nobody
 * can shoot during prep — letting a player settle into a stance while they wait is part of
 * preparing. Fire and Aim are not here either: firing is a message (`C2S.Fire`), not a button, and
 * these two bits only feed the sprint rule.
 */
export const MOVEMENT_BUTTONS = Btn.Forward | Btn.Back | Btn.Left | Btn.Right | Btn.Jump | Btn.Sprint | Btn.Tac;

/**
 * The buttons that survive into the simulation.
 *
 * Note what this does NOT do: it does not zero velocity. A frozen player keeps whatever momentum
 * they had and is stopped by the mover's own friction over a few frames, which reads as skidding to
 * a halt rather than hitting a wall — MEASURED at 0.18 m from 3.11 m/s, and nothing at all after
 * 300 ms. More importantly it means client and server reach the same place by running identical
 * physics on identical input, with nothing to reconcile.
 */
export const maskInput = (buttons: number, frozen: boolean): number =>
  frozen ? buttons & ~MOVEMENT_BUTTONS : buttons;

/**
 * Is a CLIENT frozen, judged from the shared clock rather than from the message that announces it?
 *
 * Both sides run the same server clock and both know when the current window ends, so the client
 * can start AND stop freezing on the same timestamp the server does, without waiting for
 * `S2C.MatchEvent` in either direction. Waiting cost half a round trip at each boundary: at the
 * freeze it meant walking on after the server had stopped you and being pulled back — a visible tug
 * every seventeen seconds — and at the release it meant the client MASKING ITS OWN INPUT for that
 * long, so the movement was not delayed but discarded, and discarded in proportion to ping. A
 * 200 ms player lost ten times the start a 20 ms player lost, every single wave.
 *
 * So: the wave clock running out means frozen; the preparation clock running out means released.
 * The phase says which window `phaseEndsAt` belongs to, and a stale phase gives the right answer
 * either way, which is the point of reading the clock instead of the phase.
 */
export const frozenAt = (phase: MatchPhase, phaseEndsAt: number, serverNow: number): boolean => {
  if (phaseEndsAt <= 0) return isFrozen(phase);
  if (phase === MatchPhase.Playing) return false; // no periodic freezes during a continuous match
  if (phase === MatchPhase.Prep) return serverNow < phaseEndsAt;     // released the moment it ends
  return false;
};

/**
 * Milliseconds until a dead player is back, given the phase and when it ends.
 *
 * Dead during a wave: you return when the wave does, so it is the time left on the phase. Dead
 * during prep should not happen (prep respawns everyone at its start) but a player who joins or
 * reconnects mid-prep is dead until it ends, which is the same answer.
 */
export const respawnInMs = (phase: MatchPhase, phaseEndsAt: number, now: number): number =>
  phase === MatchPhase.Playing || phase === MatchPhase.Prep ? Math.max(0, phaseEndsAt - now) : 0;
