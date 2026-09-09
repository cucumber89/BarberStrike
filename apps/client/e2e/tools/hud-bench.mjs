#!/usr/bin/env node
/**
 * What the HUD costs, measured. Drives the real component through four seconds of a live match
 * (per-frame fields plus a snapshot 20x a second) and reports React's own commit numbers.
 *
 *   node apps/client/e2e/tools/hud-bench.mjs [--url http://localhost:5199] [--label before]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/hud");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:5199");
const LABEL = arg("--label", "run");
// Which parts of a live match to drive: snapshot | smoke | radar | all. See src/hudBench.tsx.
const DRIVE = arg("--drive", "snapshot");
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.error("[page]", e.message));
await page.goto(`${BASE}/hud-bench.html?drive=${DRIVE}`, { waitUntil: "networkidle" });
// Chromium's own counters. The React numbers above say how much JS the HUD runs; these say how
// much LAYOUT and STYLE work it forces the browser into, which is the half a transition on `width`
// or `left` pays for and a transform does not.
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const before = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
await page.waitForFunction(() => window.bench?.done === true, null, { timeout: 30_000 });
const b = await page.evaluate(() => window.bench);
const after = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const delta = (k) => Math.round((after[k] ?? 0) - (before[k] ?? 0));
await browser.close();

const times = (b.times ?? []).slice().sort((x, y) => x - y);
const pct = (q) => (times.length ? +times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(2) : 0);
const perFrame = b.totalMs / b.frames;
const row = {
  label: LABEL, drive: DRIVE, frames: b.frames, commits: b.commits,
  commitsPerFrame: +(b.commits / b.frames).toFixed(2),
  totalMs: +b.totalMs.toFixed(1),
  msPerFrame: +perFrame.toFixed(3),
  firstCommitMs: +((b.times ?? [])[0] ?? 0).toFixed(2),
  medianCommitMs: pct(0.5),
  p95CommitMs: pct(0.95),
  worstCommitMs: +b.maxMs.toFixed(2),
  // The mount is paid once; what a player feels every round is the steady state after it.
  worstAfterMountMs: +Math.max(...(b.times ?? [0]).slice(1), 0).toFixed(2),
  // 16.7 ms is one frame at 60 fps. The HUD shares that budget with the whole game.
  pctOfFrameBudget: +((perFrame / 16.7) * 100).toFixed(1),
  // Browser-side cost, straight from Chromium.
  layouts: delta("LayoutCount"),
  styleRecalcs: delta("RecalcStyleCount"),
  layoutMs: +((after.LayoutDuration ?? 0) - (before.LayoutDuration ?? 0)).toFixed(3),
  styleMs: +((after.RecalcStyleDuration ?? 0) - (before.RecalcStyleDuration ?? 0)).toFixed(3),
  // ALL the main-thread JS for the run, React and everything else. The minimap draws on its own rAF
  // and never re-renders React, so this is the only number that can see it.
  scriptMs: +(((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1000).toFixed(1),
  scriptMsPerFrame: +((((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1000) / b.frames).toFixed(3),
};
writeFileSync(`${OUT}/hud-${DRIVE}-${LABEL}.json`, JSON.stringify(row, null, 2) + "\n");
console.log(JSON.stringify(row, null, 2));
