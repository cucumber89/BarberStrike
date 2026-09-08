import type { GameModule } from "../context";
import { hud } from "../store";
import { DynamicScale } from "./dynamicScale";
import { AutoQuality, type AutoTier } from "./autoQuality";
import { tierFromMeasurement } from "./deviceProbe";
import { applyQualityPreset } from "../../settings";

/**
 * Performance module:
 * - AUTOMATIC QUALITY (2.4): while `graphics.auto` is on, the whole preset — render scale, shadows,
 *   post-processing, antialiasing and effect density — is chosen from measured frame times rather
 *   than from a menu the player has to find. A short startup measurement sets the opening level
 *   (see deviceProbe.ts), then `AutoQuality` moves it one step at a time with long hysteresis and
 *   gives up climbing after two reversals, so it settles instead of flapping;
 * - dynamic render scale (the finer, faster safety valve underneath it — see dynamicScale.ts);
 * - telemetry (dev only): FPS, frame time, worst frame, draw calls, active meshes, particles,
 *   prediction corrections and network state, published to the hud store twice a second.
 */
export const installPerf: GameModule = (ctx) => {
  let acc = 0, frames = 0, last = 0, worst = 0;
  const engine = ctx.engine;
  const scene = ctx.scene;
  const dev = import.meta.env.DEV;
  const scaler = new DynamicScale({ target: ctx.settings.graphics.renderScale });
  scaler.setTargetFps(ctx.settings.graphics.targetFps);
  let target = ctx.settings.graphics.renderScale;
  let enabled = ctx.settings.graphics.dynamicResolution;
  let targetFps = ctx.settings.graphics.targetFps;
  let ready = true, readinessAt = 0;
  let currentScale = ctx.settings.graphics.renderScale;
  // Babylon's draw-call counter only resets per frame under EngineInstrumentation; without it the
  // value is cumulative (the 1.0 playtest F3 showed "1 972 685"). Report the per-window delta.
  const drawCalls = () => (engine as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? 0;
  let lastDraws = drawCalls();

  const applyScale = (s: number) => {
    if (s === currentScale) return;
    currentScale = s;
    engine.setHardwareScalingLevel(1 / s);
  };

  const offSettings = ctx.events.on("settings", () => {
    const g = ctx.settings.graphics;
    if (g.targetFps !== targetFps) { targetFps = g.targetFps; scaler.setTargetFps(targetFps); director.setTargetFps(targetFps); }
    // A hand-picked level ends the argument: adopt it and forget everything measured so far.
    if (!g.auto && probeFrames) probeFrames = null;
    if (!g.auto && director.tier !== g.preset && (["low", "medium", "high"] as AutoTier[]).includes(g.preset as AutoTier)) director.reset(g.preset as AutoTier);
    if (g.renderScale === target && g.dynamicResolution === enabled) return;
    target = g.renderScale; enabled = g.dynamicResolution;
    scaler.retarget(target);
    applyScale(target);
  });

  // ---- automatic quality ------------------------------------------------------------------
  const startTier = (["low", "medium", "high"] as AutoTier[]).includes(ctx.settings.graphics.preset as AutoTier)
    ? ctx.settings.graphics.preset as AutoTier : "medium";
  const director = new AutoQuality(startTier, { targetFps: ctx.settings.graphics.targetFps });
  /**
   * The startup measurement. The first second is thrown away — shader compilation, texture upload
   * and the first frames of a scene are not what the machine can sustain — then a second of real
   * frames is collected and its MEDIAN (not mean: one 300 ms hitch must not decide the level) picks
   * the opening quality. After that the director takes over.
   */
  let probeFrames: number[] | null = ctx.settings.graphics.auto ? [] : null;
  let probeStart = 0;
  const applyTier = (tier: AutoTier, why: string) => {
    if (tier === ctx.settings.graphics.preset) return;
    const next = applyQualityPreset(ctx.settings.graphics, tier);
    ctx.settings.graphics = { ...next, auto: true };
    console.info(`[quality] ${why} → ${tier}`);
    ctx.events.emit("settings", {});
  };

  const offFrame = ctx.onAfterRender((dt) => {
    // Background-tab throttling and shader compilation are not sustained GPU load.
    if (document.hidden) return;
    const now = performance.now();
    // Readiness walks the scene: checking it every frame would itself cost CPU time.
    if (now - readinessAt > 500) { ready = scene.isReady(); readinessAt = now; }
    acc += dt; frames++;
    if (dt > worst) worst = dt;
    if (ctx.settings.graphics.auto && ready) {
      if (probeFrames) {
        if (probeStart === 0) probeStart = now;
        // Discard the first second outright, then take one second of frames.
        if (now - probeStart > 1000) probeFrames.push(dt);
        if (now - probeStart > 2000) {
          const sorted = [...probeFrames].sort((a, b) => a - b);
          const median = sorted.length ? sorted[sorted.length >> 1] : 16.7;
          const tier = tierFromMeasurement(startTier, median, ctx.settings.graphics.targetFps);
          probeFrames = null;
          director.reset(tier);
          applyTier(tier, `measured ${median.toFixed(1)} ms/frame at start`);
        }
      } else {
        const next = director.update(dt);
        if (next !== null) applyTier(next, `frame time settled at ${director.smoothedMs.toFixed(1)} ms`);
      }
    }
    if (ctx.settings.graphics.dynamicResolution && ready) {
      const next = scaler.update(dt);
      if (next !== null) applyScale(next);
    }
    if (now - last < 500) return;
    const fps = frames > 0 ? Math.round(1000 / (acc / frames)) : 0;
    if (dev) {
      let particles = 0;
      for (const ps of scene.particleSystems) particles += ps.getActiveCount();
      hud.set({
        fps,
        telemetry: {
          "frame ms": (acc / frames).toFixed(1),
          "worst ms": worst.toFixed(1),
          "render scale": `${Math.round(currentScale * 100)}%`,
          "draw calls": frames > 0 ? Math.round((drawCalls() - lastDraws) / frames) : 0,
          "active meshes": scene.getActiveMeshes().length,
          "total meshes": scene.meshes.length,
          particles,
          "pending inputs": ctx.local.pendingCount,
          corrections: ctx.local.correctionCount,
          "ping ms": Math.round(ctx.connection.rtt),
          renderer: ctx.rendererKind,
          quality: `${ctx.settings.graphics.preset}${ctx.settings.graphics.auto ? " (auto)" : ""}`,
        },
      });
    } else {
      hud.set({ fps });
    }
    acc = 0; frames = 0; worst = 0; last = now; lastDraws = drawCalls();
  });

  return () => { offSettings(); offFrame(); };
};
