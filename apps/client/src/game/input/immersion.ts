/**
 * Fullscreen, pointer lock and keyboard lock — the three things a browser only grants inside a
 * real user gesture, and each of which can fail on its own.
 *
 * Browsers make no promises here:
 * - `requestFullscreen()` rejects outside a user gesture, in some iframes, and on iOS Safari.
 * - `requestPointerLock()` rejects if the document is not focused, and Chrome imposes a cooldown
 *   after the user pressed Escape to leave a previous lock ("the user has exited the lock before").
 * - `navigator.keyboard.lock()` exists only in Chromium and only works while fullscreen.
 *
 * So this asks for all three from one click, reports honestly what it got, and leaves the caller
 * to show a retry button. It never throws: a failure is a value.
 */

export interface ImmersionResult {
  fullscreen: boolean;
  pointerLock: boolean;
  keyboardLock: boolean;
  /** Short, player-readable reason the request did not fully succeed. */
  reason?: string;
}

type KeyboardLockNavigator = Navigator & {
  keyboard?: { lock?: (codes?: string[]) => Promise<void>; unlock?: () => void };
};

/**
 * Codes worth locking away from the browser once fullscreen is granted. Escape is included so the
 * pause menu gets it — with keyboard lock a *held* Escape still leaves fullscreen, which is the
 * escape hatch the spec guarantees the user.
 */
export const LOCKED_CODES: readonly string[] = [
  "Escape", "Tab",
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyT", "KeyN", "KeyP", "KeyB", "KeyF", "KeyG",
  "Digit1", "Digit2", "Digit3", "Digit4",
];

export function isFullscreen(doc: Document = document): boolean {
  return doc.fullscreenElement != null;
}

export async function enterFullscreen(el: HTMLElement): Promise<boolean> {
  if (isFullscreen(el.ownerDocument)) return true;
  const request = el.requestFullscreen?.bind(el)
    ?? (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.bind(el);
  if (!request) return false;
  try {
    await request({ navigationUI: "hide" } as FullscreenOptions);
    return isFullscreen(el.ownerDocument);
  } catch {
    return false;
  }
}

export async function exitFullscreen(doc: Document = document): Promise<void> {
  if (!isFullscreen(doc)) return;
  try { await doc.exitFullscreen(); } catch { /* already gone */ }
}

/** Chromium only, fullscreen only. Failure is normal and is not worth telling the player about. */
export async function lockKeyboard(codes: readonly string[] = LOCKED_CODES): Promise<boolean> {
  const kb = (navigator as KeyboardLockNavigator).keyboard;
  if (!kb?.lock) return false;
  try { await kb.lock([...codes]); return true; } catch { return false; }
}

export function unlockKeyboard(): void {
  try { (navigator as KeyboardLockNavigator).keyboard?.unlock?.(); } catch { /* not supported */ }
}

/**
 * The Play button's whole job, in the order the browser wants it: fullscreen first (keyboard lock
 * depends on it), then keyboard lock, then the pointer.
 *
 * Must be called synchronously from a click/keydown handler — awaiting anything before it spends
 * the gesture and every request below will be refused.
 */
export async function enterImmersion(
  canvas: HTMLElement,
  requestPointerLock: () => Promise<boolean>,
): Promise<ImmersionResult> {
  const fullscreen = await enterFullscreen(canvas);
  const keyboardLock = fullscreen ? await lockKeyboard() : false;
  const pointerLock = await requestPointerLock();
  const reason = !pointerLock
    ? "The browser did not give the game your mouse. Click Resume to try again."
    : !fullscreen
      ? "Fullscreen was refused; the game is running in the page."
      : undefined;
  return { fullscreen, pointerLock, keyboardLock, reason };
}

export function exitImmersion(): void {
  unlockKeyboard();
  void exitFullscreen();
}
