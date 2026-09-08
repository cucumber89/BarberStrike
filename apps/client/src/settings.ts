export type QualityPreset = "low" | "medium" | "high" | "ultra";

export interface Settings {
  gameplay: {
    sensitivity: number; // 0.5 .. 10 (radians per pixel × 1000 → 1.0 ≈ 0.001 rad/px)
    invertY: boolean;
    fov: number; // 70..110
    headBob: number; // 0..1
    cameraShake: number; // 0..1
  };
  graphics: {
    preset: QualityPreset;
    renderer: "auto" | "webgl2";
    renderScale: number; // 0.5 .. 1.0
    brightness: number; // 0.75 .. 1.5; independent of quality
    targetFps: 60 | 90 | 120;
    shadows: "off" | "medium" | "high";
    postProcessing: boolean;
    effects: number; // 0..1 (particle/tracer density)
    antialiasing: boolean;
    /** Lower the render scale automatically when frames get slow (see perf/dynamicScale.ts). */
    dynamicResolution: boolean;
    /**
     * Optional imported scenery. Characters and weapons always use the procedural builders
     * so their silhouette and grip alignment remain consistent across quality presets.
     */
    importedModels: boolean;
  };
  audio: {
    master: number;
    effects: number;
    music: number;
    ui: number;
  };
  nickname: string;
}

const KEY = "fb_settings_v1";

export const PRESETS: Record<QualityPreset, Settings["graphics"]> = {
  low: { preset: "low", renderer: "auto", brightness: 1, targetFps: 60, renderScale: 0.75, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false, dynamicResolution: true, importedModels: false },
  medium: { preset: "medium", renderer: "auto", brightness: 1, targetFps: 60, renderScale: 1.0, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true, dynamicResolution: true, importedModels: true },
  high: { preset: "high", renderer: "auto", brightness: 1, targetFps: 60, renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: true, importedModels: true },
  ultra: { preset: "ultra", renderer: "auto", brightness: 1, targetFps: 60, renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: false, importedModels: true },
};

export const defaultSettings = (): Settings => ({
  gameplay: { sensitivity: 2.2, invertY: false, fov: 90, headBob: 0.6, cameraShake: 0.7 },
  // MEDIUM, not HIGH: the 0.1 beta playtest on a real machine reported low FPS with HIGH as the
  // default (2048 PCF shadows + HDR bloom + MSAA at full scale). Players can opt up.
  graphics: { ...PRESETS.medium },
  audio: { master: 0.8, effects: 1.0, music: 0.5, ui: 0.8 },
  nickname: "",
});

const num = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

export function repairGraphics(input: unknown, fallback = PRESETS.medium): Settings["graphics"] {
  const g = (input && typeof input === "object" ? input : {}) as Partial<Settings["graphics"]>;
  const preset = g.preset === "low" || g.preset === "medium" || g.preset === "high" || g.preset === "ultra" ? g.preset : fallback.preset;
  const base = g.preset === preset ? PRESETS[preset] : fallback;
  return {
    preset,
    renderer: g.renderer === "auto" || g.renderer === "webgl2" ? g.renderer : base.renderer,
    renderScale: num(g.renderScale, base.renderScale, .5, 1),
    brightness: num(g.brightness, base.brightness, .75, 1.5),
    targetFps: g.targetFps === 60 || g.targetFps === 90 || g.targetFps === 120 ? g.targetFps : base.targetFps,
    shadows: g.shadows === "off" || g.shadows === "medium" || g.shadows === "high" ? g.shadows : base.shadows,
    postProcessing: bool(g.postProcessing, base.postProcessing),
    antialiasing: bool(g.antialiasing, base.antialiasing),
    dynamicResolution: bool(g.dynamicResolution, base.dynamicResolution),
    importedModels: bool(g.importedModels, base.importedModels),
    effects: num(g.effects, base.effects, 0, 1),
  };
}

export function applyQualityPreset(g: Settings["graphics"], preset: QualityPreset): Settings["graphics"] {
  return { ...PRESETS[preset], renderer: g.renderer, brightness: g.brightness, targetFps: g.targetFps };
}

/** Personal display preferences do not make a quality preset custom. */
export function isCustomGraphics(g: Settings["graphics"]): boolean {
  return (["renderScale", "shadows", "postProcessing", "effects", "antialiasing", "dynamicResolution", "importedModels"] as const)
    .some(key => g[key] !== PRESETS[g.preset][key]);
}

export function repairSettings(input: unknown, base = defaultSettings()): Settings {
  const parsed = (input && typeof input === "object" ? input : {}) as Partial<Settings>;
  const g = parsed.gameplay ?? base.gameplay, audio = parsed.audio ?? base.audio;
  return {
    gameplay: { sensitivity: num(g.sensitivity, base.gameplay.sensitivity, .3, 8), invertY: bool(g.invertY, base.gameplay.invertY),
      fov: num(g.fov, base.gameplay.fov, 70, 110), headBob: num(g.headBob, base.gameplay.headBob, 0, 1), cameraShake: num(g.cameraShake, base.gameplay.cameraShake, 0, 1) },
    graphics: repairGraphics(parsed.graphics, base.graphics),
    audio: { master: num(audio.master, base.audio.master, 0, 1), effects: num(audio.effects, base.audio.effects, 0, 1),
      music: num(audio.music, base.audio.music, 0, 1), ui: num(audio.ui, base.audio.ui, 0, 1) },
    nickname: typeof parsed.nickname === "string" ? parsed.nickname : "",
  };
}
export function loadSettings(): Settings {
  try { return repairSettings(JSON.parse(localStorage.getItem(KEY) ?? "null")); }
  catch { return defaultSettings(); }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
