import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import type { GameModule } from "../context";
import type { Settings } from "../../settings";

/**
 * Post-processing, scaled by the quality preset. Readability first: ACES tone mapping and a
 * touch of contrast on every preset; FXAA from MEDIUM; restrained bloom + a soft vignette on
 * HIGH/ULTRA. No chromatic aberration, grain or blur anywhere.
 */
export const installPostFx: GameModule = (ctx) => {
  let pipeline: DefaultRenderingPipeline | null = null;

  const build = (s: Settings) => {
    pipeline?.dispose();
    pipeline = null;
    const g = s.graphics;
    // MEASURED: ACES (and even KHR-neutral) tone mapping crushed the practical lighting into
    // near-black; readability wins, so gameplay runs without a tone curve — only exposure/contrast.
    const ip = ctx.scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = false;
    ip.exposure = 1.25;
    ip.contrast = 1.05;
    ip.vignetteEnabled = false;
    if (!g.postProcessing) return;
    const rich = g.preset === "high" || g.preset === "ultra";
    // HDR (half-float render targets) only where bloom needs it; on MEDIUM the pipeline is
    // FXAA + colour grading on an 8-bit target, which is much cheaper on integrated GPUs.
    const p = new DefaultRenderingPipeline("fb_pp", rich, ctx.scene, [ctx.camera]);
    p.fxaaEnabled = g.antialiasing;
    p.samples = 1;
    p.bloomEnabled = rich;
    if (rich) {
      p.bloomThreshold = 0.85;
      p.bloomWeight = 0.18;
      p.bloomKernel = 48;
      p.bloomScale = 0.5;
    }
    p.imageProcessingEnabled = true;
    p.imageProcessing.toneMappingEnabled = false;
    p.imageProcessing.exposure = 1.25;
    p.imageProcessing.contrast = 1.05;
    p.imageProcessing.vignetteEnabled = rich;
    p.imageProcessing.vignetteWeight = 1.2;
    p.imageProcessing.vignetteStretch = 0.4;
    p.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
    p.sharpenEnabled = g.preset === "ultra";
    if (p.sharpenEnabled) { p.sharpen.edgeAmount = 0.25; p.sharpen.colorAmount = 1; }
    p.grainEnabled = false;
    p.chromaticAberrationEnabled = false;
    pipeline = p;
  };

  build(ctx.settings);
  const off = ctx.events.on("settings", () => build(ctx.settings));
  return () => { off(); pipeline?.dispose(); };
};
