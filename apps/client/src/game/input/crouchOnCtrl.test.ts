import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BINDINGS } from "./InputState";
import { INTERCEPTABLE_CHORDS, RESERVED_BY_BROWSER, boundCodes, modifierBindingWarning, shouldPreventDefault } from "./browserKeys";
import { LOCKED_CODES } from "./immersion";
import { guardUnload, isUnloadGuarded, releaseUnloadGuard } from "./unloadGuard";

/**
 * Crouch is on Ctrl again — players asked for it back, having been given C instead.
 *
 * The reason it was taken away is real and has not gone anywhere: crouch-walking forward on a Ctrl
 * bind is Ctrl+W, and no page can stop the browser closing the tab on Ctrl+W. What changed is that
 * the two things which CAN help are both in place, so these tests are about them being in place, not
 * about a promise that Ctrl+W is harmless.
 */
describe("crouch on Ctrl", () => {
  it("is bound by default, alongside C, so neither camp has to rebind", () => {
    expect(DEFAULT_BINDINGS.crouch).toContain("KeyC");
    expect(DEFAULT_BINDINGS.crouch).toContain("ControlLeft");
    expect(DEFAULT_BINDINGS.crouch).toContain("ControlRight");
  });

  it("keeps the chords a page CAN refuse away from the browser while the game is being played", () => {
    const bound = boundCodes(DEFAULT_BINDINGS as unknown as Record<string, string[]>);
    // The originally reported bug: crouch (Ctrl) + strafe right (D) opened "add bookmark" mid-round.
    expect(shouldPreventDefault({ code: "KeyD", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, bound, true)).toBe(true);
    // Every chord we claim to intercept, actually intercepted.
    for (const code of INTERCEPTABLE_CHORDS) {
      expect(shouldPreventDefault({ code, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, bound, true), code).toBe(true);
    }
    // And none of it while the player is in a menu or typing: there the page is a page.
    expect(shouldPreventDefault({ code: "KeyD", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, bound, false)).toBe(false);
  });

  it("asks Keyboard Lock for every chord that could interrupt a match", () => {
    // Locking is the only mechanism that reaches the reserved chords, so it must at least ask for
    // them; asking for the interceptable ones too means a fullscreen Chromium player never depends on
    // `preventDefault` timing at all.
    for (const code of RESERVED_BY_BROWSER) expect(LOCKED_CODES, code).toContain(code);
    for (const code of INTERCEPTABLE_CHORDS) expect(LOCKED_CODES, code).toContain(code);
    expect(LOCKED_CODES).toContain("Escape");            // the pause menu
    expect(new Set(LOCKED_CODES).size, "duplicates").toBe(LOCKED_CODES.length);
  });

  it("still tells the truth about what Ctrl costs where locking is unavailable", () => {
    const warning = modifierBindingWarning("ControlLeft");
    expect(warning).toBeTruthy();
    expect(warning).toContain("Ctrl+W");
    expect(modifierBindingWarning("MetaLeft")).toContain("Cmd+W");
    expect(modifierBindingWarning("KeyC"), "an ordinary key costs nothing").toBeNull();
  });
});

describe("the unload guard", () => {
  /** A window stand-in that records what was added and removed. */
  const fakeWindow = () => {
    const listeners: string[] = [];
    return {
      listeners,
      addEventListener: vi.fn((type: string, _fn?: unknown) => { listeners.push(type); void _fn; }),
      removeEventListener: vi.fn((type: string) => { const i = listeners.indexOf(type); if (i >= 0) listeners.splice(i, 1); }),
    };
  };

  it("arms and disarms exactly once, however often it is asked", () => {
    const w = fakeWindow();
    releaseUnloadGuard(w);
    expect(isUnloadGuarded()).toBe(false);
    guardUnload(true, w);
    guardUnload(true, w);
    guardUnload(true, w);
    expect(isUnloadGuarded()).toBe(true);
    expect(w.addEventListener).toHaveBeenCalledTimes(1);
    expect(w.listeners).toEqual(["beforeunload"]);
    guardUnload(false, w);
    guardUnload(false, w);
    expect(isUnloadGuarded()).toBe(false);
    expect(w.removeEventListener).toHaveBeenCalledTimes(1);
    expect(w.listeners, "left a listener on the page after the match").toEqual([]);
  });

  it("is off until a match arms it, so the menu behaves like a page", () => {
    const w = fakeWindow();
    releaseUnloadGuard(w);
    expect(isUnloadGuarded()).toBe(false);
    expect(w.listeners).toEqual([]);
  });

  it("cancels the event the way both the old and the current API want", () => {
    const w = fakeWindow();
    releaseUnloadGuard(w);
    let captured: ((e: BeforeUnloadEvent) => void) | null = null;
    w.addEventListener.mockImplementation((type: string, fn?: unknown) => { captured = fn as (e: BeforeUnloadEvent) => void; void type; });
    guardUnload(true, w);
    expect(captured).toBeTruthy();
    const e = { preventDefault: vi.fn(), returnValue: undefined as unknown } as unknown as BeforeUnloadEvent;
    captured!(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.returnValue).toBe("");
    releaseUnloadGuard(w);
  });
});
