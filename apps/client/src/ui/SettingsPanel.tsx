import { useEffect, useState } from "react";
import {
  BINDABLE_ACTIONS, QUALITY_MODES, RESERVED_CODES, applyQualityMode, applyQualityPreset, bindingConflicts,
  defaultSettings, isCustomGraphics, keyLabel, qualityMode, resolveBindings,
  type BindableAction, type QualityPreset, type Settings,
} from "../settings";

interface Props { settings: Settings; onChange: (s: Settings) => void }

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="field slider">
      <span>{label}<em>{format ? format(value) : value}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field toggle">
      <span>{label}</span>
      <button type="button" className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value}>{value ? "ON" : "OFF"}</button>
    </label>
  );
}

export function SettingsPanel({ settings, onChange }: Props) {
  const g = settings.gameplay, gr = settings.graphics, a = settings.audio;
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  return (
    <div className="settings">
      <h3>GAMEPLAY</h3>
      <Slider label="Mouse sensitivity" value={g.sensitivity} min={0.3} max={8} step={0.1} onChange={(v) => set({ gameplay: { ...g, sensitivity: v } })} format={(v) => v.toFixed(1)} />
      <Slider label="Field of view" value={g.fov} min={70} max={110} step={1} onChange={(v) => set({ gameplay: { ...g, fov: v } })} format={(v) => `${v}°`} />
      <Slider label="Head bob" value={g.headBob} min={0} max={1} step={0.1} onChange={(v) => set({ gameplay: { ...g, headBob: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Camera shake" value={g.cameraShake} min={0} max={1} step={0.1} onChange={(v) => set({ gameplay: { ...g, cameraShake: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label="Invert Y" value={g.invertY} onChange={(v) => set({ gameplay: { ...g, invertY: v } })} />

      <h3>GRAPHICS</h3>
      {/* The four the brief asks for. AUTOMATIC is not a fifth level: it hands `preset` to the
          auto-quality director, which measures real frames (see perf/autoQuality.ts). */}
      <label className="field">
        <span>Quality</span>
        <div className="segmented">
          {QUALITY_MODES.map((q) => (
            <button key={q.id} type="button" className={qualityMode(gr) === q.id ? "active" : ""} onClick={() => set({ graphics: applyQualityMode(gr, q.id) })}>{q.label}</button>
          ))}
        </div>
      </label>
      <p className="muted small">{gr.auto
        ? `Automatic — measuring your machine and holding ${gr.targetFps} fps. Now running ${gr.preset.toUpperCase()}.`
        : isCustomGraphics(gr) ? "CUSTOM · individual graphics settings below differ from this level"
        : QUALITY_MODES.find((q) => q.id === qualityMode(gr))?.blurb ?? "Brightness stays the same across levels."}</p>
      {!gr.auto && (
        <label className="field">
          <span>Fixed level</span>
          <div className="segmented">
            {(["low", "medium", "high", "ultra"] as QualityPreset[]).map((p) => (
              <button key={p} type="button" className={gr.preset === p ? "active" : ""} onClick={() => set({ graphics: applyQualityPreset(gr, p) })}>{p.toUpperCase()}</button>
            ))}
          </div>
        </label>
      )}
      <Slider label="Brightness" value={gr.brightness} min={.75} max={1.5} step={.05} onChange={v => set({ graphics: { ...gr, brightness: v } })} format={v => `${Math.round(v * 100)}%`} />
      <label className="field"><span>Dynamic resolution target</span><div className="segmented">{([60, 90, 120] as const).map(fps => <button key={fps} type="button" className={gr.targetFps === fps ? "active" : ""} onClick={() => set({ graphics: { ...gr, targetFps: fps } })}>{fps} FPS</button>)}</div></label>
      <Slider label="Render scale" value={gr.renderScale} min={0.5} max={1} step={0.05} onChange={(v) => set({ graphics: { ...gr, renderScale: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <label className="field">
        <span>Shadows</span>
        <div className="segmented">
          {(["off", "medium", "high"] as const).map((p) => (
            <button key={p} type="button" className={gr.shadows === p ? "active" : ""} onClick={() => set({ graphics: { ...gr, shadows: p } })}>{p.toUpperCase()}</button>
          ))}
        </div>
      </label>
      <Slider label="Effects density" value={gr.effects} min={0} max={1} step={0.1} onChange={(v) => set({ graphics: { ...gr, effects: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label="Dynamic resolution (keeps frame rate up)" value={gr.dynamicResolution} onChange={(v) => set({ graphics: { ...gr, dynamicResolution: v } })} />
      <Toggle label="Post-processing" value={gr.postProcessing} onChange={(v) => set({ graphics: { ...gr, postProcessing: v } })} />
      <Toggle label="Anti-aliasing" value={gr.antialiasing} onChange={(v) => set({ graphics: { ...gr, antialiasing: v } })} />
      <Toggle label="Extra scenery models (characters and weapons are built in-game)" value={gr.importedModels} onChange={(v) => set({ graphics: { ...gr, importedModels: v } })} />
      <Toggle label="Try WebGPU (experimental — WebGL2 is the default and always works)" value={gr.renderer === "auto"} onChange={(v) => set({ graphics: { ...gr, renderer: v ? "auto" : "webgl2" } })} />

      <Controls settings={settings} onChange={onChange} />

      <h3>AUDIO</h3>
      <Slider label="Master" value={a.master} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, master: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Effects" value={a.effects} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, effects: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Music" value={a.music} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, music: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Interface" value={a.ui} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, ui: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <p className="muted small">Brightness, shadows, effects and resolution apply immediately. Renderer and extra scenery apply on the next match.</p>

      <h3>CREDITS</h3>
      <Credits />
    </div>
  );
}

/**
 * Third-party asset attribution.
 *
 * This is not decoration: the firearm models are CC-BY 4.0, whose only condition is that credit
 * travels with the work. A line in a repository file does not travel with a deployed build, so it
 * lives here as well — visible from the menu and from the pause screen, wherever the game is put.
 * Keep it in step with `ASSET_LICENSES.md`.
 */
export function Credits() {
  return (
    <div className="credits" data-testid="credits">
      <p className="muted small">
        Firearm models: <strong>&ldquo;Low Poly Firearms Bundle&rdquo; by austincford</strong>, licensed under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener">CC BY 4.0</a>.
      </p>
      <p className="muted small">
        Characters: &ldquo;Ultimate Modular Men Pack&rdquo; by Quaternius (CC0). Bottles: &ldquo;Bottles&rdquo; by MiniPoly (CC0).
      </p>
      <p className="muted small">
        Everything else — map, textures, effects and all audio — is generated by the game at runtime.
        Fonts: Bebas Neue, Inter, JetBrains Mono (SIL OFL 1.1). Engine: Babylon.js (Apache-2.0), Colyseus (MIT).
      </p>
    </div>
  );
}

/**
 * Rebinding, conflict detection and restore-to-defaults — the three things the brief asks for.
 *
 * Capture runs on the WINDOW in the capture phase so the pressed key reaches this and nothing else
 * (not the game, not a button's default action). `RESERVED_CODES` refuses keys the input layer
 * relies on having a fixed job; Escape cancels, Backspace clears back to the default.
 */
function Controls({ settings, onChange }: Props) {
  const [capturing, setCapturing] = useState<BindableAction | null>(null);
  const bindings = resolveBindings(settings.keys);
  const conflicts = bindingConflicts(bindings);
  const [refused, setRefused] = useState("");

  const write = (action: BindableAction, codes: string[] | null) => {
    const keys = { ...settings.keys };
    if (codes) keys[action] = codes; else delete keys[action];
    onChange({ ...settings, keys });
  };

  // A capture-phase listener, only while capturing, torn down the moment a key lands: one that
  // outlived the capture would eat the next keystroke the player meant for something else.
  useEffect(() => {
    if (capturing === null) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      const action = capturing;
      setCapturing(null);
      if (e.code === "Escape") return;
      if (e.code === "Backspace" || e.code === "Delete") { write(action, null); return; }
      if (RESERVED_CODES.has(e.code)) { setRefused(`${keyLabel(e.code)} has a fixed job and cannot be rebound.`); return; }
      setRefused("");
      write(action, [e.code]);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <>
      <h3>CONTROLS</h3>
      <p className="muted small">Click a key to rebind it. ESC cancels, BACKSPACE restores that action's default.</p>
      {refused && <p className="muted small" data-testid="bind-refused">{refused}</p>}
      <table className="keys-table">
        <tbody>
          {BINDABLE_ACTIONS.map((a) => (
            <tr key={a.id} className={conflicts.has(a.id) ? "conflict" : ""}>
              <td>{a.label}</td>
              <td className="key">
                <button type="button" className={`keycap ${capturing === a.id ? "capturing" : ""}`} data-testid={`bind-${a.id}`}
                  onClick={() => { setRefused(""); setCapturing(a.id); }}>
                  {capturing === a.id ? "PRESS A KEY…" : bindings[a.id].map(keyLabel).join(" / ")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {conflicts.size > 0 && (
        <p className="muted small" data-testid="bind-conflicts">
          Two actions share a key: {[...conflicts].map((id) => BINDABLE_ACTIONS.find((a) => a.id === id)?.label).join(", ")}. Whichever runs first wins.
        </p>
      )}
      <button type="button" className="menu-btn" data-testid="bind-reset"
        onClick={() => onChange({ ...settings, keys: defaultSettings().keys })}>RESTORE DEFAULT KEYS</button>
    </>
  );
}
