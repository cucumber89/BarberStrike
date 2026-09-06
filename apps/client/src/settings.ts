import { DEFAULT_BINDINGS, type KeyBindings } from "./game/input/InputState";

export type QualityPreset = "low" | "medium" | "high" | "ultra";

/** Crosshair colours: named, not free hex, so every one of them has been checked against the map's palette. */
export type CrosshairColor = "white" | "green" | "cyan" | "brass" | "red" | "magenta";
export const CROSSHAIR_COLORS: Record<CrosshairColor, string> = {
  white: "#ffffff", green: "#7dff9a", cyan: "#8fd3ff", brass: "#d9a441", red: "#ff5a4a", magenta: "#ff6ad5",
};

export interface CrosshairSettings {
  color: CrosshairColor;
  /** Arm length in px (0 = dot only). */
  size: number;
  /** Gap between the arms at rest, px. */
  gap: number;
  thickness: number;
  dot: boolean;
  /** Arms open with the weapon's spread; off keeps a static crosshair. */
  dynamic: boolean;
  outline: boolean;
}

/** Actions a player can rebind. Fire / aim / the weapon digits / Tab / Enter / Esc stay fixed on purpose. */
export type BindableAction = keyof KeyBindings;
export const BINDABLE_ACTIONS: readonly { id: BindableAction; label: string }[] = [
  { id: "forward", label: "Move forward" },
  { id: "back", label: "Move back" },
  { id: "left", label: "Strafe left" },
  { id: "right", label: "Strafe right" },
  { id: "jump", label: "Jump" },
  { id: "sprint", label: "Sprint (double-tap: tactical sprint · scoped: hold breath)" },
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
  { id: "objective", label: "Plant / defuse the bomb (hold, stand still)" },
];

export interface Settings {
  gameplay: {
    sensitivity: number; // 0.3 .. 8 (radians per pixel × 1000 → 1.0 ≈ 0.001 rad/px)
    /** Multiplier applied to the sensitivity while aiming down sights (1 = same as hip). */
    adsSensitivity: number; // 0.3 .. 2
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
  /** 2.1: HUD and crosshair. */
  interface: {
    crosshair: CrosshairSettings;
    /** Whole-HUD zoom, 0.8 .. 1.3. */
    hudScale: number;
    minimap: boolean;
    killFeed: boolean;
    /** FPS and ping in the corner, also in production builds. */
    showFps: boolean;
    /** Floating "+300" wallet toasts. */
    moneyToasts: boolean;
  };
  /** 2.1: rebindable keys. Every action keeps at least one key; see `resolveBindings`. */
  keys: Partial<Record<BindableAction, string[]>>;
  nickname: string;
}

const KEY = "fb_settings_v1";

export const PRESETS: Record<QualityPreset, Settings["graphics"]> = {
  low: { preset: "low", renderer: "auto", renderScale: 0.75, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false, dynamicResolution: true, importedModels: false },
  medium: { preset: "medium", renderer: "auto", renderScale: 1.0, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true, dynamicResolution: true, importedModels: true },
  high: { preset: "high", renderer: "auto", renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: true, importedModels: true },
  ultra: { preset: "ultra", renderer: "auto", renderScale: 1.0, shadows: "high", postProcessing: true, effects: 1.0, antialiasing: true, dynamicResolution: false, importedModels: true },
};

export const DEFAULT_CROSSHAIR: CrosshairSettings = { color: "white", size: 6, gap: 5, thickness: 2, dot: false, dynamic: true, outline: true };

export const defaultSettings = (): Settings => ({
  gameplay: { sensitivity: 2.2, adsSensitivity: 1.0, invertY: false, fov: 90, headBob: 0.6, cameraShake: 0.7 },
  // MEDIUM, not HIGH: the 0.1 beta playtest on a real machine reported low FPS with HIGH as the
  // default (2048 PCF shadows + HDR bloom + MSAA at full scale). Players can opt up.
  graphics: { ...PRESETS.medium },
  audio: { master: 0.8, effects: 1.0, music: 0.5, ui: 0.8 },
  interface: { crosshair: { ...DEFAULT_CROSSHAIR }, hudScale: 1, minimap: true, killFeed: true, showFps: false, moneyToasts: true },
  keys: {},
  nickname: "",
});

const num = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    return repairSettings(JSON.parse(raw), base);
  } catch {
    return base;
  }
}

/** Merges an untrusted blob over the defaults, field by field, so an old or edited file never yields NaN or an unknown enum. */
export function repairSettings(input: unknown, base: Settings = defaultSettings()): Settings {
  const parsed = (input && typeof input === "object" ? input : {}) as Partial<Settings>;
  const ui = parsed.interface ?? ({} as Partial<Settings["interface"]>);
  const ch = ui.crosshair ?? ({} as Partial<CrosshairSettings>);
  const g = parsed.gameplay ?? ({} as Partial<Settings["gameplay"]>);
  const keys: Settings["keys"] = {};
  if (parsed.keys && typeof parsed.keys === "object") {
    for (const a of BINDABLE_ACTIONS) {
      const v = (parsed.keys as Record<string, unknown>)[a.id];
      if (Array.isArray(v)) {
        const codes = v.filter((c): c is string => typeof c === "string" && c.length > 0 && c.length < 32);
        if (codes.length) keys[a.id] = codes;
      }
    }
  }
  return {
    gameplay: {
      sensitivity: num(g.sensitivity, base.gameplay.sensitivity, 0.3, 8),
      adsSensitivity: num(g.adsSensitivity, base.gameplay.adsSensitivity, 0.3, 2),
      invertY: bool(g.invertY, base.gameplay.invertY),
      fov: num(g.fov, base.gameplay.fov, 70, 110),
      headBob: num(g.headBob, base.gameplay.headBob, 0, 1),
      cameraShake: num(g.cameraShake, base.gameplay.cameraShake, 0, 1),
    },
    graphics: { ...base.graphics, ...(parsed.graphics ?? {}) },
    audio: { ...base.audio, ...(parsed.audio ?? {}) },
    interface: {
      crosshair: {
        color: ch.color && ch.color in CROSSHAIR_COLORS ? ch.color : base.interface.crosshair.color,
        size: num(ch.size, base.interface.crosshair.size, 0, 16),
        gap: num(ch.gap, base.interface.crosshair.gap, 0, 16),
        thickness: num(ch.thickness, base.interface.crosshair.thickness, 1, 5),
        dot: bool(ch.dot, base.interface.crosshair.dot),
        dynamic: bool(ch.dynamic, base.interface.crosshair.dynamic),
        outline: bool(ch.outline, base.interface.crosshair.outline),
      },
      hudScale: num(ui.hudScale, base.interface.hudScale, 0.8, 1.3),
      minimap: bool(ui.minimap, base.interface.minimap),
      killFeed: bool(ui.killFeed, base.interface.killFeed),
      showFps: bool(ui.showFps, base.interface.showFps),
      moneyToasts: bool(ui.moneyToasts, base.interface.moneyToasts),
    },
    keys,
    nickname: typeof parsed.nickname === "string" ? parsed.nickname : "",
  };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

/** The bindings the input layer runs with: the player's overrides over the defaults, never an empty action. */
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
  if (code.startsWith("Arrow")) return { Up: "↑", Down: "↓", Left: "←", Right: "→" }[code.slice(5)] ?? code;
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
