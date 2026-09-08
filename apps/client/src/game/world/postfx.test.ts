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
import { installPostFx, postFxPlan } from "./postfx";

describe("live graphics lifecycle", () => {
  it("keeps FXAA independent of the post-processing toggle", () => {
    expect(postFxPlan({ ...PRESETS.low, antialiasing: true })).toEqual({ aa: true, bloom: false, sharpen: false });
  });
  it("invalidates frozen shaders on HIGH -> LOW, preserves calibration and skips unrelated settings", () => {
    created.length = 0;
    const settings = defaultSettings(); settings.graphics = { ...PRESETS.high, brightness: 1.2 };
    const events = new GameEvents(); const material = { markDirty: vi.fn() };
    const ip: any = {};
    const ctx = { settings, events, camera: {}, scene: { imageProcessingConfiguration: ip, materials: [material] } } as unknown as GameContext;
    const dispose = installPostFx(ctx)!;
    const first = created[0]; expect(first.prepare).toHaveBeenCalledTimes(1);
    settings.audio.master = .1; events.emit("settings", {});
    expect(created).toHaveLength(1); expect(first.dispose).not.toHaveBeenCalled();
    settings.graphics.brightness = 1.3; events.emit("settings", {});
    expect(created).toHaveLength(1); expect(ip.exposure).toBeCloseTo(1.625);
    settings.graphics = { ...PRESETS.low, brightness: 1.3 }; events.emit("settings", {});
    expect(first.dispose).toHaveBeenCalledTimes(1); expect(ip.applyByPostProcess).toBe(false);
    expect(ip.exposure).toBeCloseTo(1.625); expect(material.markDirty).toHaveBeenCalledTimes(3);
    expect(ip.vignetteEnabled).toBe(false);
    dispose(); const calls = material.markDirty.mock.calls.length; events.emit("settings", {});
    expect(material.markDirty).toHaveBeenCalledTimes(calls);
  });
});
