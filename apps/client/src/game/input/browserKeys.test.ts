import { describe, expect, it } from "vitest";
import { DEFAULT_BINDINGS } from "./InputState";
import { boundCodes, isEditableTarget, modifierBindingWarning, shouldPreventDefault, INTERCEPTABLE_CHORDS } from "./browserKeys";

const bound = boundCodes(DEFAULT_BINDINGS as unknown as Record<string, string[]>);
const chord = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

/** A stand-in for an element, so the guard is tested without a DOM. */
const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as EventTarget;

describe("browser shortcut interception", () => {
  it("takes Ctrl+D away from the browser while the game is being played", () => {
    // The reported bug: crouch is Ctrl, strafe-right is D, so crouch-strafing bookmarks the page.
    expect(shouldPreventDefault(chord("KeyD", { ctrlKey: true }), bound, true)).toBe(true);
    expect(shouldPreventDefault(chord("KeyD", { metaKey: true }), bound, true)).toBe(true);
  });

  it("covers every chord a Ctrl-crouching player can hit with WASD and the digits", () => {
    for (const code of ["KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyG", "KeyE", "KeyB", "KeyP", "Digit1", "Digit4"]) {
      expect(INTERCEPTABLE_CHORDS.has(code), code).toBe(true);
      expect(shouldPreventDefault(chord(code, { ctrlKey: true }), bound, true), code).toBe(true);
    }
  });

  it("gives the keyboard back the moment the game is not being played", () => {
    // Menus, chat, the scoreboard with the pointer released: the page behaves like a page.
    expect(shouldPreventDefault(chord("KeyD", { ctrlKey: true }), bound, false)).toBe(false);
    expect(shouldPreventDefault(chord("Tab"), bound, false)).toBe(false);
    expect(shouldPreventDefault(chord("KeyW"), bound, false)).toBe(false);
  });

  it("holds every bound key and the page-scrolling keys during play", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "Tab", "KeyB", "KeyV", "KeyC"]) {
      expect(shouldPreventDefault(chord(code), bound, true), code).toBe(true);
    }
    // Ctrl is bound (crouch), but the browser sets `ctrlKey` on the Ctrl keydown ITSELF, so that
    // event is a modifier chord with no base key and there is nothing to refuse: a bare Ctrl press
    // does nothing in any browser. Cancelling it was the original bug — the shortcut fires on the
    // D keydown while Ctrl is held, not on the Ctrl press — so leaving it alone is the fix, not a gap.
    expect(shouldPreventDefault(chord("ControlLeft", { ctrlKey: true }), bound, true)).toBe(false);
  });

  it("never touches an Alt chord — Alt+F4 and the window menu belong to the OS", () => {
    expect(shouldPreventDefault(chord("KeyD", { altKey: true }), bound, true)).toBe(false);
    expect(shouldPreventDefault(chord("KeyD", { ctrlKey: true, altKey: true }), bound, true)).toBe(false);
    expect(shouldPreventDefault(chord("F4", { altKey: true }), bound, true)).toBe(false);
  });

  it("leaves unbound keys with no page default alone", () => {
    expect(shouldPreventDefault(chord("F5"), bound, true)).toBe(false);
    expect(shouldPreventDefault(chord("F12"), bound, true)).toBe(false);
    expect(shouldPreventDefault(chord("KeyM"), bound, true)).toBe(false);
  });

  it("follows a rebind: a key that becomes bound becomes the game's", () => {
    expect(shouldPreventDefault(chord("KeyM"), bound, true)).toBe(false);
    const rebound = boundCodes({ ...DEFAULT_BINDINGS, melee: ["KeyM"] } as unknown as Record<string, string[]>);
    expect(shouldPreventDefault(chord("KeyM"), rebound, true)).toBe(true);
  });
});

describe("text fields keep their keystrokes", () => {
  it("recognises the places a person types", () => {
    expect(isEditableTarget(el("INPUT"))).toBe(true);
    expect(isEditableTarget(el("input", { type: "text" }))).toBe(true);
    expect(isEditableTarget(el("INPUT", { type: "password" }))).toBe(true);
    expect(isEditableTarget(el("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(el("SELECT"))).toBe(true);
    expect(isEditableTarget(el("DIV", { isContentEditable: true }))).toBe(true);
  });

  it("does not treat buttons, checkboxes or the canvas as text fields", () => {
    expect(isEditableTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isEditableTarget(el("INPUT", { type: "range" }))).toBe(true); // value-bearing: arrows are its own
    expect(isEditableTarget(el("BUTTON"))).toBe(false);
    expect(isEditableTarget(el("CANVAS"))).toBe(false);
    expect(isEditableTarget(el("DIV"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

/**
 * These three used to assert the opposite, and the reversal is the OWNER'S CALL, not a drift.
 *
 * The old contract was "no held action's default may be a modifier", because crouch-walking forward
 * on a Ctrl bind is Ctrl+W and no page can refuse Ctrl+W. That is still true. What changed is the
 * report from the people playing: a lot of them crouch on Ctrl, and moving the default to C did not
 * make them stop — it made them rebind, or lose the crouch they are used to. So Ctrl is back in the
 * default and the danger is MITIGATED instead of avoided: Keyboard Lock captures W/T/N outright in a
 * fullscreen Chromium, and `unloadGuard.ts` makes every other browser ask before it closes the tab.
 *
 * The tests kept their subject and changed their expectation, so that what is asserted is the
 * mitigation being present — see `crouchOnCtrl.test.ts` — rather than the risk being absent.
 */
describe("binds that cost the player a browser chord", () => {
  it("ships Ctrl for crouch, and C beside it", () => {
    expect(DEFAULT_BINDINGS.crouch).toContain("KeyC");
    expect(DEFAULT_BINDINGS.crouch).toContain("ControlLeft");
    expect(DEFAULT_BINDINGS.crouch).toContain("ControlRight");
  });

  it("puts a modifier on no held action other than crouch", () => {
    // Crouch is the one the players asked for. Everything else stays clear of Ctrl and Cmd, because
    // nothing else has a reason to pay the cost.
    const held = ["sprint", "forward", "back", "left", "right", "leanLeft", "leanRight"] as const;
    for (const a of held) {
      for (const code of DEFAULT_BINDINGS[a]) {
        expect(modifierBindingWarning(code), `${a} defaults to ${code}, which makes browser chords`).toBeNull();
      }
    }
  });

  it("warns about a modifier bind instead of pretending it is free", () => {
    expect(modifierBindingWarning("ControlLeft")).toMatch(/Ctrl\+W/);
    expect(modifierBindingWarning("MetaLeft")).toMatch(/Cmd\+W/);
    expect(modifierBindingWarning("KeyC")).toBeNull();
    expect(modifierBindingWarning("ShiftLeft"), "Shift makes no browser chord").toBeNull();
  });
});
