/**
 * Ambient bed: city rumble + HVAC hum + traffic swells outside; fluorescent buzz inside the
 * barber shop; an occasional distant siren. Zones crossfade on the local player's position.
 * All layers are persistent nodes (not voices) started once and faded with gain params.
 */
import type { AudioEngine } from "./engine";
import { sharedBuffers } from "./synth";

/** Shop interior box from `packages/shared/src/map.ts` (x -4..8, z 0..10). */
const SHOP = { x0: -4, x1: 8, z0: 0, z1: 10, y0: -1, y1: 5 };
const FADE_M = 2.5; // metres outside the shop over which "inside" fades to 0

const BED_LEVEL = 0.9;

export class Ambience {
  private ctx: AudioContext | null = null;
  private bed!: GainNode;
  private exterior!: GainNode;
  private exteriorLp!: BiquadFilterNode;
  private interior!: GainNode;
  private sirenTimer = 0;
  private inside = -1;
  private nodes: AudioScheduledSourceNode[] = [];
  private started = false;

  constructor(private engine: AudioEngine) {}

  /** Builds the graph on the first frame the context exists; cheap to call repeatedly. */
  private ensure(): boolean {
    if (this.started) return true;
    const ctx = this.engine.context;
    const bus = this.engine.effectsBus;
    if (!ctx || !bus) return false;
    this.ctx = ctx;
    const buf = sharedBuffers(ctx);
    const t = ctx.currentTime;
    this.bed = ctx.createGain();
    this.bed.gain.value = 0;
    this.bed.gain.setTargetAtTime(BED_LEVEL, t, 1.5);
    this.bed.connect(bus);

    // ---- exterior sub-mix (rumble, hvac, traffic, siren) with a low-pass that closes indoors
    this.exteriorLp = ctx.createBiquadFilter();
    this.exteriorLp.type = "lowpass";
    this.exteriorLp.frequency.value = 9000;
    this.exteriorLp.Q.value = 0.4;
    this.exterior = ctx.createGain();
    this.exterior.gain.value = 1;
    this.exterior.connect(this.exteriorLp);
    this.exteriorLp.connect(this.bed);

    // City rumble: brown noise, very low-passed, with a slow gain wobble.
    const rumble = ctx.createBufferSource();
    rumble.buffer = buf.brown; rumble.loop = true; rumble.playbackRate.value = 0.7;
    const rLp = ctx.createBiquadFilter(); rLp.type = "lowpass"; rLp.frequency.value = 130; rLp.Q.value = 0.6;
    const rG = ctx.createGain(); rG.gain.value = 0.16;
    rumble.connect(rLp); rLp.connect(rG); rG.connect(this.exterior);
    this.lfo(0.045, 0.05, rG.gain, t);
    rumble.start(t);
    this.nodes.push(rumble);

    // Traffic swells: pink noise band around 400 Hz, slow asymmetric LFO (cars passing).
    const traffic = ctx.createBufferSource();
    traffic.buffer = buf.pink; traffic.loop = true; traffic.playbackRate.value = 0.85;
    const tBp = ctx.createBiquadFilter(); tBp.type = "bandpass"; tBp.frequency.value = 420; tBp.Q.value = 0.5;
    const tG = ctx.createGain(); tG.gain.value = 0.025;
    traffic.connect(tBp); tBp.connect(tG); tG.connect(this.exterior);
    this.lfo(0.031, 0.02, tG.gain, t);
    this.lfo(0.013, 0.012, tBp.frequency, t, 120);
    traffic.start(t);
    this.nodes.push(traffic);

    // HVAC hum: two detuned triangles + an octave sine, low-passed, slow drift.
    const hG = ctx.createGain(); hG.gain.value = 0.045;
    const hLp = ctx.createBiquadFilter(); hLp.type = "lowpass"; hLp.frequency.value = 320; hLp.Q.value = 0.8;
    hLp.connect(hG); hG.connect(this.exterior);
    for (const [f, type, lvl] of [[58, "triangle", 0.6], [58.9, "triangle", 0.5], [117, "sine", 0.25]] as const) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = lvl;
      o.connect(og); og.connect(hLp);
      this.lfo(0.17 + Math.random() * 0.1, 3, o.detune, t);
      o.start(t);
      this.nodes.push(o);
    }

    // ---- interior: fluorescent buzz (100/120 Hz-ish square, band-limited high, flickery)
    this.interior = ctx.createGain();
    this.interior.gain.value = 0;
    this.interior.connect(this.bed);
    const fl = ctx.createOscillator(); fl.type = "square"; fl.frequency.value = 120;
    const flHp = ctx.createBiquadFilter(); flHp.type = "highpass"; flHp.frequency.value = 1400; flHp.Q.value = 0.7;
    const flBp = ctx.createBiquadFilter(); flBp.type = "bandpass"; flBp.frequency.value = 3400; flBp.Q.value = 2.5;
    const flG = ctx.createGain(); flG.gain.value = 0.012;
    fl.connect(flHp); flHp.connect(flBp); flBp.connect(flG); flG.connect(this.interior);
    this.lfo(6.3, 0.004, flG.gain, t);
    this.lfo(0.9, 0.002, flG.gain, t);
    fl.start(t);
    this.nodes.push(fl);
    // Interior room tone: faint pink noise so the shop is not dead silent when the buzz is masked.
    const room = ctx.createBufferSource();
    room.buffer = buf.pink; room.loop = true; room.playbackRate.value = 0.6;
    const roomLp = ctx.createBiquadFilter(); roomLp.type = "lowpass"; roomLp.frequency.value = 900;
    const roomG = ctx.createGain(); roomG.gain.value = 0.02;
    room.connect(roomLp); roomLp.connect(roomG); roomG.connect(this.interior);
    room.start(t);
    this.nodes.push(room);

    this.scheduleSiren();
    this.started = true;
    return true;
  }

  private lfo(hz: number, depth: number, target: AudioParam, t: number, offset = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    if (offset) target.value += offset;
    o.start(t + Math.random() * 2);
    this.nodes.push(o);
  }

  private scheduleSiren(): void {
    const delay = 60000 + Math.random() * 60000;
    this.sirenTimer = window.setTimeout(() => { this.siren(); this.scheduleSiren(); }, delay);
  }

  /** Distant two-tone siren, ~5 s, quietly panned to one side. */
  private siren(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1500; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if ("pan" in p) (p as StereoPannerNode).pan.value = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
    o.connect(lp); lp.connect(g); g.connect(p); p.connect(this.exterior);
    const cycles = 3 + Math.floor(Math.random() * 2);
    const period = 1.4;
    for (let i = 0; i < cycles; i++) {
      const c = t + i * period;
      o.frequency.setValueAtTime(620, c);
      o.frequency.exponentialRampToValueAtTime(880, c + period * 0.5);
      o.frequency.exponentialRampToValueAtTime(620, c + period);
    }
    const total = cycles * period;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.028, t + total * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + total);
    o.start(t);
    o.stop(t + total + 0.1);
    o.onended = () => { try { p.disconnect(); } catch { /* gone */ } };
  }

  /** Per frame: crossfade interior/exterior on the local position. Cheap when nothing changed. */
  update(x: number, y: number, z: number): void {
    if (!this.ensure()) return;
    const dx = Math.max(SHOP.x0 - x, 0, x - SHOP.x1);
    const dz = Math.max(SHOP.z0 - z, 0, z - SHOP.z1);
    const dy = Math.max(SHOP.y0 - y, 0, y - SHOP.y1);
    const d = Math.hypot(dx, dz, dy);
    const inside = d <= 0 ? 1 : Math.max(0, 1 - d / FADE_M);
    if (Math.abs(inside - this.inside) < 0.01) return;
    this.inside = inside;
    const t = this.ctx!.currentTime;
    this.interior.gain.setTargetAtTime(inside, t, 0.25);
    this.exterior.gain.setTargetAtTime(1 - 0.7 * inside, t, 0.25);
    this.exteriorLp.frequency.setTargetAtTime(9000 - 7700 * inside, t, 0.25);
  }

  dispose(): void {
    window.clearTimeout(this.sirenTimer);
    for (const n of this.nodes) { try { n.stop(); } catch { /* not started */ } }
    this.nodes.length = 0;
    try { this.bed?.disconnect(); } catch { /* gone */ }
    this.started = false;
  }
}
