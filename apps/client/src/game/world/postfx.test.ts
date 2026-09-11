import { describe, expect, it, vi } from "vitest";
import { defaultSettings, PRESETS } from "../../settings";
import { GameEvents } from "../events";
import type { GameContext } from "../context";
const created = vi.hoisted(() => [] as any[]);
vi.mock("@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline", () => ({
  DefaultRenderingPipeline: class {
    sharpen = {}; prepare = vi.fn(); dispose = vi.fn();
    constructor() { created.push(this); }
  },
}));
import { installPostFx, postFxPlan, BASE_EXPOSURE } from "./postfx";

describe("live graphics lifecycle", () => {
  it("keeps FXAA independent of the post-processing toggle", () => {
    expect(postFxPlan({ ...PRESETS.low, antialiasing: true })).toEqual({ aa: true, bloom: false, sharpen: false });
  });
  /**
   * `markDirty` on every material in the scene is the single most expensive thing this module can
   * do — 121 materials on the real map, all re-deriving their defines on the next frame. It exists
   * for ONE transition: the pipeline coming or going takes the image-processing conversion with it,
   * and a frozen PBR material would otherwise keep outputting linear colour to the display.
   *
   * So the count is the assertion. It used to run on every `settings` event that reached the module,
   * which meant a stall for every step of the brightness slider and one every time the automatic
   * quality director changed tier — i.e. exactly when the machine was already behind.
   */
  it("invalidates frozen shaders when the pipeline comes or goes, and only then", () => {
    created.length = 0;
    const settings = defaultSettings(); settings.graphics = { ...PRESETS.high, brightness: 1.2 };
    const events = new GameEvents(); const material = { markDirty: vi.fn() };
    const ip: any = {};
    const ctx = { settings, events, camera: {}, scene: { imageProcessingConfiguration: ip, materials: [material] } } as unknown as GameContext;
    const dispose = installPostFx(ctx)!;
    const first = created[0]; expect(first.prepare).toHaveBeenCalledTimes(1);
    // Install: no pipeline -> a pipeline. That is a flip, and nothing is compiled yet anyway.
    expect(material.markDirty).toHaveBeenCalledTimes(1);

    // An unrelated setting never reaches the body at all.
    settings.audio.master = .1; events.emit("settings", {});
    expect(created).toHaveLength(1); expect(first.dispose).not.toHaveBeenCalled();
    expect(material.markDirty).toHaveBeenCalledTimes(1);

    // Brightness is a UNIFORM. It must reach `exposure` and must not touch a single material.
    settings.graphics.brightness = 1.3; events.emit("settings", {});
    expect(created).toHaveLength(1); expect(ip.exposure).toBeCloseTo(BASE_EXPOSURE * 1.3);
    expect(material.markDirty).toHaveBeenCalledTimes(1);

    // HIGH -> LOW: the pipeline goes, so the conversion changes, so the sweep must run.
    settings.graphics = { ...PRESETS.low, brightness: 1.3 }; events.emit("settings", {});
    expect(first.dispose).toHaveBeenCalledTimes(1); expect(ip.applyByPostProcess).toBe(false);
    expect(ip.exposure).toBeCloseTo(BASE_EXPOSURE * 1.3); expect(material.markDirty).toHaveBeenCalledTimes(2);
    expect(ip.vignetteEnabled).toBe(false);

    // LOW -> HIGH: it comes back. Also a flip.
    settings.graphics = { ...PRESETS.high, brightness: 1.3 }; events.emit("settings", {});
    expect(created).toHaveLength(2);
    expect(material.markDirty).toHaveBeenCalledTimes(3);

    // HIGH -> ULTRA: bloom and sharpen change, so the pipeline is rebuilt — but there was one before
    // and there is one after, so the materials' conversion is unchanged and they are left alone.
    settings.graphics = { ...PRESETS.ultra, brightness: 1.3 }; events.emit("settings", {});
    expect(created).toHaveLength(3);
    expect(material.markDirty).toHaveBeenCalledTimes(3);

    dispose(); const calls = material.markDirty.mock.calls.length; events.emit("settings", {});
    expect(material.markDirty).toHaveBeenCalledTimes(calls);
  });
});
