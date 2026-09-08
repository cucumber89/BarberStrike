/**
 * Which key events the game may take away from the browser, and which it must leave alone.
 *
 * The reported bug: crouch is Ctrl and strafe-right is D, so crouch-strafing right is Ctrl+D and
 * the browser opens "add bookmark" over the match. The old code called `preventDefault()` on the
 * *Ctrl* keydown, which does nothing — the shortcut fires on the D keydown while Ctrl is held.
 * The fix is to decide per key-down event, with its modifiers, whether the game owns it.
 *
 * Two hard rules, because getting either wrong is worse than the bug:
 *
 * 1. A key event that belongs to a TEXT FIELD is never the game's. Chat, the nickname box and the
 *    rebind capture must keep every keystroke including Ctrl+A / Ctrl+C / Ctrl+V and Tab.
 * 2. The game only takes keys while it is actually being played (pointer locked, input enabled,
 *    not typing). Outside that the page behaves like a page — `Ctrl+D` bookmarks it, Tab moves
 *    between buttons, `Ctrl+R` reloads.
 *
 * What the browser *lets* us take is not our choice. `Ctrl+W`, `Ctrl+T`, `Ctrl+N` and `Alt+Tab`
 * are reserved by the user agent and `preventDefault()` is ignored on them; the Keyboard Lock API
 * (`keyboardLock.ts`, Chromium + fullscreen only) is the only way to reach those, and it is
 * requested separately. Everything in `INTERCEPTABLE_CHORDS` is a combination that Chrome and
 * Firefox do hand over.
 */

/** Chords the browser hands over when a page calls `preventDefault()` on the keydown. */
export const INTERCEPTABLE_CHORDS: ReadonlySet<string> = new Set([
  // Ctrl/Cmd + letter shortcuts a WASD+Ctrl-crouch player hits by accident.
  "KeyA", // select all
  "KeyB", // bookmarks bar (also the buy menu)
  "KeyD", // bookmark this page  ← the reported one: crouch + strafe right
  "KeyE", // search / address bar
  "KeyF", // find on page
  "KeyG", // find next
  "KeyH", // history
  "KeyJ", // downloads
  "KeyO", // open file
  "KeyP", // print
  "KeyR", // reload
  "KeyS", // save page
  "KeyU", // view source
  "KeyZ", // undo
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", // Ctrl+N switches tab in Firefox/Chrome
]);

/**
 * Chords the browser keeps no matter what. Listed so the reason is written down once and the UI
 * can tell the player the truth instead of pretending the game will catch them.
 */
export const RESERVED_BY_BROWSER: readonly string[] = ["KeyW", "KeyT", "KeyN", "KeyQ", "Tab"];

/**
 * Modifier keys that turn an ordinary movement key into a browser shortcut the page CANNOT refuse.
 *
 * This is the difference between an annoyance and losing the match: bind crouch to Ctrl and
 * crouch-walking forward is Ctrl+W, which closes the tab. Ctrl+T and Ctrl+N open one. None of the
 * three can be stopped by `preventDefault`; only Keyboard Lock reaches them, and only on Chromium
 * while fullscreen. So the UI warns instead of pretending.
 */
export const RISKY_MODIFIER_CODES: readonly string[] = ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight"];

/**
 * What binding `code` to a held action costs, or null when it costs nothing.
 *
 * Only HELD actions matter: a modifier you tap (reload, inspect) never overlaps another key, but
 * one you hold while moving combines with W / T / N and takes the tab with it.
 */
export function modifierBindingWarning(code: string): string | null {
  if (!RISKY_MODIFIER_CODES.includes(code)) return null;
  const key = code.startsWith("Meta") ? "Cmd" : "Ctrl";
  return `Holding ${key} while you move makes ${key}+W, ${key}+T and ${key}+N — the browser keeps those, and ${key}+W closes the tab. Fullscreen on Chrome or Edge can capture them; nothing else can.`;
}

/** True when the event came from somewhere a person is typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as Partial<HTMLElement> & { tagName?: string; isContentEditable?: boolean; type?: string };
  if (el.isContentEditable) return true;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    // Buttons and checkboxes are not text fields; Space on them is the browser's, not the game's,
    // but they do not swallow WASD either. Treat only value-bearing inputs as editable.
    const type = (el.type ?? "text").toLowerCase();
    return type !== "button" && type !== "submit" && type !== "reset" && type !== "checkbox" && type !== "radio";
  }
  return false;
}

export interface ChordContext {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Every key the bindings mention, flattened once so the hot path is a set lookup. */
export function boundCodes(bindings: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const codes of Object.values(bindings)) for (const c of codes) out.add(c);
  return out;
}

/**
 * Should the game call `preventDefault()` on this keydown?
 *
 * `active` means: input enabled, pointer locked, nobody typing. Only then does the game own keys.
 */
export function shouldPreventDefault(e: ChordContext, bound: ReadonlySet<string>, active: boolean): boolean {
  if (!active) return false;
  const mod = e.ctrlKey || e.metaKey;
  // A modifier chord: take it only if we can, and only if the base key is one the game uses or a
  // chord that would visibly interrupt the match. Alt chords are left alone (Alt+F4, window menu).
  if (mod) return INTERCEPTABLE_CHORDS.has(e.code) && !e.altKey;
  if (e.altKey) return false;
  // No modifier: the game owns every key it binds, plus the ones with page-level defaults
  // (Space scrolls, Tab moves focus, / and ' open quick-find in Firefox, F1..F4 are unclaimed).
  if (bound.has(e.code)) return true;
  return e.code === "Space" || e.code === "Tab" || e.code === "Slash" || e.code === "Quote" || e.code === "Backquote";
}
