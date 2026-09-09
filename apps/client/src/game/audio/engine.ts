/**
 * AudioEngine: one lazily created AudioContext, the bus tree, listener tracking, the reverb
 * send, the damage "duck" and the voice manager. Never throws when autoplay is blocked:
 * the context simply stays suspended until the first pointerdown/keydown on the window.
 *
 *   voice → [panner] → effects → duckFilter → duckGain ─┐
 *   music ─────────────────────────────────────────────┼→ master → compressor → destination
 *   ui ────────────────────────────────────────────────┘
 *   reverbSend → convolver → effects
 */
import type { Settings } from "../../settings";
import { sharedBuffers, type Graph } from "./synth";
import type { SoundFn as Sfx } from "./sfx";

export const MAX_VOICES = 24;

export const Priority = { ambience: 0, movement: 1, reload: 2, hit: 3, ui: 3, gunshot: 4 } as const;
export type PriorityLevel = (typeof Priority)[keyof typeof Priority];

export interface PlayOptions {
  bus?: "effects" | "ui";
  priority?: PriorityLevel;
  /** World position → PannerNode (equalpower, inverse distance). */
  position?: { x: number; y: number; z: number };
  /** Inverse-model roll-off; higher = fades faster with distance. */
  rolloff?: number;
  /** Overall gain for this voice. */
  gain?: number;
  /** Skip entirely when the listener is farther than this (metres). */
  maxDistance?: number;
}

interface Voice {
  gain: GainNode;
  tail: AudioNode; // last node before the bus (gain or panner)
  /**
   * This voice's own send into the shared reverb, pre-scaled by the voice's gain.
   *
   * It has to be per voice, not the shared bus, for two reasons. Level: a sound's `send()` taps its
   * own internal node, which sits UPSTREAM of the voice gain and the panner, so a send straight to
   * the shared bus arrived at full scale however far away the sound was — a rifle shot across 40 m
   * of map was ~0.08 dry and ~0.17 WET, so distant gunfire came back as a loud, directionless wash
   * and there was no judging range or bearing by ear. Lifetime: `disconnect` only ever dropped
   * `tail` and `gain`, so a stolen or finished voice's reverb tail kept feeding the bus — the voice
   * cap limited voices, not what you could hear.
   */
  verb: GainNode | null;
  priority: number;
  startedAt: number;
  endsAt: number;
  timer: number;
}

type AudioSettings = Settings["audio"];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private duckFilter!: BiquadFilterNode;
  private duckGain!: GainNode;
  private music!: GainNode;
  private ui!: GainNode;
  private reverbIn!: GainNode;
  private voices: Voice[] = [];
  private settings: AudioSettings;
  private gestureBound = false;
  private lx = 0; private ly = 0; private lz = 0;
  /** True when the AudioContext could not be created at all (very old browser). */
  unavailable = false;

  constructor(settings: AudioSettings) {
    this.settings = settings;
    this.bindGesture();
  }

  /** Current context, creating it on demand. Null if WebAudio is unavailable. */
  get context(): AudioContext | null {
    if (this.ctx || this.unavailable) return this.ctx;
    try {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) { this.unavailable = true; return null; }
      const ctx = new Ctor({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.buildBuses(ctx);
      sharedBuffers(ctx);
      if (ctx.state !== "running") void ctx.resume().catch(() => { /* waits for a gesture */ });
    } catch (err) {
      console.warn("[audio] AudioContext unavailable", err);
      this.unavailable = true;
      this.ctx = null;
    }
    return this.ctx;
  }

  get state(): AudioContextState | "unavailable" { return this.unavailable ? "unavailable" : this.ctx?.state ?? "suspended"; }
  get now(): number { return this.ctx?.currentTime ?? 0; }
  get activeVoices(): number { return this.voices.length; }
  get musicBus(): GainNode | null { return this.ctx ? this.music : null; }
  get effectsBus(): GainNode | null { return this.ctx ? this.effects : null; }
  get reverbSend(): GainNode | null { return this.ctx ? this.reverbIn : null; }

  private buildBuses(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = "lowpass";
    this.duckFilter.frequency.value = 18000;
    this.duckFilter.Q.value = 0.5;
    this.duckFilter.connect(this.duckGain);
    this.effects = ctx.createGain();
    this.effects.connect(this.duckFilter);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.ui = ctx.createGain();
    this.ui.connect(this.master);
    // Reverb: synthesised impulse, pre-filtered so gunshot tails do not turn to hiss.
    const conv = ctx.createConvolver();
    conv.buffer = sharedBuffers(ctx).impulse;
    conv.normalize = true;
    const verbLp = ctx.createBiquadFilter();
    verbLp.type = "lowpass"; verbLp.frequency.value = 2600;
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(conv);
    conv.connect(verbLp);
    verbLp.connect(verbOut);
    verbOut.connect(this.effects);
    this.applySettings(this.settings, true);
  }

  private bindGesture(): void {
    if (this.gestureBound || typeof window === "undefined") return;
    this.gestureBound = true;
    const onGesture = () => {
      const ctx = this.context;
      if (!ctx) return;
      if (ctx.state !== "running") void ctx.resume().catch(() => { /* still blocked */ });
    };
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("keydown", onGesture, { passive: true });
  }

  /** Explicit resume attempt (e.g. from a UI button); safe to call anywhere. */
  resume(): void {
    const ctx = this.context;
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => { /* ignore */ });
  }

  setSettings(s: AudioSettings): void {
    this.settings = s;
    this.applySettings(s, false);
  }

  private applySettings(s: AudioSettings, immediate: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => {
      const val = Math.max(0, Math.min(1, v));
      if (immediate) p.value = val; else { p.cancelScheduledValues(t); p.setTargetAtTime(val, t, 0.03); }
    };
    set(this.master.gain, s.master);
    set(this.effects.gain, s.effects);
    set(this.music.gain, s.music);
    set(this.ui.gain, s.ui);
  }

  /** Called each frame with the camera; updates the listener (position + orientation). */
  updateListener(x: number, y: number, z: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.lx = x; this.ly = y; this.lz = z;
    const l = ctx.listener as AudioListener & { positionX?: AudioParam; setPosition?: (x: number, y: number, z: number) => void; setOrientation?: (...a: number[]) => void };
    if (l.positionX) {
      const t = ctx.currentTime;
      // Short ramps avoid zipper noise on the panners without lagging the camera.
      l.positionX.linearRampToValueAtTime(x, t + 0.02); l.positionY.linearRampToValueAtTime(y, t + 0.02); l.positionZ.linearRampToValueAtTime(z, t + 0.02);
      l.forwardX.linearRampToValueAtTime(fx, t + 0.02); l.forwardY.linearRampToValueAtTime(fy, t + 0.02); l.forwardZ.linearRampToValueAtTime(fz, t + 0.02);
      l.upX.linearRampToValueAtTime(ux, t + 0.02); l.upY.linearRampToValueAtTime(uy, t + 0.02); l.upZ.linearRampToValueAtTime(uz, t + 0.02);
    } else if (l.setPosition && l.setOrientation) {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  distanceToListener(x: number, y: number, z: number): number {
    return Math.hypot(x - this.lx, y - this.ly, z - this.lz);
  }

  /**
   * Plays a one-shot through the voice manager. Returns a handle to stop it early (reload
   * cancelled by a weapon switch) or null when nothing was played.
   */
  play(fn: Sfx, opts: PlayOptions = {}): { stop(): void } | null {
    const ctx = this.context;
    if (!ctx) return null;
    if (opts.position && opts.maxDistance !== undefined) {
      if (this.distanceToListener(opts.position.x, opts.position.y, opts.position.z) > opts.maxDistance) return null;
    }
    const priority = opts.priority ?? Priority.hit;
    const bus = opts.bus === "ui" ? this.ui : this.effects;
    const t = ctx.currentTime + 0.005;
    const vg = ctx.createGain();
    vg.gain.value = opts.gain ?? 1;
    let tail: AudioNode = vg;
    if (opts.position) {
      const p = ctx.createPanner();
      p.panningModel = "equalpower";
      p.distanceModel = "inverse";
      p.refDistance = 1;
      p.maxDistance = 10000;
      p.rolloffFactor = opts.rolloff ?? 1;
      p.coneInnerAngle = 360; p.coneOuterAngle = 360; p.coneOuterGain = 1;
      const pp = p as PannerNode & { positionX?: AudioParam; setPosition?: (x: number, y: number, z: number) => void };
      if (pp.positionX) { pp.positionX.value = opts.position.x; pp.positionY.value = opts.position.y; pp.positionZ.value = opts.position.z; }
      else pp.setPosition?.(opts.position.x, opts.position.y, opts.position.z);
      vg.connect(p);
      tail = p;
    }
    // The wet path is attenuated like the dry one and dies with the voice (see `Voice.verb`). It is
    // deliberately NOT panned: a reverb return is the room answering, which has no bearing.
    let verb: GainNode | null = null;
    if (opts.bus !== "ui") {
      verb = ctx.createGain();
      verb.gain.value = opts.gain ?? 1;
      verb.connect(this.reverbIn);
    }
    const voice: Voice = { gain: vg, tail, verb, priority, startedAt: t, endsAt: t, timer: 0 };
    if (!this.admit(voice)) { vg.disconnect(); verb?.disconnect(); return null; }
    tail.connect(bus);
    const g: Graph = { ctx, out: vg, verb, t, buf: sharedBuffers(ctx), rnd: Math.random };
    let dur = 0.5;
    try { dur = fn(g); } catch (err) { console.warn("[audio] sound failed", err); }
    voice.endsAt = t + dur + 0.6; // reverb send / setTargetAtTime tails
    voice.timer = window.setTimeout(() => this.release(voice), (dur + 0.7) * 1000);
    this.voices.push(voice);
    return { stop: () => this.steal(voice) };
  }

  /** Voice limit: expire finished voices, then steal the oldest voice of the lowest priority ≤ ours. */
  private admit(v: Voice): boolean {
    if (this.voices.length < MAX_VOICES) return true;
    const now = this.now;
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].endsAt <= now) this.release(this.voices[i]);
    if (this.voices.length < MAX_VOICES) return true;
    let victim: Voice | null = null;
    for (const c of this.voices) {
      if (c.priority > v.priority) continue;
      if (!victim || c.priority < victim.priority || (c.priority === victim.priority && c.startedAt < victim.startedAt)) victim = c;
    }
    if (!victim) return false;
    this.steal(victim);
    return true;
  }

  /**
   * Fades a voice out and frees its slot IMMEDIATELY (the graph is disconnected after the
   * 4 ms fade). Freeing synchronously matters: a burst of 40 shots in one frame must never
   * push the live count past MAX_VOICES (measured: 81 voices before this was made synchronous).
   */
  private steal(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    window.clearTimeout(v.timer);
    if (!this.ctx) { this.disconnect(v); return; }
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, 0.004);
    // The send has to be faded too, or a stolen voice goes on ringing through the reverb.
    if (v.verb) { v.verb.gain.cancelScheduledValues(t); v.verb.gain.setTargetAtTime(0, t, 0.004); }
    v.timer = window.setTimeout(() => this.disconnect(v), 40);
  }

  private release(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    window.clearTimeout(v.timer);
    this.disconnect(v);
  }

  private disconnect(v: Voice): void {
    try { v.tail.disconnect(); if (v.tail !== v.gain) v.gain.disconnect(); v.verb?.disconnect(); } catch { /* already gone */ }
  }

  /** Brief low-pass + dip on the effects bus (taking damage). */
  duck(amount = 1, ms = 150): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = ms / 1000;
    const f = this.duckFilter.frequency, gn = this.duckGain.gain;
    f.cancelScheduledValues(t); gn.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(300, 18000 - 17300 * amount), t);
    f.exponentialRampToValueAtTime(18000, t + s);
    gn.setValueAtTime(1 - 0.45 * amount, t);
    gn.linearRampToValueAtTime(1, t + s * 1.2);
  }

  dispose(): void {
    for (const v of [...this.voices]) this.release(v);
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => { /* ignore */ });
  }
}
