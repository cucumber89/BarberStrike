import { describe, expect, it } from "vitest";
import { applyQualityMode, qualityMode, applyQualityPreset, defaultSettings, isCustomGraphics, PRESETS, repairSettings } from "./settings";

describe("graphics settings migration", () => {
  it("repairs old saves using their preset without losing valid overrides", () => {
    const g = repairSettings({ graphics: { preset: "low", renderScale: .8 } }).graphics;
    expect(g.shadows).toBe("off"); expect(g.brightness).toBe(1);
    expect(g.targetFps).toBe(60); expect(g.renderScale).toBe(.8);
  });
  it("rejects corrupt enums, booleans and non-finite numbers", () => {
    const g = repairSettings({ graphics: { preset: "potato", shadows: "yes", renderer: "vulkan", renderScale: NaN, brightness: Infinity, targetFps: -1, effects: -20, antialiasing: "false" } }).graphics;
    // Repairs to the DEFAULTS, and the default is automatic quality — a blob with a corrupt
    // preset must not silently hand the player a fixed level they never chose.
    expect(g).toEqual({ ...PRESETS.medium, auto: true, effects: 0 });
  });
  it("bounds user display values", () => {
    const g = repairSettings({ graphics: { renderScale: 9, brightness: -5 } }).graphics;
    expect(g.renderScale).toBe(1); expect(g.brightness).toBe(.75);
  });
  it("keeps brightness, renderer and FPS target across quality changes", () => {
    const g = { ...defaultSettings().graphics, auto: false, brightness: 1.2, renderer: "webgl2" as const, targetFps: 90 as const };
    const low = applyQualityPreset(g, "low");
    expect(low).toEqual({ ...PRESETS.low, brightness: 1.2, renderer: "webgl2", targetFps: 90 });
    expect(isCustomGraphics(low)).toBe(false);
    expect(isCustomGraphics({ ...low, shadows: "high" })).toBe(true);
  });

  it("does not call the auto director's own choices 'custom'", () => {
    // While automatic quality is on it owns shadows, scale and the rest, so a level it picked is
    // not the player having tweaked something and must not be labelled as such.
    const auto = { ...defaultSettings().graphics, shadows: "high" as const, renderScale: 0.6 };
    expect(auto.auto).toBe(true);
    expect(isCustomGraphics(auto)).toBe(false);
    expect(isCustomGraphics({ ...auto, auto: false })).toBe(true);
  });

  it("the four buttons the player sees map onto a level plus the auto flag", () => {
    const base = defaultSettings().graphics;
    expect(qualityMode(base)).toBe("auto");
    const perf = applyQualityMode(base, "low");
    expect(perf).toMatchObject({ preset: "low", auto: false });
    expect(qualityMode(perf)).toBe("low");
    // Going back to AUTOMATIC keeps the level it is on and hands control over.
    const back = applyQualityMode(perf, "auto");
    expect(back).toMatchObject({ preset: "low", auto: true });
    expect(qualityMode(back)).toBe("auto");
    // Personal display choices survive either way.
    const tuned = { ...base, brightness: 1.3, targetFps: 120 as const };
    expect(applyQualityMode(tuned, "high")).toMatchObject({ brightness: 1.3, targetFps: 120 });
  });
});
