/**
 * Menu / result-screen music: a very sparse, dark, slow procedural pulse. Sub pulse on the
 * beat, a detuned minor pad every two bars, a rare high ping. Kept OFF during gameplay.
 * Uses look-ahead scheduling on the audio clock so timer jitter never reaches the ear.
 */
import type { AudioEngine } from "./engine";

const BPM = 58;
const BEAT = 60 / BPM;
const LOOKAHEAD_S = 0.6;
const TICK_MS = 180;

// A minor-ish palette, low register. Chord roots cycle slowly.
const PADS: number[][] = [[55, 65.4, 82.4], [49, 58.3, 73.4], [55, 65.4, 82.4], [43.7, 55, 65.4]];
const PINGS = [880, 1046.5, 1318.5, 659.3];

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private timer = 0;
  private nextBeat = 0;
  private beatIndex = 0;
  private on = false;
  private built = false;

  constructor(private engine: AudioEngine) {}

  get enabled(): boolean { return this.on; }

  private ensure(): boolean {
    if (this.built) return true;
    const ctx = this.engine.context;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return false;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1800; lp.Q.value = 0.5;
    this.out.connect(lp);
    lp.connect(bus);
    this.built = true;
    return true;
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (!this.ensure()) { if (on) this.retry(); return; }
    const t = this.ctx!.currentTime;
    this.out.gain.cancelScheduledValues(t);
    if (on) {
      this.out.gain.setTargetAtTime(0.5, t, 0.8);
      this.nextBeat = t + 0.1;
      this.beatIndex = 0;
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.tick(), TICK_MS);
    } else {
      this.out.gain.setTargetAtTime(0, t, 0.5);
      window.clearInterval(this.timer);
      this.timer = 0;
    }
  }

  /** Context not created yet (no gesture): poll until it exists, then start. */
  private retry(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (!this.on) { window.clearInterval(this.timer); return; }
      if (this.ensure()) { window.clearInterval(this.timer); this.on = false; this.set(true); }
    }, 300);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.on) return;
    while (this.nextBeat < ctx.currentTime + LOOKAHEAD_S) {
      this.beat(this.nextBeat, this.beatIndex);
      this.nextBeat += BEAT;
      this.beatIndex++;
    }
  }

  private beat(t: number, i: number): void {
    const ctx = this.ctx!;
    // Sub pulse every beat, slightly stronger on the downbeat.
    const strong = i % 4 === 0;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(strong ? 41.2 : 36.7, t);
    o.frequency.exponentialRampToValueAtTime(strong ? 36.7 : 32.7, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(strong ? 0.5 : 0.3, t + 0.012);
    g.gain.setTargetAtTime(0.0001, t + 0.05, 0.11);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.9);
    // Pad: every 8 beats, slow attack, long release.
    if (i % 8 === 0) {
      const chord = PADS[(i / 8) % PADS.length];
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.setValueAtTime(220, t); lp.frequency.linearRampToValueAtTime(520, t + 3.5); lp.frequency.setTargetAtTime(180, t + 4, 2);
      lp.Q.value = 1.1;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.linearRampToValueAtTime(0.13, t + 2.2);
      pg.gain.setValueAtTime(0.13, t + 4.5);
      pg.gain.setTargetAtTime(0.0001, t + 4.5, 1.2);
      lp.connect(pg); pg.connect(this.out);
      for (const f of chord) for (const det of [-6, 7]) {
        const s = ctx.createOscillator();
        s.type = "sawtooth"; s.frequency.value = f; s.detune.value = det;
        s.connect(lp);
        s.start(t); s.stop(t + 10);
      }
    }
    // Ping: rare, quiet, long decay. Probability keeps it from becoming a melody.
    if (i % 2 === 1 && Math.random() < 0.18) {
      const p = ctx.createOscillator();
      p.type = "sine";
      p.frequency.value = PINGS[Math.floor(Math.random() * PINGS.length)];
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.linearRampToValueAtTime(0.07, t + 0.01);
      pg.gain.setTargetAtTime(0.0001, t + 0.02, 0.9);
      p.connect(pg); pg.connect(this.out);
      p.start(t); p.stop(t + 5);
    }
  }

  dispose(): void {
    this.on = false;
    window.clearInterval(this.timer);
    try { this.out?.disconnect(); } catch { /* gone */ }
    this.built = false;
  }
}
