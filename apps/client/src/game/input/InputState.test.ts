import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Btn } from "@frankibarber/shared";
import { DEFAULT_BINDINGS, InputState } from "./InputState";

describe("game input transitions", () => {
  let input: InputState;
  let win: EventTarget;
  let canvas: EventTarget;

  function emit(target: EventTarget, type: string, values: Record<string, unknown> = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, values);
    target.dispatchEvent(event);
  }

  beforeEach(() => {
    win = new EventTarget();
    canvas = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", new EventTarget());
    input = new InputState();
    input.attach(canvas as HTMLElement);
    input.pointerLocked = true;
  });

  afterEach(() => {
    input.detach();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blocks fire, camera, marks and weapon cycling while chatting", () => {
    input.typing = true;
    emit(canvas, "pointerdown", { button: 0, pointerType: "mouse" });
    emit(win, "pointermove", { buttons: 7, movementX: 20, movementY: 10 });
    emit(canvas, "wheel", { deltaY: 100 });
    expect(input.buttons()).toBe(0);
    expect([input.mouseDX, input.mouseDY, input.wheelDelta]).toEqual([0, 0, 0]);
    expect(input.markRequested).toBe(false);
    input.typing = false;
    expect(input.buttons()).toBe(0);
  });

  it("marks once when middle mouse is pressed while aiming", () => {
    emit(canvas, "pointerdown", { button: 2, pointerType: "mouse" });
    emit(win, "pointermove", { buttons: 6, movementX: 0, movementY: 0 });
    expect(input.markRequested).toBe(true);
    expect(input.buttons() & Btn.Aim).toBe(Btn.Aim);
    input.markRequested = false;
    emit(win, "pointermove", { buttons: 6, movementX: 1, movementY: 0 });
    expect(input.markRequested).toBe(false);
  });

  it("still supports firing while the aim button is held", () => {
    emit(canvas, "pointerdown", { button: 2, pointerType: "mouse" });
    emit(win, "pointermove", { buttons: 3, movementX: 0, movementY: 0 });
    expect(input.buttons() & (Btn.Fire | Btn.Aim)).toBe(Btn.Fire | Btn.Aim);
  });

  // Drop B, matrix rule S2. Shift under a held aim used to cancel the aim unconditionally, which
  // made the SR-50's breath hold unreachable: the HUD read "SHIFT · HOLD BREATH" and Shift took you
  // out of the scope. Sprint only means anything with a forward key and no crouch, so that is
  // exactly when it may take the aim.
  it("keeps the aim when Shift is a breath hold, and drops it when Shift is a sprint", () => {
    const aim = () => input.buttons() & Btn.Aim;
    emit(canvas, "pointerdown", { button: 2, pointerType: "mouse" });
    emit(win, "pointermove", { buttons: 2, movementX: 0, movementY: 0 });
    expect(aim()).toBe(Btn.Aim);

    // Standing still: Shift steadies the shot and the sight picture stays.
    emit(win, "keydown", { code: "ShiftLeft" });
    expect(aim()).toBe(Btn.Aim);
    expect(input.buttons() & Btn.Sprint).toBe(Btn.Sprint);

    // Now the player asks to move under it: that is a run, so the scope goes.
    emit(win, "keydown", { code: "KeyW" });
    expect(aim()).toBe(0);
  });

  it("drops the aim when the sprint arrives after the forward key too", () => {
    emit(canvas, "pointerdown", { button: 2, pointerType: "mouse" });
    emit(win, "pointermove", { buttons: 2, movementX: 0, movementY: 0 });
    emit(win, "keydown", { code: "KeyW" });
    expect(input.buttons() & Btn.Aim).toBe(Btn.Aim); // walking while aimed is fine
    emit(win, "keydown", { code: "ShiftLeft" });
    expect(input.buttons() & Btn.Aim).toBe(0);
  });

  it("does not treat a crouched Shift as a sprint, so a crouched aim survives it", () => {
    emit(canvas, "pointerdown", { button: 2, pointerType: "mouse" });
    emit(win, "pointermove", { buttons: 2, movementX: 0, movementY: 0 });
    // The crouch KEY, not a hard-coded Ctrl: crouch moved to C (Ctrl+W closed the tab), and this
    // test is about crouch-plus-Shift, not about which keycap crouch happens to live on.
    emit(win, "keydown", { code: DEFAULT_BINDINGS.crouch[0] });
    emit(win, "keydown", { code: "KeyW" });
    emit(win, "keydown", { code: "ShiftLeft" });
    expect(input.buttons() & Btn.Aim).toBe(Btn.Aim);
  });

  it("discards queued actions on focus loss but releases a cooked grenade", () => {
    for (const code of ["KeyW", "KeyB", "KeyF", "KeyG", "KeyR", "Enter", "Escape", "Digit1"]) {
      emit(win, "keydown", { code, repeat: false });
    }
    emit(canvas, "pointerdown", { button: 1, pointerType: "mouse" });
    emit(win, "blur");
    expect(input.buttons()).toBe(0);
    expect(input.slotRequests).toEqual([]);
    expect(input.chatOpenRequested).toBeNull();
    expect([
      input.shopToggleRequested, input.inspectRequested, input.escapeRequested,
      input.markRequested, input.reloadRequested, input.lethalHeld,
    ]).toEqual([false, false, false, false, false, false]);
    expect(input.lethalReleased).toBe(true);
  });

  it("does not treat a sprint before focus loss as the first half of a double tap", () => {
    vi.spyOn(performance, "now").mockReturnValue(100);
    emit(win, "keydown", { code: "ShiftLeft", repeat: false });
    emit(win, "blur");
    emit(win, "keydown", { code: "ShiftLeft", repeat: false });
    expect(input.buttons() & Btn.Sprint).toBe(Btn.Sprint);
    expect(input.buttons() & Btn.Tac).toBe(0);
    emit(win, "keyup", { code: "ShiftLeft" });
    emit(win, "keydown", { code: "ShiftLeft", repeat: false });
    expect(input.buttons() & Btn.Tac).toBe(Btn.Tac);
  });

  it("reports no buttons at all while the pointer is unlocked (the pause menu really pauses)", () => {
    emit(win, "keydown", { code: "KeyW" });
    expect(input.buttons() & Btn.Forward).toBe(Btn.Forward);
    // Escape: the browser releases the lock and the pause card comes up.
    input.pointerLocked = false;
    expect(input.buttons()).toBe(0);
    // A key pressed WHILE paused must not bank movement for the moment play resumes either.
    emit(win, "keydown", { code: "KeyA" });
    input.pointerLocked = true;
    expect(input.buttons() & Btn.Left).toBe(Btn.Left);
  });

  /** `Event.target` is a read-only getter, so a fake source has to be defined, not assigned. */
  function keydown(values: Record<string, unknown>, target?: unknown) {
    const e = new Event("keydown", { cancelable: true });
    Object.assign(e, values);
    if (target !== undefined) Object.defineProperty(e, "target", { value: target, configurable: true });
    win.dispatchEvent(e);
    return e;
  }

  it("leaves a keystroke aimed at a text field to the text field", () => {
    // Typing a nickname containing "b" used to toggle the buy menu, and Tab could not move between
    // form fields: the shop key is read before the `enabled` check, so only a target test stops it.
    const field = { tagName: "INPUT", type: "text" };
    keydown({ code: "KeyW" }, field);
    keydown({ code: "KeyB" }, field);
    keydown({ code: "Tab" }, field);
    expect(input.buttons()).toBe(0);
    expect(input.shopToggleRequested).toBe(false);
    expect(input.scoreboardHeld).toBe(false);
  });

  it("takes Ctrl+D away from the browser while playing and gives it back when not", () => {
    // Crouch is Ctrl and strafe-right is D, so crouch-strafing right IS Ctrl+D.
    expect(keydown({ code: "KeyD", ctrlKey: true }).defaultPrevented).toBe(true);
    input.pointerLocked = false;
    expect(keydown({ code: "KeyD", ctrlKey: true }).defaultPrevented).toBe(false);
  });

});
