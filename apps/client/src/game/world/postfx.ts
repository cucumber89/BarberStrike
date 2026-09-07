import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import type { GameModule } from "../context";
import type { Settings } from "../../settings";

/** Quality changes optional effects, never the exposure or gamma convention of the map. */
export function postFxPlan(g: Settings["graphics"]) {
  return {
    bloom: g.postProcessing && (g.preset === "high" || g.preset === "ultra"),
    sharpen: g.postProcessing && g.preset === "ultra",
    aa: g.antialiasing,
  };
}

export const installPostFx: GameModule = (ctx) => {
  let pipeline: DefaultRenderingPipeline | null = null;
  let previous = "";
  let brightness = -1;
  const build = (s: Settings) => {
    const plan = postFxPlan(s.graphics);
    const key = JSON.stringify(plan);
    const colorChanged = brightness !== s.graphics.brightness;
    if (key === previous && !colorChanged) return;
    const ip = ctx.scene.imageProcessingConfiguration;
    if (key !== previous) {
      pipeline?.dispose();
      pipeline = null;
      ip.applyByPostProcess = false;
      if (plan.aa || plan.bloom || plan.sharpen) {
        // Configure once, then build once. LDR + material grading on low/medium; HDR only
        // where bloom needs the highlights. FXAA is independent of the effects toggle.
        const p = new DefaultRenderingPipeline("fb_pp", plan.bloom, ctx.scene, [ctx.camera], false);
        p.fxaaEnabled = plan.aa;
        p.samples = 1;
        p.bloomEnabled = plan.bloom;
        p.bloomThreshold = .85;
        p.bloomWeight = .12;
        p.bloomKernel = 32;
        p.bloomScale = .25;
        p.imageProcessingEnabled = true;
        p.sharpenEnabled = plan.sharpen;
        p.sharpen.edgeAmount = .2;
        p.sharpen.colorAmount = 1;
        p.grainEnabled = false;
        p.chromaticAberrationEnabled = false;
        p.prepare();
        pipeline = p;
      }
      previous = key;
    }
    ip.toneMappingEnabled = false;
    ip.exposure = 1.25 * s.graphics.brightness;
    ip.contrast = 1.05;
    ip.vignetteEnabled = false;
    brightness = s.graphics.brightness;
    // Frozen PBR materials otherwise keep the old shader and output linear colour straight
    // to the display after HIGH -> LOW. Clear readiness without leaving materials unfrozen.
    for (const material of ctx.scene.materials) material.markDirty(true);
  };
  build(ctx.settings);
  const off = ctx.events.on("settings", () => build(ctx.settings));
  return () => { off(); pipeline?.dispose(); ctx.scene.imageProcessingConfiguration.applyByPostProcess = false; };
};
