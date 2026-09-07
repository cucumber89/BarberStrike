import { describe, expect, it } from "vitest";
import { applyQualityPreset, defaultSettings, isCustomGraphics, PRESETS, repairSettings } from "./settings";

describe("graphics settings migration", () => {
  it("repairs old saves using their preset without losing valid overrides", () => {
    const g = repairSettings({ graphics: { preset: "low", renderScale: .8 } }).graphics;
    expect(g.shadows).toBe("off"); expect(g.brightness).toBe(1);
    expect(g.targetFps).toBe(60); expect(g.renderScale).toBe(.8);
  });
  it("rejects corrupt enums, booleans and non-finite numbers", () => {
    const g = repairSettings({ graphics: { preset: "potato", shadows: "yes", renderer: "vulkan", renderScale: NaN, brightness: Infinity, targetFps: -1, effects: -20, antialiasing: "false" } }).graphics;
    expect(g).toEqual({ ...PRESETS.medium, effects: 0 });
  });
  it("bounds user display values", () => {
    const g = repairSettings({ graphics: { renderScale: 9, brightness: -5 } }).graphics;
    expect(g.renderScale).toBe(1); expect(g.brightness).toBe(.75);
  });
  it("keeps brightness, renderer and FPS target across quality changes", () => {
    const g = { ...defaultSettings().graphics, brightness: 1.2, renderer: "webgl2" as const, targetFps: 90 as const };
    const low = applyQualityPreset(g, "low");
    expect(low).toEqual({ ...PRESETS.low, brightness: 1.2, renderer: "webgl2", targetFps: 90 });
    expect(isCustomGraphics(low)).toBe(false);
    expect(isCustomGraphics({ ...low, shadows: "high" })).toBe(true);
  });
});
