import { PRESETS, type QualityPreset, type Settings } from "../settings";

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
      <label className="field">
        <span>Quality preset</span>
        <div className="segmented">
          {(["low", "medium", "high", "ultra"] as QualityPreset[]).map((p) => (
            <button key={p} type="button" className={gr.preset === p ? "active" : ""} onClick={() => set({ graphics: { ...PRESETS[p], renderer: gr.renderer } })}>{p.toUpperCase()}</button>
          ))}
        </div>
      </label>
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
      <Toggle label="Force WebGL2 (disable WebGPU)" value={gr.renderer === "webgl2"} onChange={(v) => set({ graphics: { ...gr, renderer: v ? "webgl2" : "auto" } })} />

      <h3>AUDIO</h3>
      <Slider label="Master" value={a.master} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, master: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Effects" value={a.effects} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, effects: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Music" value={a.music} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, music: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Interface" value={a.ui} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, ui: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      <p className="muted small">Graphics changes other than render scale and FOV apply on the next match.</p>

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
