import { describe, expect, it } from "vitest";
import { DEFAULT_BINDINGS } from "./InputState";
import { boundCodes, isEditableTarget, shouldPreventDefault, INTERCEPTABLE_CHORDS } from "./browserKeys";

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
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "Tab", "KeyB", "KeyV", "ControlLeft"]) {
      expect(shouldPreventDefault(chord(code), bound, true), code).toBe(true);
    }
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
