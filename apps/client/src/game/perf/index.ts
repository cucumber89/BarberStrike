import type { GameModule } from "../context";
import { hud } from "../store";
import { DynamicScale } from "./dynamicScale";

/**
 * Performance module:
 * - dynamic render scale (the safety valve for slow GPUs — see dynamicScale.ts; user-toggleable);
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
    if (g.targetFps !== targetFps) { targetFps = g.targetFps; scaler.setTargetFps(targetFps); }
    if (g.renderScale === target && g.dynamicResolution === enabled) return;
    target = g.renderScale; enabled = g.dynamicResolution;
    scaler.retarget(target);
    applyScale(target);
  });

  const offFrame = ctx.onAfterRender((dt) => {
    // Background-tab throttling and shader compilation are not sustained GPU load.
    if (document.hidden) return;
    const now = performance.now();
    // Readiness walks the scene: checking it every frame would itself cost CPU time.
    if (now - readinessAt > 500) { ready = scene.isReady(); readinessAt = now; }
    acc += dt; frames++;
    if (dt > worst) worst = dt;
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
        },
      });
    } else {
      hud.set({ fps });
    }
    acc = 0; frames = 0; worst = 0; last = now; lastDraws = drawCalls();
  });

  return () => { offSettings(); offFrame(); };
};
