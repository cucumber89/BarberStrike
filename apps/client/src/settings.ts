import { DEFAULT_BINDINGS, type KeyBindings } from "./game/input/InputState";

export type QualityPreset = "low" | "medium" | "high" | "ultra";

/**
 * The choice a player is actually offered (the brief's four): Automatic, Performance, Balanced,
 * Quality. "auto" is not a fifth quality level — it hands `graphics.preset` to the auto-quality
 * director, which measures real frames and moves it between low / medium / high. "ultra" stays
 * reachable as a manual preset for someone who wants it, and picking it turns automatic off.
 */
export type QualityMode = "auto" | "low" | "medium" | "high" | "ultra";
export const QUALITY_MODES: readonly { id: QualityMode; label: string; blurb: string }[] = [
  { id: "auto", label: "AUTOMATIC", blurb: "Measures your machine and keeps the frame rate steady" },
  { id: "low", label: "PERFORMANCE", blurb: "Frames first — no shadows, no post-processing" },
  { id: "medium", label: "BALANCED", blurb: "Shadows and effects, full render scale" },
  { id: "high", label: "QUALITY", blurb: "Sharp shadows and every effect" },
];

/**
 * Rebindable actions.
 *
 * RESTORED AFTER main's #14, which deleted the whole rebinding surface along with the crosshair
 * and HUD-preference blocks. The owner's brief for this drop asks for rebinding, conflict
 * detection and restore-to-defaults by name, so it comes back — but only that. The crosshair,
 * hudScale, kill-feed and ADS-sensitivity settings #14 removed are NOT restored: they are not in
 * this brief and removing them was that PR's call to make. If #14 meant to drop rebinding
 * deliberately too, say so and it goes again.
 *
 * The list follows main's `KeyBindings` exactly, so it has no `objective` / `dropBomb` rows —
 * #14 removed those actions. Fire / aim / the weapon digits / Tab / Enter / Esc stay fixed.
 */
export type BindableAction = keyof KeyBindings;
export const BINDABLE_ACTIONS: readonly { id: BindableAction; label: string }[] = [
  { id: "forward", label: "Move forward" },
  { id: "back", label: "Move back" },
  { id: "left", label: "Strafe left" },
  { id: "right", label: "Strafe right" },
  { id: "jump", label: "Jump" },
  { id: "sprint", label: "Sprint (double-tap: tactical sprint)" },
  { id: "crouch", label: "Crouch" },
  { id: "reload", label: "Reload" },
  { id: "lastWeapon", label: "Last weapon" },
  { id: "melee", label: "Clippers (melee)" },
  { id: "lethal", label: "Lethal grenade (hold to cook)" },
  { id: "tactical", label: "Tactical grenade" },
  { id: "shop", label: "Buy menu" },
  { id: "inspect", label: "Inspect weapon" },
  { id: "leanLeft", label: "Lean left" },
  { id: "leanRight", label: "Lean right" },
];

/**
 * Crosshair shapes. Four is the whole list on purpose: the brief asks for a SIMPLER interface, not
 * a poorer one, and a shape picker with twenty entries is the poorer kind of rich.
 */
export type CrosshairStyle = "cross" | "cross-dot" | "dot" | "circle";
export const CROSSHAIR_STYLES: readonly { id: CrosshairStyle; label: string }[] = [
  { id: "cross", label: "CROSS" },
  { id: "cross-dot", label: "CROSS + DOT" },
  { id: "dot", label: "DOT" },
  { id: "circle", label: "CIRCLE" },
];

export interface Settings {
  /**
   * What the player sees over the game. Restored after #14 removed the crosshair block: a shooter
   * without a crosshair the player can size, colour and read against their own monitor is missing
   * the one piece of UI they look at every single second.
   */
  hud: {
    /** Frame counter and ping, top left. Was DEV-only, so a built game could never show it. */
    fps: boolean;
    crosshair: {
      style: CrosshairStyle;
      /** Arm length and thickness in px, and the gap from the centre. */
      size: number;
      thickness: number;
      gap: number;
      /** Opens with the weapon's real spread instead of standing still. */
      dynamic: boolean;
      /** Dark outline, so the reticle survives a light wall behind it. */
      outline: boolean;
      color: string;
    };
  };
  gameplay: {
    sensitivity: number; // 0.5 .. 10 (radians per pixel × 1000 → 1.0 ≈ 0.001 rad/px)
    invertY: boolean;
    fov: number; // 70..110
    headBob: number; // 0..1
    cameraShake: number; // 0..1
  };
  graphics: {
    preset: QualityPreset;
    /**
     * True while the auto-quality director owns `preset`. It is a separate flag rather than a
     * fifth preset value so everything downstream keeps reading one concrete quality level.
     */
    auto: boolean;
    /**
     * "webgl2" (the default) asks for WebGL2 directly. "auto" tries WebGPU first and falls back.
     * WebGPU is the default nowhere: it can initialise successfully and then fail inside scene
     * setup on some browser/driver pairs (which is why App.tsx already carries a retry), so the
     * mode that always works is the one players get without asking.
     */
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
  /** Rebound keys, action → codes. An action absent here uses its default; see `resolveBindings`. */
  keys: Partial<Record<BindableAction, string[]>>;
  nickname: string;
}

const KEY = "fb_settings_v1";

export const PRESETS: Record<QualityPreset, Settings["graphics"]> = {
  low: { preset: "low", auto: false, renderer: "webgl2", brightness: 1, targetFps: 60, renderScale: 0.75, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false, dynamicResolution: true, importedModels: false },
  medium: { preset: "medium", auto: false, renderer: "webgl2", brightness: 1, targetFps: 60, renderScale: 1.0, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true, dynamicResolution: true, importedModels: true },
  high: { preset: "high", auto: false, renderer: "webgl2", brightness: 1, targetFps: 60, renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: true, importedModels: true },
  ultra: { preset: "ultra", auto: false, renderer: "webgl2", brightness: 1, targetFps: 60, renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: false, importedModels: true },
};

export const defaultSettings = (): Settings => ({
  hud: {
    fps: false,
    crosshair: { style: "cross", size: 8, thickness: 2, gap: 5, dynamic: true, outline: true, color: "#ffffff" },
  },
  gameplay: { sensitivity: 2.2, invertY: false, fov: 90, headBob: 0.6, cameraShake: 0.7 },
  // AUTOMATIC out of the box: the device is probed at startup and the first seconds of real
  // frames decide the level, so nobody has to find a graphics menu to get a playable game. MEDIUM
  // is only where it starts — the 0.1 beta playtest reported low FPS with HIGH as a fixed default
  // (2048 PCF shadows + HDR bloom + MSAA at full scale), which is exactly what measuring avoids.
  graphics: { ...PRESETS.medium, auto: true },  audio: { master: 0.8, effects: 1.0, music: 0.5, ui: 0.8 },
  keys: {},
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
    auto: bool(g.auto, base.auto),
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
  return { ...PRESETS[preset], auto: g.auto, renderer: g.renderer, brightness: g.brightness, targetFps: g.targetFps };
}

/** The player picked one of the four buttons. "auto" keeps the level it is on and hands over control. */
export function applyQualityMode(g: Settings["graphics"], mode: QualityMode): Settings["graphics"] {
  if (mode === "auto") return { ...g, auto: true };
  return { ...applyQualityPreset(g, mode), auto: false };
}

/** Which of the four buttons is lit. */
export function qualityMode(g: Settings["graphics"]): QualityMode {
  return g.auto ? "auto" : g.preset;
}

/** Personal display preferences do not make a quality preset custom. */
export function isCustomGraphics(g: Settings["graphics"]): boolean {
  if (g.auto) return false;   // the director owns these; it is not the player having tweaked them
  return (["renderScale", "shadows", "postProcessing", "effects", "antialiasing", "dynamicResolution", "importedModels"] as const)
    .some(key => g[key] !== PRESETS[g.preset][key]);
}

export function repairSettings(input: unknown, base = defaultSettings()): Settings {
  const parsed = (input && typeof input === "object" ? input : {}) as Partial<Settings>;
  const g = parsed.gameplay ?? base.gameplay, audio = parsed.audio ?? base.audio;
  const hud = parsed.hud ?? base.hud;
  const ch = hud.crosshair ?? base.hud.crosshair;
  return {
    hud: {
      fps: bool(hud.fps, base.hud.fps),
      crosshair: {
        style: CROSSHAIR_STYLES.some((s) => s.id === ch.style) ? ch.style : base.hud.crosshair.style,
        size: num(ch.size, base.hud.crosshair.size, 2, 24),
        thickness: num(ch.thickness, base.hud.crosshair.thickness, 1, 6),
        gap: num(ch.gap, base.hud.crosshair.gap, 0, 20),
        dynamic: bool(ch.dynamic, base.hud.crosshair.dynamic),
        outline: bool(ch.outline, base.hud.crosshair.outline),
        // A stored colour goes straight into a CSS custom property, so it is checked against a
        // literal hex shape rather than trusted — anything else falls back to the default.
        color: typeof ch.color === "string" && /^#[0-9a-fA-F]{6}$/.test(ch.color) ? ch.color : base.hud.crosshair.color,
      },
    },
    gameplay: { sensitivity: num(g.sensitivity, base.gameplay.sensitivity, .3, 8), invertY: bool(g.invertY, base.gameplay.invertY),
      fov: num(g.fov, base.gameplay.fov, 70, 110), headBob: num(g.headBob, base.gameplay.headBob, 0, 1), cameraShake: num(g.cameraShake, base.gameplay.cameraShake, 0, 1) },
    graphics: repairGraphics(parsed.graphics, base.graphics),
    audio: { master: num(audio.master, base.audio.master, 0, 1), effects: num(audio.effects, base.audio.effects, 0, 1),
      music: num(audio.music, base.audio.music, 0, 1), ui: num(audio.ui, base.audio.ui, 0, 1) },
    keys: repairKeys(parsed.keys),
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

/** An untrusted saved blob: keep only known actions bound to plausible key codes. */
function repairKeys(input: unknown): Settings["keys"] {
  const out: Settings["keys"] = {};
  if (!input || typeof input !== "object") return out;
  for (const a of BINDABLE_ACTIONS) {
    const v = (input as Record<string, unknown>)[a.id];
    if (!Array.isArray(v)) continue;
    const codes = v.filter((c): c is string => typeof c === "string" && c.length > 0 && c.length < 32);
    if (codes.length) out[a.id] = codes;
  }
  return out;
}

/** The bindings the input layer runs with: the player's overrides over the defaults, never empty. */
export function resolveBindings(keys: Settings["keys"]): KeyBindings {
  const out: KeyBindings = { ...DEFAULT_BINDINGS };
  for (const a of BINDABLE_ACTIONS) {
    const v = keys[a.id];
    if (v && v.length) out[a.id] = [...v];
  }
  return out;
}

/** Actions that share a key with another action — shown as a conflict in the controls tab. */
export function bindingConflicts(b: KeyBindings): Set<BindableAction> {
  const seen = new Map<string, BindableAction>();
  const out = new Set<BindableAction>();
  for (const a of BINDABLE_ACTIONS) {
    for (const code of b[a.id]) {
      const other = seen.get(code);
      if (other && other !== a.id) { out.add(a.id); out.add(other); }
      else seen.set(code, a.id);
    }
  }
  return out;
}

/** A `KeyboardEvent.code` as a person reads it on a keycap. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `NUM ${code.slice(6).toUpperCase()}`;
  if (code.startsWith("Arrow")) return { Up: "\u2191", Down: "\u2193", Left: "\u2190", Right: "\u2192" }[code.slice(5)] ?? code;
  const named: Record<string, string> = {
    Space: "SPACE", ShiftLeft: "SHIFT", ShiftRight: "R SHIFT", ControlLeft: "CTRL", ControlRight: "R CTRL",
    AltLeft: "ALT", AltRight: "R ALT", Tab: "TAB", CapsLock: "CAPS", Backquote: "`", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
    Enter: "ENTER", Backspace: "BKSP", Escape: "ESC", Insert: "INS", Delete: "DEL", Home: "HOME", End: "END", PageUp: "PGUP", PageDown: "PGDN",
  };
  return named[code] ?? code.toUpperCase();
}

/** Keys the rebind capture refuses: they have a fixed job the input layer relies on. */
export const RESERVED_CODES = new Set(["Escape", "Tab", "Enter", "NumpadEnter", "KeyY", "Digit1", "Digit2", "Digit3", "F5", "F11", "F12", "MetaLeft", "MetaRight"]);
