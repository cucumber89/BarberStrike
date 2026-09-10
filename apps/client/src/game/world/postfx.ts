import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import type { GameModule } from "../context";
import type { Settings } from "../../settings";

/**
 * Exposure before the player's brightness slider multiplies it. Higher than the 1.25 it used to be
 * because ACES tone mapping darkens the midtones it rolls the highlights out of; the pair is tuned
 * together and neither number means anything alone.
 */
export const BASE_EXPOSURE = 1.85;

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
    const hadPipeline = pipeline !== null;
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
    // ACES, not clipping. Rendering straight to the display with no tone curve means every value
    // over 1 lands on flat white, and at night that is most of what a light touches: RENDERED, the
    // district's concrete read as near-white paper, every practical was a white blob with no
    // fixture visible inside it, and the roofs it did not reach were pure black. No amount of
    // repainting fixes that, because the paint was never what the eye was seeing. ACES rolls the
    // highlights off instead, which is what puts a lit pool of ground BETWEEN white and black and
    // lets a lamp read as a lamp. Exposure goes up to pay for the curve's darker midtones.
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = BASE_EXPOSURE * s.graphics.brightness;
    ip.contrast = 1.1;
    ip.vignetteEnabled = false;
    brightness = s.graphics.brightness;
    // Frozen PBR materials otherwise keep the old shader and output linear colour straight
    // to the display after HIGH -> LOW. Clear readiness without leaving materials unfrozen.
    //
    // ONLY when the pipeline itself came or went, which is the transition that changes the colour
    // convention. It used to run on every `settings` event, and MEASURED on the real map that is a
    // 273 ms frame the first time and 506 ms the second, against 4-9 ms steady — 121 materials all
    // re-validating at once. Two things fire that event constantly: the brightness slider (a freeze
    // per drag step) and the automatic quality director, which changes tier exactly when the machine
    // is already behind. A system built to protect the framerate was stalling the game a quarter of
    // a second every time it acted. Exposure and contrast are uniforms; they never needed this.
    if (hadPipeline !== (pipeline !== null)) {
      for (const material of ctx.scene.materials) material.markDirty(true);
    }
  };
  build(ctx.settings);
  const off = ctx.events.on("settings", () => build(ctx.settings));
  return () => { off(); pipeline?.dispose(); ctx.scene.imageProcessingConfiguration.applyByPostProcess = false; };
};
