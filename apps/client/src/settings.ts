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
  low: { preset: "low", renderer: "auto", renderScale: 0.75, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false, dynamicResolution: true, importedModels: false },
  medium: { preset: "medium", renderer: "auto", renderScale: 1.0, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true, dynamicResolution: true, importedModels: true },
  high: { preset: "high", renderer: "auto", renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: true, importedModels: true },
  ultra: { preset: "ultra", renderer: "auto", renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: false, importedModels: true },
};

export const defaultSettings = (): Settings => ({
  gameplay: { sensitivity: 2.2, invertY: false, fov: 90, headBob: 0.6, cameraShake: 0.7 },
  // MEDIUM, not HIGH: the 0.1 beta playtest on a real machine reported low FPS with HIGH as the
  // default (2048 PCF shadows + HDR bloom + MSAA at full scale). Players can opt up.
  graphics: { ...PRESETS.medium },
  audio: { master: 0.8, effects: 1.0, music: 0.5, ui: 0.8 },
  nickname: "",
});

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      gameplay: { ...base.gameplay, ...(parsed.gameplay ?? {}) },
      graphics: { ...base.graphics, ...(parsed.graphics ?? {}) },
      audio: { ...base.audio, ...(parsed.audio ?? {}) },
      nickname: typeof parsed.nickname === "string" ? parsed.nickname : "",
    };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
