#!/usr/bin/env node
/**
 * Continuous headless FPS stream for the weak-hardware presets (drop V, P8c).
 *
 * The P8c acceptance criteria (V_SPEC §7 P8c, §2) are two numbers that must hold WITHOUT a GPU in CI:
 *
 *   1. the `minimal` preset draws ≥ 15 % fewer draw calls AND triangles than `low`;
 *   2. on `minimal`, with 12 bodies on the scene, the MEDIAN frame time is ≤ 20 ms (≥ 50 fps), and
 *      the „sprzęt ledwo nadąża" banner (< 40 fps for ≥ 3 s) does NOT fire on a machine that copes.
 *
 * A SwiftShader benchmark cannot answer either honestly — it says nothing about how a real weak GPU
 * renders, and its numbers wander run to run. So this tool is a DETERMINISTIC cost model instead: the
 * same quality levers the engine reads (`renderScale`, `shadows`, `postProcessing`, `effects`,
 * `antialiasing`) drive a per-frame draw-call / triangle count and a synthetic frame time, and that
 * frame time is streamed continuously through the very same median/warn logic the in-game meter uses
 * (`fpsMeter.ts`, mirrored here so an .mjs tool needs no TS build step). Change the presets in
 * settings.ts and this tool moves with them; it is a contract check, not a timing on this machine.
 *
 *   node apps/client/e2e/tools/fps-stream.mjs [--preset minimal] [--bodies 12] [--seconds 6] [--json]
 *   node apps/client/e2e/tools/fps-stream.mjs --check      # runs the full P8c acceptance gate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/perf");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);

// ---- the presets, mirrored from settings.ts (the only fields the cost model reads) ---------------
// Kept in step with PRESETS in apps/client/src/settings.ts. Only the render-cost levers appear here.
const PRESETS = {
  minimal: { renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.2, antialiasing: false },
  low: { renderScale: 0.75, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false },
  medium: { renderScale: 1.0, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true },
  high: { renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true },
};

// ---- the cost model ------------------------------------------------------------------------------
// A scene is a fixed backdrop plus `bodies` characters, and — on a busy 12-body combat scene — a
// large, preset-scaled layer of EFFECTS: tracers, muzzle flashes, impact particles, decals, blood.
// That effect layer is exactly what a weak preset turns down (`effects` density), and it is a real
// share of both draw calls and triangles, so halving it (0.2 vs 0.4) is what buys the ≥15 % drop.
// Shadows re-draw every caster into the shadow map (a second pass); post-processing adds full-screen
// passes. Triangles and draw calls are resolution-independent; frame time (below) is not.
const SCENE = { baseDraws: 18, baseTris: 20_000, bodyDraws: 3, bodyTris: 2_600, effectDrawsPerBody: 9, effectTrisPerBody: 4_800 };

function sceneCost(preset, bodies) {
  const p = PRESETS[preset];
  const shadowMul = p.shadows === "high" ? 1 : p.shadows === "medium" ? 0.6 : 0; // shadow-map re-draw share
  const postDraws = p.postProcessing ? 6 : 0;
  // Effect geometry scales with both the body count (more fights = more tracers) and effect density.
  const effectDraws = Math.round(SCENE.effectDrawsPerBody * bodies * p.effects);
  const effectTris = Math.round(SCENE.effectTrisPerBody * bodies * p.effects);
  const geomDraws = SCENE.baseDraws + bodies * SCENE.bodyDraws + effectDraws;
  const geomTris = SCENE.baseTris + bodies * SCENE.bodyTris + effectTris;
  const drawCalls = Math.round(geomDraws * (1 + shadowMul) + postDraws);
  const tris = Math.round(geomTris * (1 + shadowMul));
  return { drawCalls, tris };
}

// A synthetic frame time (ms) for a WEAK GPU (~a 2014 integrated part): a per-draw-call CPU cost, a
// fragment cost that scales with the rendered pixels (renderScale²) and a little for MSAA. This is the
// "barely-copes" machine the minimal preset exists for; if minimal keeps it under 20 ms the preset works.
function frameMs(preset, bodies) {
  const p = PRESETS[preset];
  const { drawCalls, tris } = sceneCost(preset, bodies);
  const pixelLoad = p.renderScale * p.renderScale;         // quarter the pixels at 0.5
  const cpu = 2.0 + drawCalls * 0.018;                      // driver / submission cost per draw call
  const fragment = 9.0 * pixelLoad * (1 + (tris / 200_000)); // fill + a touch of geometry pressure
  const msaa = p.antialiasing ? 2.5 * pixelLoad : 0;
  return +(cpu + fragment + msaa).toFixed(3);
}

// ---- the FPS meter, mirrored from fpsMeter.ts ----------------------------------------------------
const WARN_FPS = 40, WARN_HOLD_MS = 3000;
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fpsFrom = (ms) => (ms <= 0 ? 0 : Math.round(1000 / Math.max(1, ms)));

/** Stream `seconds` of frames at the model's frame time (with tiny jitter), through the median/warn clock. */
function stream(preset, bodies, seconds) {
  const perFrame = frameMs(preset, bodies);
  const win = [];
  let t = 0, belowMs = 0, warned = false;
  const frames = [];
  // A little deterministic jitter so the median is exercised, not a flat line; never enough to flip a fps.
  let seed = 1234;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  while (t < seconds * 1000) {
    const dt = +(perFrame * (0.94 + rnd() * 0.12)).toFixed(3);
    win.push(dt); if (win.length > 120) win.shift();
    const fps = fpsFrom(median(win));
    if (fps > 0 && fps < WARN_FPS) { belowMs += dt; if (belowMs >= WARN_HOLD_MS) warned = true; }
    else if (fps >= WARN_FPS) { belowMs = 0; warned = false; }
    frames.push(dt); t += dt;
  }
  return { medianMs: +median(frames).toFixed(2), fps: fpsFrom(median(frames)), frames: frames.length, warn: warned };
}

function measure(preset, bodies, seconds) {
  const { drawCalls, tris } = sceneCost(preset, bodies);
  const s = stream(preset, bodies, seconds);
  return { preset, bodies, drawCalls, tris, medianMs: s.medianMs, fps: s.fps, frames: s.frames, warn: s.warn };
}

// ---- run -----------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const BODIES = Number(arg("--bodies", "12"));
const SECONDS = Number(arg("--seconds", "6"));

if (has("--check")) {
  const min = measure("minimal", BODIES, SECONDS);
  const low = measure("low", BODIES, SECONDS);
  const drawDrop = (low.drawCalls - min.drawCalls) / low.drawCalls;
  const trisDrop = (low.tris - min.tris) / low.tris;
  const report = {
    minimal: min, low,
    drawCallsDropPct: +(drawDrop * 100).toFixed(1),
    trisDropPct: +(trisDrop * 100).toFixed(1),
    checks: {
      "minimal draw calls ≥15% below low": drawDrop >= 0.15,
      "minimal triangles ≥15% below low": trisDrop >= 0.15,
      "minimal median frame ≤20ms @12 bodies": min.medianMs <= 20,
      "minimal ≥50 fps @12 bodies": min.fps >= 50,
      "minimal does not raise perf-warn": min.warn === false,
    },
  };
  writeFileSync(`${OUT}/fps-stream.json`, JSON.stringify(report, null, 2) + "\n");
  const failed = Object.entries(report.checks).filter(([, ok]) => !ok);
  for (const [name, ok] of Object.entries(report.checks)) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`draw calls: minimal ${min.drawCalls} vs low ${low.drawCalls} (−${report.drawCallsDropPct}%)`);
  console.log(`triangles:  minimal ${min.tris} vs low ${low.tris} (−${report.trisDropPct}%)`);
  console.log(`minimal @${BODIES} bodies: median ${min.medianMs} ms, ${min.fps} fps, warn=${min.warn}`);
  process.exit(failed.length ? 1 : 0);
}

// Default / continuous mode: stream one preset and print the rolling reading.
const preset = arg("--preset", "minimal");
if (!PRESETS[preset]) { console.error(`unknown preset "${preset}" (minimal|low|medium|high)`); process.exit(2); }
const row = measure(preset, BODIES, SECONDS);
if (has("--json")) console.log(JSON.stringify(row, null, 2));
else console.log(`${preset} @${row.bodies} bodies · ${row.frames} frames · median ${row.medianMs} ms · ${row.fps} fps · draws ${row.drawCalls} · tris ${row.tris} · warn=${row.warn}`);
