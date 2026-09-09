import { Btn } from "@frankibarber/shared";
import { boundCodes, isEditableTarget, shouldPreventDefault } from "./browserKeys";

export interface KeyBindings {
  forward: string[];
  back: string[];
  left: string[];
  right: string[];
  jump: string[];
  sprint: string[];
  crouch: string[];
  reload: string[];
  scoreboard: string[];
  lastWeapon: string[];
  /** Lethal grenade: hold to cook (frag), release to throw. */
  lethal: string[];
  /** Tactical grenade (flash / smoke): press to throw. */
  tactical: string[];
  /** Buy menu toggle. */
  shop: string[];
  /** Clippers (melee) — equips slot 3. */
  melee: string[];
  /** Inspect the weapon. */
  inspect: string[];
  /** Lean left / right (drop 4). */
  leanLeft: string[];
  leanRight: string[];
}

export const DEFAULT_BINDINGS: KeyBindings = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  sprint: ["ShiftLeft", "ShiftRight"],
  /**
   * C AND Ctrl, because that is how people actually play, and the reason Ctrl was taken out is now
   * handled rather than avoided.
   *
   * The danger was never Ctrl+D (bookmark) — `browserKeys.ts` intercepts that and everything like it.
   * It was Ctrl+W: crouch-walking forward on a Ctrl bind IS Ctrl+W, and `preventDefault()` cannot
   * stop the browser closing the tab. Two things now stand between a player and that:
   *
   *  - Keyboard Lock (`immersion.ts`) captures W, T and N outright — Chromium, fullscreen, which is
   *    where most people play. Nothing reaches the browser at all.
   *  - `unloadGuard.ts` everywhere else: a slipped Ctrl+W asks "leave site?" instead of ending the
   *    match. That is the difference between an annoyance and losing a round, and it works in every
   *    browser.
   *
   * Both keys are listed so neither camp has to rebind anything, and the controls screen still says
   * plainly what Ctrl costs outside fullscreen.
   */
  crouch: ["KeyC", "ControlLeft", "ControlRight"],
  reload: ["KeyR"],
  scoreboard: ["Tab"],
  // Drop 4: Q/E lean (owner decision), so "last weapon" moves to X.
  lastWeapon: ["KeyX"],
  lethal: ["KeyG"],
  tactical: ["Digit4"],
  shop: ["KeyB"],
  melee: ["KeyV"],
  inspect: ["KeyF"],
  leanLeft: ["KeyQ"],
  leanRight: ["KeyE"],
};

/** Two sprint presses within this window latch the tactical sprint (drop 4). */
const TAC_DOUBLE_TAP_MS = 320;

/** Keyboard weapon slots: 1 = primary, 2 = sidearm (3 reserved for melee in a later drop). */
const WEAPON_SLOT_KEYS = 3;

/** Minimum gap between two wheel-driven weapch switches (a single notch often fires several events). */
const WHEEL_THROTTLE_MS = 80;

/**
 * Raw input capture. Keyboard/mouse state is polled by the game loop; one-shot
 * events (weapon slot, wheel, reload, last weapon) are queued and drained once per frame.
 * Mouse look deltas accumulate between frames and are consumed by the local player.
 *
 * Robustness rules: key repeat is ignored, Tab never reaches the page, window blur / tab hide /
 * pointer-lock loss release every held key and button, wheel is throttled, Escape is only
 * reported while locked (so the lock is left exactly once).
 */
export class InputState {
  private keys = new Set<string>();
  private mouseButtons = 0;
  mouseDX = 0;
  mouseDY = 0;
  scoreboardHeld = false;
  /** Queued one-shot actions. */
  slotRequests: number[] = [];
  wheelDelta = 0;
  reloadRequested = false;
  /** "Last weapon" (Q) pressed since the last drain. Consumed by the WeaponController. */
  lastWeaponRequested = false;
  /** Lethal key state: `lethalHeld` while down (cooking), `lethalReleased` once on key-up. */
  lethalHeld = false;
  lethalReleased = false;
  /** Tactical key pressed since the last drain. */
  tacticalRequested = false;
  /** Shop key (B) pressed since the last drain — also reported while the pointer is unlocked. */
  shopToggleRequested = false;
  inspectRequested = false;
  escapeRequested = false;
  pointerLocked = false;
  enabled = true;
  /**
   * Tactical sprint latch (drop 4): set by a double-tap on sprint, cleared when sprint is released.
   * The local player also clears it when the budget runs dry (so the bit drops and the refill starts).
   */
  tacLatched = false;
  /**
   * Drop 5: while the chat box is open every key belongs to it — nothing here reacts (not even B or
   * Tab). The game sets it; the chat component owns Enter / Escape.
   */
  typing = false;
  /** Enter (all) / Y (team) pressed while locked: open the chat box. Drained by the game. */
  chatOpenRequested: "all" | "team" | null = null;
  /** Middle mouse pressed while locked: mark / ping. Drained by the game. */
  markRequested = false;

  private target: HTMLElement | null = null;
  private bindings: KeyBindings = DEFAULT_BINDINGS;
  private bound = boundCodes(DEFAULT_BINDINGS as unknown as Record<string, string[]>);
  private lastWheelAt = -Infinity;
  private lastSprintDownAt = -Infinity;
  /**
   * Sprint pressed while aiming cancels the aim until the aim button is released; aim pressed
   * while sprinting wins over sprint (the simulation gives Aim priority). Order matters, and only
   * the raw event stream knows it, so it is resolved here.
   */
  private aimSuppressed = false;

  /** 2.1: rebinding. Held keys are released, so a key that changed meaning mid-press cannot stick. */
  setBindings(b: KeyBindings): void {
    this.bindings = b;
    this.bound = boundCodes(b as unknown as Record<string, string[]>);
    this.keys.clear();
    this.tacLatched = false;
  }

  /**
   * The game owns the keyboard only while it is actually being played. Outside this, Ctrl+D
   * bookmarks the page and Tab moves between buttons, exactly as a player expects of a web page.
   */
  get ownsKeyboard(): boolean { return this.enabled && this.pointerLocked && !this.typing; }

  get currentBindings(): KeyBindings { return this.bindings; }

  attach(target: HTMLElement): void {
    this.target = target;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    // Pointer events, not mouse events: Babylon cancels pointerdown on the canvas, which
    // suppresses the browser's compatibility mousedown/mouseup.
    target.addEventListener("pointerdown", this.onMouseDown);
    window.addEventListener("pointerup", this.onMouseUp);
    window.addEventListener("pointercancel", this.onMouseUp);
    window.addEventListener("pointermove", this.onMouseMove);
    target.addEventListener("wheel", this.onWheel, { passive: true });
    target.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.target?.removeEventListener("pointerdown", this.onMouseDown);
    window.removeEventListener("pointerup", this.onMouseUp);
    window.removeEventListener("pointercancel", this.onMouseUp);
    window.removeEventListener("pointermove", this.onMouseMove);
    this.target?.removeEventListener("wheel", this.onWheel);
    this.target?.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.target = null;
  }

  requestPointerLock(): void {
    void this.requestPointerLockAsync();
  }

  /**
   * Resolves to whether the pointer actually ended up locked, so the Play button can offer a retry
   * instead of dropping the player into a game that does not respond to the mouse. Chrome rejects
   * the request outright for a short while after the user pressed Escape to leave a lock.
   */
  async requestPointerLockAsync(): Promise<boolean> {
    if (!this.target) return false;
    if (this.pointerLocked) return true;
    const el = this.target as HTMLElement & { requestPointerLock: (o?: { unadjustedMovement?: boolean }) => Promise<void> | void };
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof (p as Promise<void>).then === "function") await p;
    } catch {
      // `unadjustedMovement` is not supported everywhere; the plain call is the fallback.
      try {
        const p = (el.requestPointerLock as () => Promise<void> | void)();
        if (p && typeof (p as Promise<void>).then === "function") await p;
      } catch { return false; }
    }
    // Some browsers resolve the promise before firing pointerlockchange.
    if (!this.pointerLocked) this.pointerLocked = document.pointerLockElement === this.target;
    return this.pointerLocked;
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private isDown(codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  get objectiveHeld(): boolean { return this.enabled && this.pointerLocked && !this.typing && this.keys.has("KeyT"); }

  /** Packs the current state into the shared button bitmask. */
  buttons(): number {
    // No pointer lock means a menu, the pause card or the shop is up. Movement was NOT gated on it
    // before: only Fire and Aim were, so W held over the pause menu walked the character out of
    // cover while the player thought the game was stopped. `clearAll()` on lock loss releases keys
    // held at that instant but cannot stop new presses, so the gate has to be here.
    if (!this.enabled || this.typing || !this.pointerLocked) return 0;
    const b = this.bindings;
    let m = 0;
    if (this.isDown(b.forward)) m |= Btn.Forward;
    if (this.isDown(b.back)) m |= Btn.Back;
    if (this.isDown(b.left)) m |= Btn.Left;
    if (this.isDown(b.right)) m |= Btn.Right;
    if (this.isDown(b.jump)) m |= Btn.Jump;
    if (this.isDown(b.sprint)) m |= Btn.Sprint;
    if (this.isDown(b.crouch)) m |= Btn.Crouch;
    if (this.pointerLocked && (this.mouseButtons & 1)) m |= Btn.Fire;
    if (this.pointerLocked && (this.mouseButtons & 4) && !this.aimSuppressed) m |= Btn.Aim;
    // Drop 4: lean keys and the tactical latch (only meaningful together with sprint; the sim checks).
    if (this.isDown(b.leanLeft)) m |= Btn.LeanL;
    if (this.isDown(b.leanRight)) m |= Btn.LeanR;
    if (this.tacLatched && (m & Btn.Sprint)) m |= Btn.Tac;
    return m;
  }

  /** Returns accumulated mouse deltas and clears them. */
  consumeMouse(out: { dx: number; dy: number }): void {
    out.dx = this.mouseDX; out.dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
  }

  clearAll(): void {
    this.keys.clear();
    this.mouseButtons = 0;
    this.aimSuppressed = false;
    this.mouseDX = this.mouseDY = 0;
    this.slotRequests.length = 0;
    this.wheelDelta = 0;
    this.reloadRequested = false;
    this.lastWeaponRequested = false;
    // A grenade being cooked when focus is lost is released (the game throws it) rather than
    // held forever with nobody able to let go.
    if (this.lethalHeld) this.lethalReleased = true;
    this.lethalHeld = false;
    this.tacticalRequested = false;
    this.shopToggleRequested = false;
    this.inspectRequested = false;
    this.escapeRequested = false;
    this.chatOpenRequested = null;
    this.markRequested = false;
    this.scoreboardHeld = false;
    this.tacLatched = false;
    this.lastSprintDownAt = -Infinity;
    this.lastWheelAt = -Infinity;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // A keystroke aimed at a text field is never the game's — chat, the nickname box and the
    // rebind capture keep Ctrl+A/C/V, Tab and every letter. (Before this guard, typing a nickname
    // containing "b" toggled the buy menu, and Tab could not move between form fields.)
    if (isEditableTarget(e.target)) return;
    if (this.typing) return;
    // Decide the browser's fate for this exact chord before anything else consumes the event.
    if (shouldPreventDefault(e, this.bound, this.ownsKeyboard)) e.preventDefault();
    if (e.code === "Tab") { if (this.enabled && this.pointerLocked) this.scoreboardHeld = true; return; }
    if (this.enabled && this.pointerLocked && !e.repeat && (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "KeyY")) {
      this.chatOpenRequested = e.code === "KeyY" ? "team" : "all";
      e.preventDefault();
      return;
    }
    // The shop key works with or without pointer lock and while input is disabled (the menu
    // itself disables input and releases the lock; B must still close it).
    if (this.bindings.shop.includes(e.code)) { if (!e.repeat) this.shopToggleRequested = true; return; }
    if (!this.enabled) return;
    if (e.code === "Escape") {
      // Reported once per press. The browser releases the pointer lock itself on Escape, so by the
      // time this runs `pointerLocked` may already be false — the game still needs to know, because
      // Escape opens the pause menu. Keyboard lock (fullscreen, Chromium) delivers it here first.
      if (!e.repeat) this.escapeRequested = true;
      return;
    }
    if (e.repeat) return;
    const b = this.bindings;
    if (e.code.startsWith("Digit") && !b.tactical.includes(e.code)) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= WEAPON_SLOT_KEYS) this.slotRequests.push(n);
    }
    if (b.melee.includes(e.code)) this.slotRequests.push(3);
    if (b.inspect.includes(e.code) && this.pointerLocked) this.inspectRequested = true;
    if (b.reload.includes(e.code)) this.reloadRequested = true;
    if (b.lastWeapon.includes(e.code)) this.lastWeaponRequested = true;
    if (b.lethal.includes(e.code) && this.pointerLocked) this.lethalHeld = true;
    if (b.tactical.includes(e.code) && this.pointerLocked) this.tacticalRequested = true;
    // Sprint drops the aim — but only when it would actually BE a sprint. `sprintActive` needs
    // Forward and no crouch, so Shift pressed standing still was never going to run anywhere; it
    // still cancelled the aim, which meant the SR-50's breath hold could not be reached at all:
    // the HUD said "SHIFT · HOLD BREATH" and Shift took you out of the scope instead. Now Shift
    // while stationary keeps the sight picture (and holds the breath), and Shift under a forward
    // key is a request to run, which is what matrix rule S2 asked for.
    if (b.sprint.includes(e.code) && (this.mouseButtons & 4) && this.isDown(b.forward) && !this.isDown(b.crouch)) this.aimSuppressed = true;
    // The same request arriving in the other order: breath already held, now the player asks to move.
    if (b.forward.includes(e.code) && (this.mouseButtons & 4) && this.isDown(b.sprint) && !this.isDown(b.crouch)) this.aimSuppressed = true;
    if (b.sprint.includes(e.code)) {
      const now = performance.now();
      if (now - this.lastSprintDownAt < TAC_DOUBLE_TAP_MS) this.tacLatched = true;
      this.lastSprintDownAt = now;
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (isEditableTarget(e.target)) return;
    if (this.typing) return;
    if (e.code === "Tab") { if (this.ownsKeyboard) e.preventDefault(); this.scoreboardHeld = false; return; }
    if (this.bindings.lethal.includes(e.code) && this.lethalHeld) { this.lethalHeld = false; this.lethalReleased = true; }
    if (this.bindings.sprint.includes(e.code)) this.tacLatched = false;
    this.keys.delete(e.code);
  };

  private onBlur = (): void => { this.clearAll(); };
  private onVisibility = (): void => { if (document.visibilityState === "hidden") this.clearAll(); };

  private onMouseDown = (e: PointerEvent): void => {
    if (!this.enabled || this.typing || e.pointerType === "touch") return;
    if (!this.pointerLocked) { this.requestPointerLock(); return; }
    this.mouseButtons |= 1 << e.button;
    if (e.button === 2) this.aimSuppressed = false; // a fresh aim press always aims (and cancels sprint in the sim)
    if (e.button === 1) this.markRequested = true;   // drop 5: middle mouse = mark / ping
    e.preventDefault();
  };

  private onMouseUp = (e: PointerEvent): void => {
    this.mouseButtons &= ~(1 << e.button);
    if (e.button === 2) this.aimSuppressed = false;
  };

  private onMouseMove = (e: PointerEvent): void => {
    if (!this.pointerLocked || !this.enabled || this.typing) return;
    // MEASURED (1.0 beta playtest: "can't shoot while aiming"): Pointer Events fire `pointerdown`
    // only when the FIRST button goes down. A chorded press (LMB while RMB is held) arrives as a
    // `pointermove` with a changed `buttons` mask, so the fire bit never set. Sync from `buttons`
    // here. Note the two encodings differ: `buttons` is L=1, R=2, M=4; `1 << button` is L=1, M=2, R=4.
    const chord = (e.buttons & 1) | ((e.buttons & 2) ? 4 : 0) | ((e.buttons & 4) ? 2 : 0);
    if (chord !== this.mouseButtons) {
      if ((chord & 4) && !(this.mouseButtons & 4)) this.aimSuppressed = false;
      if ((chord & 2) && !(this.mouseButtons & 2)) this.markRequested = true;
      this.mouseButtons = chord;
    }
    // Clamp absurd deltas (some browsers emit a spike right after locking).
    const dx = Math.max(-300, Math.min(300, e.movementX));
    const dy = Math.max(-300, Math.min(300, e.movementY));
    this.mouseDX += dx; this.mouseDY += dy;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.pointerLocked || !this.enabled || this.typing || e.deltaY === 0) return;
    const now = performance.now();
    if (now - this.lastWheelAt < WHEEL_THROTTLE_MS) return;
    this.lastWheelAt = now;
    this.wheelDelta = Math.sign(e.deltaY); // one switch per notch, never several per frame
  };

  private onContextMenu = (e: Event): void => { e.preventDefault(); };

  private onLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.target;
    // Losing the lock means a menu or the browser took over: nothing may stay held.
    if (!this.pointerLocked) this.clearAll();
  };
}
