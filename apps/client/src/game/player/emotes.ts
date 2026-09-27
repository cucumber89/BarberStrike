import { Btn, EMOTE_MAX_MS } from "@frankibarber/shared";

/**
 * The local dance (H): when it may start, what ends it. Pure rules, so the test can hold them.
 *
 * A dance is cosmetic and has to stay that way (L1): it never starts on the move, and anything a
 * player does with intent — a step, a jump, a crouch, the trigger, the sights, a lean, a sprint —
 * ends it on that frame and hands the body straight back. Standing still dancing is the only way to
 * dance, so it can never be a way to fight.
 */

/** Buttons that end a dance the moment they are down. */
export const EMOTE_BREAK_BUTTONS = Btn.Forward | Btn.Back | Btn.Left | Btn.Right | Btn.Jump | Btn.Crouch
  | Btn.Fire | Btn.Aim | Btn.Sprint | Btn.LeanL | Btn.LeanR;

/** Faster than this (m/s) is moving, not dancing — a push from a blast or a slope counts too. */
export const EMOTE_MAX_SPEED = 0.6;

export interface EmoteBody { vx: number; vz: number; grounded: boolean }

/** May a dance start now? Standing on the ground, alive, not in a menu, nothing held down. */
export function canStartEmote(alive: boolean, body: EmoteBody, buttons: number, blocked: boolean): boolean {
  return alive && !blocked && body.grounded && Math.hypot(body.vx, body.vz) <= EMOTE_MAX_SPEED && (buttons & EMOTE_BREAK_BUTTONS) === 0;
}

/** Why a running dance ends this frame, or null to keep dancing. */
export function emoteBreak(alive: boolean, body: EmoteBody, buttons: number, elapsedMs: number, blocked: boolean): string | null {
  if (!alive) return "dead";
  if (blocked) return "busy";
  if ((buttons & EMOTE_BREAK_BUTTONS) !== 0) return "input";
  if (!body.grounded || Math.hypot(body.vx, body.vz) > EMOTE_MAX_SPEED) return "moved";
  if (elapsedMs >= EMOTE_MAX_MS) return "time";
  return null;
}

/** A remote dancer stops when their body moves, dies or the cap runs out (a lost "stop" packet). */
export function remoteEmoteOver(alive: boolean, speed: number, elapsedMs: number): boolean {
  return !alive || speed > EMOTE_MAX_SPEED + 0.4 || elapsedMs >= EMOTE_MAX_MS;
}
