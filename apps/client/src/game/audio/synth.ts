/**
 * Procedural synthesis building blocks. Everything here is context-agnostic: a `Graph` can
 * point at the live AudioContext or at an OfflineAudioContext (used by the self-test to
 * render each one-shot and measure its peak), so sound design code is written once.
 *
 * Shared resources (noise buffers, impulse response, saturation curve) are built once per
 * BaseAudioContext and reused by every voice — the only per-shot allocations are the
 * WebAudio nodes themselves, which the API requires.
 */

export interface SharedBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** Synthesised room impulse (short, dark) for the reverb send. */
  impulse: AudioBuffer;
  /** tanh-style soft clip curve; guarantees a one-shot never exceeds ~-1 dBFS. */
  saturate: Float32Array;
}

export interface Graph {
  ctx: BaseAudioContext;
  /** Where the sound's final node must connect. */
  out: AudioNode;
  /** Optional reverb send (null when rendering offline). */
  verb: AudioNode | null;
  /** Start time (context clock, seconds). */
  t: number;
  buf: SharedBuffers;
  /** Deterministic-ish variation source (0..1). */
  rnd: () => number;
}

const NOISE_SECONDS = 2;
const cache = new WeakMap<BaseAudioContext, SharedBuffers>();

export function sharedBuffers(ctx: BaseAudioContext): SharedBuffers {
  let b = cache.get(ctx);
  if (b) return b;
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * NOISE_SECONDS);
  const white = ctx.createBuffer(1, n, sr);
  const pink = ctx.createBuffer(1, n, sr);
  const brown = ctx.createBuffer(1, n, sr);
  const w = white.getChannelData(0), p = pink.getChannelData(0), br = brown.getChannelData(0);
  // Paul Kellet's pink approximation; brown = leaky integrator of white.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.96900 * b2 + x * 0.1538520;
    b3 = 0.86650 * b3 + x * 0.3104856; b4 = 0.55000 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.0168980;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    br[i] = last * 3.5;
  }
  // Impulse: exponentially decaying stereo noise, darkened over time (small tiled room / street).
  const irLen = Math.floor(sr * 1.1);
  const impulse = ctx.createBuffer(2, irLen, sr);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < irLen; i++) {
      const k = i / irLen;
      const x = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.2) * Math.exp(-k * 3.2);
      const a = 0.35 + 0.5 * k; // more low-pass as the tail decays
      lp = lp * a + x * (1 - a);
      d[i] = lp * (i < 40 ? i / 40 : 1);
    }
  }
  const saturate = new Float32Array(1025);
  for (let i = 0; i < saturate.length; i++) {
    const x = (i / (saturate.length - 1)) * 2 - 1;
    saturate[i] = Math.tanh(x * 1.6) * 0.86;
  }
  b = { white, pink, brown, impulse, saturate };
  cache.set(ctx, b);
  return b;
}

/** Plays a slice of a shared noise buffer from a random offset. */
export function noise(g: Graph, kind: "white" | "pink" | "brown", dur: number, rate = 1): AudioBufferSourceNode {
  const src = g.ctx.createBufferSource();
  src.buffer = g.buf[kind];
  src.loop = dur * rate > NOISE_SECONDS * 0.9;
  src.playbackRate.value = rate;
  const offset = g.rnd() * (NOISE_SECONDS - Math.min(dur * rate, NOISE_SECONDS * 0.5));
  src.start(g.t, offset);
  src.stop(g.t + dur + 0.05);
  return src;
}

export function osc(g: Graph, type: OscillatorType, freq: number, dur: number): OscillatorNode {
  const o = g.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, g.t);
  o.start(g.t);
  o.stop(g.t + dur + 0.05);
  return o;
}

export function gain(g: Graph, v = 1): GainNode {
  const n = g.ctx.createGain();
  n.gain.value = v;
  return n;
}

export function filter(g: Graph, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = g.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, g.t);
  f.Q.value = q;
  return f;
}

/**
 * Attack → (hold) → exponential decay envelope on a gain param. Uses setTargetAtTime for the
 * decay so the tail never has a hard step; the node should be stopped after `attack+hold+decay*5`.
 */
export function env(param: AudioParam, t: number, peak: number, attack: number, decay: number, hold = 0): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  if (attack > 0.0005) param.linearRampToValueAtTime(peak, t + attack); else param.setValueAtTime(peak, t);
  const dStart = t + attack + hold;
  if (hold > 0) param.setValueAtTime(peak, dStart);
  param.setTargetAtTime(0.0001, dStart, decay / 4);
}

/** Exponential pitch glide from `from` to `to` over `dur` seconds. */
export function glide(param: AudioParam, t: number, from: number, to: number, dur: number): void {
  param.setValueAtTime(Math.max(1, from), t);
  param.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
}

export function saturator(g: Graph): WaveShaperNode {
  const s = g.ctx.createWaveShaper();
  s.curve = g.buf.saturate as Float32Array<ArrayBuffer>;
  s.oversample = "none";
  return s;
}

/** Cheap stereo placement for non-positional sounds (subtle L/R alternation etc). */
export function pan(g: Graph, value: number): AudioNode {
  const c = g.ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
  if (typeof c.createStereoPanner !== "function") return gain(g, 1);
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, value));
  return p;
}

/** Connects a send from `node` into the reverb bus with the given level (no-op offline). */
export function send(g: Graph, node: AudioNode, level: number): void {
  if (!g.verb || level <= 0) return;
  const s = gain(g, level);
  node.connect(s);
  s.connect(g.verb);
}

export function vary(g: Graph, base: number, spread: number): number {
  return base * (1 + (g.rnd() * 2 - 1) * spread);
}
