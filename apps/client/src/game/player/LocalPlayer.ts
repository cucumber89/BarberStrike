import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  Btn, LEAN, MatchPhase, PLAYER, TAC, WEAPONS, aimDirection, copyBody, createBody, dequantVel, eyeHeight, frozenAt, leanClearance, leanOf, maskInput, simulateBody, sprintActive, tacActive, wrapAngle,
  type BodyState, type CollisionWorld, type PlayerInput, type WeaponId,
} from "@frankibarber/shared";
import { BIPOD, bipodDeployed, feelOf, lookScale, type ScopeStyle } from "../combat/weaponFeel";
import type { InputState } from "../input/InputState";
import type { NetPlayer } from "../net/Connection";

interface PendingInput {
  input: PlayerInput;
  /** Predicted body state after applying this input. */
  after: BodyState;
}

export interface LookSettings {
  sensitivity: number; // radians per pixel * 1000
  invertY: boolean;
  fov: number; // degrees
  bobScale: number; // 0..1
  shakeScale: number; // 0..1
}

const MAX_PITCH = 1.5;
const tmpDir: [number, number, number] = [0, 0, 0];
/** Scope sway (drop 3): amplitude in radians, breath hold length and the winded penalty after it. */
const SCOPE = { sway: 0.0045, holdMs: 4000, refillPerMs: 0.5, windedMs: 2200, heldScale: 0.12, windedScale: 2.2 } as const;

/**
 * Locally controlled player: consumes raw input, predicts movement with the shared
 * simulation, keeps unacknowledged inputs for reconciliation and drives the FPS camera
 * (yaw/pitch, recoil, subtle bob, crouch height blending).
 */
export class LocalPlayer {
  readonly body: BodyState = createBody();
  readonly camera: TargetCamera;
  yaw = 0;
  pitch = 0;
  alive = false;
  weapon: WeaponId = "pistol";
  private seq = 0;
  private prevButtons = 0;
  private pending: PendingInput[] = [];
  private pool: PendingInput[] = [];
  private outbox: PlayerInput[] = [];
  private serverBody: BodyState = createBody();
  private bobPhase = 0;
  private eyeBlend = PLAYER.eyeHeight;
  /** Recoil offsets applied to the view (pitch up is negative). */
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilRecover = 8;
  private recoilHoldUntil = 0;
  /** ADS zoom blend 0..1. */
  private adsBlend = 0;
  /** Camera feel offsets (landing dip etc). */
  private landDip = 0;
  private wasGrounded = true;
  lastButtons = 0;
  /** Position sent with the last input, exposed for the debug overlay. */
  correctionCount = 0;
  /** Extra movement speed multiplier from perks (energy drink); set by the game from the replicated wallet. */
  speedScale: (sprinting: boolean) => number = () => 1;
  /** End of the mechanical action that took the sight picture away (matrix S1). */
  private actionUntil = 0;
  /** How long the body has been crouched and settled, for the LMG's bipod (matrix B1). */
  private stillMs = 0;
  // ---- scope (drop 3): the reticle drifts; Shift holds the breath for a few seconds.
  private swayYaw = 0;
  private swayPitch = 0;
  /** 0..1 breath left. */
  private breathLeft = 1;
  private windedUntil = 0;
  // ---- drop 4: lean (-1..1 incl. wall clearance, smoothed) and tactical sprint blend.
  private leanBlend = 0;
  private tacBlend = 0;
  private wasTac = false;
  /** Called when the tactical sprint starts / stops (feel hooks). */
  onTac: ((on: boolean) => void) | null = null;

  constructor(scene: Scene, private world: CollisionWorld, private input: InputState, public settings: LookSettings) {
    this.camera = new TargetCamera("fpsCam", new Vector3(0, PLAYER.eyeHeight, 0), scene);
    this.camera.minZ = 0.05;
    this.camera.maxZ = 200;
    this.camera.fov = (settings.fov * Math.PI) / 180;
    this.camera.inertia = 0;
    scene.activeCamera = this.camera;
  }

  spawnAt(x: number, y: number, z: number, yaw: number): void {
    const b = this.body;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.grounded = true; b.crouching = false; b.jumpCooldown = 0;
    this.yaw = yaw; this.pitch = 0;
    this.pending.length = 0;
    this.recoilPitch = this.recoilYaw = 0;
    this.clearWeaponState(); // a bolt owed by the body that just died is not owed by this one
    this.alive = true;
  }

  setFov(deg: number): void {
    this.settings.fov = deg;
  }

  /** 0 = hip, 1 = fully aimed. Presentation modules use it for the viewmodel pose. */
  get aimBlend(): number { return this.adsBlend; }

  /**
   * The uncountered recoil currently on the view (radians). Read by `weapon-signature.mjs` at the
   * instant of a shot: sampling the camera a frame later measures the renderer, not the weapon —
   * a pistol's kick is most of the way home before the next frame is drawn under SwiftShader.
   */
  get recoilOffset(): { pitch: number; yaw: number } { return { pitch: this.recoilPitch, yaw: this.recoilYaw }; }

  /** Applies mouse look. Called once per frame before simulation. */
  private applyLook(): void {
    const m = { dx: 0, dy: 0 };
    this.input.consumeMouse(m);
    // R1 (matrix): the zoom scales the sensitivity, so a centimetre of mouse covers the same arc of
    // the WORLD whatever the weapon. Without it the SR-50's 3.6x scope swept 3.6x more world per
    // centimetre than the hip did, which is why the scope felt uncontrollable rather than heavy.
    // Uses the same blend the FOV does, so the two can never disagree mid-transition.
    const s = this.settings.sensitivity * 0.001 * lookScale(WEAPONS[this.weapon].adsZoom, this.adsBlend);
    this.yaw = wrapAngle(this.yaw + m.dx * s);
    const dy = this.settings.invertY ? -m.dy : m.dy;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + dy * s));
    // Mouse movement against recoil "spends" the pending recovery (so the view doesn't spring back over the player's correction).
    if (m.dy !== 0 && this.recoilPitch !== 0) {
      const spend = Math.min(Math.abs(this.recoilPitch), Math.abs(dy * s));
      if (Math.sign(dy) !== Math.sign(this.recoilPitch)) this.recoilPitch -= Math.sign(this.recoilPitch) * spend;
    }
  }

  /**
   * Advances prediction by `dtMs`. Returns the input produced (to be sent), or null if not alive.
   */
  update(dtMs: number): PlayerInput | null {
    this.applyLook();
    if (!this.alive) { this.updateCamera(dtMs); return null; }
    // Tactical latch hygiene (drop 4): never start on a nearly empty budget, and drop the latch the
    // moment the budget is dry so the Tac bit clears and the refill can begin.
    if (this.input.tacLatched && this.body.tac < (this.wasTac ? 1 : TAC.minToStart)) this.input.tacLatched = false;
    // The frozen preparation window between waves (drop 7). Masked HERE, where the input is built,
    // so the same value goes into the prediction, into the replay buffer used by `reconcile`, and
    // over the wire — the server masks the identical bits with the identical shared function, so
    // there is nothing for reconciliation to correct. Looking around, leaning and crouching survive
    // on purpose: preparing is the point of the window.
    //
    // Judged from the shared CLOCK, not from the arrival of `S2C.MatchEvent`: waiting for the
    // message would let the player walk for half a round trip after the server had stopped them and
    // then yank them back, once every seventeen seconds for the whole match.
    // S2 (matrix) is decided in `InputState.buttons()`, at the source of the Aim bit, so exactly one
    // place answers "is this Shift a breath or a sprint?" — deciding it twice is how the two answers
    // drift apart.
    const buttons = maskInput(this.input.buttons(), this.frozen);
    this.lastButtons = buttons;
    const tacNow = tacActive(buttons, this.body);
    if (tacNow !== this.wasTac) { this.wasTac = tacNow; this.onTac?.(tacNow); }
    // The input carries the EFFECTIVE view (recoil and scope sway included): that is what the shot
    // direction is built from, and the server checks each shot against the angles of its input seq
    // (handoff P1). The recoil yaw is a fraction of a degree, so movement is unaffected.
    const input: PlayerInput = {
      seq: ++this.seq, dt: Math.min(50, Math.max(1, Math.round(dtMs * 10) / 10)), buttons,
      yaw: wrapAngle(this.yaw + this.recoilYaw + this.swayYaw), pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + this.recoilPitch + this.swayPitch)),
    };
    simulateBody(this.world, this.body, input, WEAPONS[this.weapon].mobility * this.speedScale(sprintActive(buttons, this.body.crouching)), this.prevButtons);
    this.prevButtons = buttons;
    const entry = this.pool.pop() ?? { input, after: createBody() };
    entry.input = input;
    copyBody(this.body, entry.after);
    this.pending.push(entry);
    if (this.pending.length > 240) this.pool.push(this.pending.shift()!);
    this.outbox.push(input);
    this.updateCamera(dtMs);
    return input;
  }

  /** Drains inputs accumulated since the last send. */
  takeOutbox(): PlayerInput[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  /**
   * Reconciles with the authoritative state: discards acknowledged inputs; if the server's
   * position for that sequence differs from our prediction, rewinds and replays the rest.
   */
  reconcile(p: NetPlayer, ack: number): void {
    if (!this.alive) return;
    while (this.pending.length && this.pending[0].input.seq <= ack) {
      const e = this.pending.shift()!;
      if (e.input.seq === ack) copyBody(e.after, this.serverBody);
      this.pool.push(e);
    }
    const sb = this.serverBody;
    const dx = p.x - sb.x, dy = p.y - sb.y, dz = p.z - sb.z;
    const err = dx * dx + dy * dy + dz * dz;
    if (err < 0.0009) return; // < 3 cm: prediction is in agreement
    // MEASURED (1.0 beta): ~28 "corrections" per spawn came from snapshots arriving before the
    // first input was even sent (map still building) — nothing to correct, only a stale
    // serverBody. Adopt the server state silently when no input is in flight.
    const b = this.body;
    if (this.pending.length === 0) {
      b.x = p.x; b.y = p.y; b.z = p.z; b.vx = dequantVel(p.vx); b.vy = dequantVel(p.vy); b.vz = dequantVel(p.vz); b.grounded = p.grounded; b.crouching = p.crouch;
      copyBody(b, sb);
      return;
    }
    this.correctionCount++;
    b.x = p.x; b.y = p.y; b.z = p.z; b.vx = dequantVel(p.vx); b.vy = dequantVel(p.vy); b.vz = dequantVel(p.vz); b.grounded = p.grounded; b.crouching = p.crouch;
    let prev = this.prevButtonsBefore(0);
    for (const e of this.pending) {
      simulateBody(this.world, b, e.input, WEAPONS[this.weapon].mobility * this.speedScale(sprintActive(e.input.buttons, b.crouching)), prev);
      prev = e.input.buttons;
      copyBody(b, e.after);
    }
  }

  private prevButtonsBefore(index: number): number {
    return index > 0 ? this.pending[index - 1].input.buttons : 0;
  }

  /**
   * Kicks the view. Recovery is exponential at `recoverPerSec` and starts only after `delayMs`,
   * so a burst stacks its pattern instead of springing back between rounds.
   */
  addRecoil(up: number, side: number, recoverPerSec: number, delayMs = 60): void {
    this.recoilPitch -= up;
    this.recoilYaw += side;
    this.recoilRecover = recoverPerSec;
    this.recoilHoldUntil = performance.now() + delayMs;
  }

  /**
   * A shot that leaves an action to work: the revolver's hammer, the shotgun's pump, the sniper's
   * bolt. Scoped weapons lose the sight picture for the length of it (matrix S1); the others just
   * hand the number to the viewmodel and the audio.
   */
  workAction(ms: number, dropsAim: boolean): void {
    if (dropsAim && ms > 0) this.actionUntil = performance.now() + ms;
  }

  /**
   * Whatever the previous weapon owed the player is void: a bolt worked on the SR-50 must not keep
   * the pistol you switched to out of its sights, and it must not survive your own death either.
   */
  clearWeaponState(): void { this.actionUntil = 0; this.stillMs = 0; }

  /**
   * True while the LMG is crouched, settled and shooting off its bipod (matrix B1). Airborne and
   * dead are both excluded: a crouch-jump is not a firing position.
   */
  get bipod(): boolean {
    return this.alive && this.body.grounded && bipodDeployed(feelOf(this.weapon), this.body.crouching, this.stillMs);
  }

  /** Camera shake (radians of roll/pitch noise), scaled by the user's camera-shake setting. Decays quickly. */
  private shake = 0;
  private shakeSeed = 0;
  addShake(amount: number): void {
    this.shake = Math.min(0.05, this.shake + amount * this.settings.shakeScale);
    this.shakeSeed = Math.random() * 1000;
  }

  private updateCamera(dtMs: number): void {
    const dt = dtMs / 1000;
    const b = this.body;
    // Bipod dwell (matrix B1): crouched and barely moving, the LMG settles. Any real movement
    // resets it, so the weapon is heavy again the moment its owner does.
    this.stillMs = this.alive && b.grounded && b.crouching && Math.hypot(b.vx, b.vz) < BIPOD.speed ? this.stillMs + dtMs : 0;
    // Recoil recovery (exponential, after the per-weapon hold).
    if (performance.now() >= this.recoilHoldUntil) {
      const k = Math.exp(-this.recoilRecover * dt);
      this.recoilPitch *= k; this.recoilYaw *= k;
      if (Math.abs(this.recoilPitch) < 1e-4) this.recoilPitch = 0;
      if (Math.abs(this.recoilYaw) < 1e-4) this.recoilYaw = 0;
    }
    // ADS: FOV zoom towards the weapon's adsZoom over adsMs.
    const wdef = WEAPONS[this.weapon];
    const feel = feelOf(this.weapon);
    // S1 (matrix): working the bolt kicks the shooter out of the scope for the length of the cycle,
    // and the aim returns by itself if the button is still held. This is the sniper's rhythm — the
    // shot, the lost picture, the hunt back to the target — not a penalty bolted on top of it.
    const boltOut = performance.now() < this.actionUntil;
    const adsTarget = this.alive && this.isAiming() && !boltOut ? 1 : 0;
    this.adsBlend += (adsTarget - this.adsBlend) * Math.min(1, dtMs / Math.max(16, wdef.adsMs));
    if (Math.abs(this.adsBlend - adsTarget) < 0.01) this.adsBlend = adsTarget;
    // Tactical sprint (drop 4): a wider FOV sells the extra speed.
    this.tacBlend += ((this.alive && this.wasTac ? 1 : 0) - this.tacBlend) * Math.min(1, dt * 6);
    this.camera.fov = (this.settings.fov * Math.PI / 180) * (1 - this.adsBlend * (1 - wdef.adsZoom)) * (1 + 0.07 * this.tacBlend);
    // Lean (drop 4): the eye slides sideways as far as the wall allows, the view rolls with it.
    const leanWant = this.alive ? leanOf(this.lastButtons, b.crouching) : 0;
    const leanTarget = leanWant === 0 ? 0 : leanWant * leanClearance(this.world, b, this.yaw, leanWant);
    this.leanBlend += (leanTarget - this.leanBlend) * Math.min(1, dt * 12);
    if (Math.abs(this.leanBlend) < 0.002) this.leanBlend = 0;
    // Scope sway + breath hold (drop 3). The sway is part of the aim so shots land where the reticle is.
    // The style and the drift come from the feel table now (matrix D-B2): the SR-50 looks down a
    // tube that wanders and can be steadied, the M-1 through a ring that wanders half as much and
    // has no breath to hold — which is what stops the two long rifles being the same weapon twice.
    const nowMs = performance.now();
    const scoped = this.alive && feel.scope !== null && this.adsBlend > 0.9;
    const holding = scoped && feel.breath && (this.lastButtons & Btn.Sprint) !== 0 && this.breathLeft > 0 && nowMs >= this.windedUntil;
    if (holding) { this.breathLeft = Math.max(0, this.breathLeft - dtMs / SCOPE.holdMs); if (this.breathLeft === 0) this.windedUntil = nowMs + SCOPE.windedMs; }
    else this.breathLeft = Math.min(1, this.breathLeft + (dtMs / SCOPE.holdMs) * SCOPE.refillPerMs);
    if (scoped) {
      const t = nowMs / 1000;
      const amp = SCOPE.sway * feel.scopeDrift * (holding ? SCOPE.heldScale : nowMs < this.windedUntil ? SCOPE.windedScale : 1);
      const targetYaw = (Math.sin(t * 0.9) + 0.4 * Math.sin(t * 2.3)) * amp;
      const targetPitch = (Math.cos(t * 1.3) + 0.4 * Math.sin(t * 3.1)) * amp * 0.8;
      this.swayYaw += (targetYaw - this.swayYaw) * Math.min(1, dt * 6);
      this.swayPitch += (targetPitch - this.swayPitch) * Math.min(1, dt * 6);
    } else { this.swayYaw *= Math.max(0, 1 - dt * 10); this.swayPitch *= Math.max(0, 1 - dt * 10); }
    // Crouch eye blending.
    const targetEye = eyeHeight(b);
    this.eyeBlend += (targetEye - this.eyeBlend) * Math.min(1, dt * 14);
    // Landing dip.
    if (b.grounded && !this.wasGrounded) this.landDip = Math.min(0.12, Math.abs(b.vy) * 0.008 + 0.04);
    this.wasGrounded = b.grounded;
    this.landDip *= Math.max(0, 1 - dt * 9);
    // Head bob: tied to horizontal speed, scaled by user setting.
    const speed = Math.hypot(b.vx, b.vz);
    const bobAmt = b.grounded && speed > 0.5 ? this.settings.bobScale : 0;
    this.bobPhase += dt * (speed > 6 ? 11 : 8) * (bobAmt > 0 ? 1 : 0);
    const bobY = Math.sin(this.bobPhase * 2) * 0.018 * bobAmt * Math.min(1, speed / 5);
    const bobX = Math.cos(this.bobPhase) * 0.012 * bobAmt * Math.min(1, speed / 5);
    // Shake: decaying pseudo-random rotation noise.
    let shakePitch = 0, shakeRoll = 0;
    if (this.shake > 0.0002) {
      const t = performance.now() * 0.03 + this.shakeSeed;
      shakePitch = Math.sin(t * 1.7) * this.shake;
      shakeRoll = Math.sin(t * 2.3 + 1.1) * this.shake * 0.8;
      this.shake *= Math.max(0, 1 - dt * 12);
    } else this.shake = 0;
    const cam = this.camera;
    const side = bobX + LEAN.offset * this.leanBlend;
    cam.position.set(b.x + Math.cos(this.yaw) * side, b.y + this.eyeBlend + bobY - this.landDip - LEAN.drop * Math.abs(this.leanBlend), b.z - Math.sin(this.yaw) * side);
    cam.rotation.set(this.pitch + this.recoilPitch + this.swayPitch + shakePitch, this.yaw + this.recoilYaw + this.swayYaw, Math.sin(this.bobPhase) * 0.004 * bobAmt + shakeRoll + LEAN.roll * this.leanBlend);
  }

  /** World-space eye position for shooting (without bob, with the lean — the server validates the same offset). */
  eyePosition(out: [number, number, number]): void {
    const b = this.body;
    out[0] = b.x + Math.cos(this.yaw) * LEAN.offset * this.leanBlend;
    out[1] = b.y + eyeHeight(b) - LEAN.drop * Math.abs(this.leanBlend);
    out[2] = b.z - Math.sin(this.yaw) * LEAN.offset * this.leanBlend;
  }

  /** Smoothed lean -1..1 (already scaled by wall clearance) for the viewmodel. */
  get lean(): number { return this.leanBlend; }
  /** Tactical sprint running now (drop 4). */
  isTacSprinting(): boolean { return this.alive && this.wasTac; }
  /** Tactical budget left 0..1. */
  get tacFraction(): number { return Math.max(0, Math.min(1, this.body.tac / TAC.budgetMs)); }

  /** Current view direction including recoil (the same angles the last input carried). */
  aimDir(out: [number, number, number]): void {
    aimDirection(wrapAngle(this.yaw + this.recoilYaw + this.swayYaw), Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + this.recoilPitch + this.swayPitch)), out);
  }

  /**
   * The room's match phase, pushed in by `Game` (immediately on `S2C.MatchEvent`, and again from
   * the replicated state). Prediction needs it for one thing only: the freeze.
   */
  phase: MatchPhase = MatchPhase.Waiting;
  /** End of the current wave / preparation window, on the server clock. */
  phaseEndsAt = 0;
  /** The synchronised server clock, injected by `Game` (0 until it is). */
  serverNow: () => number = () => 0;

  /**
   * In the frozen preparation window between waves. One place, because more than prediction asks:
   * a grenade must not be primed or cooked across the freeze either, and two answers to the same
   * question drift apart.
   */
  get frozen(): boolean { return frozenAt(this.phase, this.phaseEndsAt, this.serverNow()); }

  /** Sequence of the newest predicted input (a shot references it so the server can check the aim). */
  get lastSeq(): number { return this.seq; }

  /** Scope state for the HUD: which overlay is up (if any), breath left (0..1) and the winded flag. */
  scopeState(): { scoped: boolean; style: ScopeStyle | null; breath: number; winded: boolean } {
    const feel = feelOf(this.weapon);
    const scoped = this.alive && feel.scope !== null && this.adsBlend > 0.9;
    return { scoped, style: scoped ? feel.scope : null, breath: feel.breath ? this.breathLeft : 1, winded: feel.breath && performance.now() < this.windedUntil };
  }

  isSprinting(): boolean {
    // Keep the presentation / fire gate on the same sprint definition as the
    // shared movement sim. Holding fire or ADS cancels sprint, rather than
    // repeatedly re-starting sprint-out and making the weapon feel stuck.
    return sprintActive(this.lastButtons, this.body.crouching);
  }

  isAiming(): boolean { return (this.lastButtons & Btn.Aim) !== 0; }
  get pendingCount(): number { return this.pending.length; }

  static aim(yaw: number, pitch: number): [number, number, number] { aimDirection(yaw, pitch, tmpDir); return tmpDir; }
}
