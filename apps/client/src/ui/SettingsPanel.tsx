import { useEffect, useState } from "react";
import {
  BINDABLE_ACTIONS, CROSSHAIR_COLORS, DEFAULT_CROSSHAIR, PRESETS, RESERVED_CODES, bindingConflicts, defaultSettings, keyLabel, resolveBindings,
  type BindableAction, type CrosshairColor, type QualityPreset, type Settings,
} from "../settings";
import { uiSound } from "../game/audio";

interface Props { settings: Settings; onChange: (s: Settings) => void; /** Tab shown first. */ initialTab?: SettingsTab }

export type SettingsTab = "gameplay" | "graphics" | "audio" | "interface" | "controls" | "credits";
const TABS: { id: SettingsTab; label: string }[] = [
  { id: "gameplay", label: "GAMEPLAY" }, { id: "graphics", label: "GRAPHICS" }, { id: "audio", label: "AUDIO" },
  { id: "interface", label: "INTERFACE" }, { id: "controls", label: "CONTROLS" }, { id: "credits", label: "CREDITS" },
];

function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  return (
    <label className="field slider" title={hint}>
      <span>{label}<em>{format ? format(value) : value}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="field toggle" title={hint}>
      <span>{label}{hint && <small className="field-hint">{hint}</small>}</span>
      <button type="button" className={`switch ${value ? "on" : ""}`} onClick={() => { uiSound("click"); onChange(!value); }} aria-pressed={value}>{value ? "ON" : "OFF"}</button>
    </label>
  );
}

function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span>{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <button key={o.id} type="button" className={value === o.id ? "active" : ""} onClick={() => { uiSound("click"); onChange(o.id); }}>{o.label}</button>
        ))}
      </div>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Settings, in tabs (2.1). One component serves the main menu and the pause screen, so a change
 * made mid-match is the same change the menu would have made. Everything applies live except the
 * graphics options the engine only reads at start-up, which say so.
 */
export function SettingsPanel({ settings, onChange, initialTab = "gameplay" }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const g = settings.gameplay, gr = settings.graphics, a = settings.audio, ui = settings.interface;
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const setUi = (patch: Partial<Settings["interface"]>) => set({ interface: { ...ui, ...patch } });
  const setCh = (patch: Partial<Settings["interface"]["crosshair"]>) => setUi({ crosshair: { ...ui.crosshair, ...patch } });

  return (
    <div className="settings" data-testid="settings">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => { uiSound("click"); setTab(t.id); }} data-testid={`tab-${t.id}`}>{t.label}</button>
        ))}
      </div>

      {tab === "gameplay" && (
        <div className="tab-body">
          <Slider label="Mouse sensitivity" value={g.sensitivity} min={0.3} max={8} step={0.1} onChange={(v) => set({ gameplay: { ...g, sensitivity: v } })} format={(v) => v.toFixed(1)} />
          <Slider label="ADS sensitivity" value={g.adsSensitivity} min={0.3} max={2} step={0.05} onChange={(v) => set({ gameplay: { ...g, adsSensitivity: v } })} format={(v) => `×${v.toFixed(2)}`} hint="Multiplier while aiming down sights. Below 1 slows the aim for precision; 1 keeps the hip feel." />
          <Slider label="Field of view" value={g.fov} min={70} max={110} step={1} onChange={(v) => set({ gameplay: { ...g, fov: v } })} format={(v) => `${v}°`} />
          <Slider label="Head bob" value={g.headBob} min={0} max={1} step={0.1} onChange={(v) => set({ gameplay: { ...g, headBob: v } })} format={pct} />
          <Slider label="Camera shake" value={g.cameraShake} min={0} max={1} step={0.1} onChange={(v) => set({ gameplay: { ...g, cameraShake: v } })} format={pct} />
          <Toggle label="Invert Y" value={g.invertY} onChange={(v) => set({ gameplay: { ...g, invertY: v } })} />
        </div>
      )}

      {tab === "graphics" && (
        <div className="tab-body">
          <Choice label="Quality preset" value={gr.preset} options={(["low", "medium", "high", "ultra"] as QualityPreset[]).map((p) => ({ id: p, label: p.toUpperCase() }))}
            onChange={(p) => set({ graphics: { ...PRESETS[p], renderer: gr.renderer } })} hint="LOW for laptops and integrated graphics; MEDIUM is the default after a real playtest." />
          <Slider label="Render scale" value={gr.renderScale} min={0.5} max={1} step={0.05} onChange={(v) => set({ graphics: { ...gr, renderScale: v } })} format={pct} />
          <Choice label="Shadows" value={gr.shadows} options={[{ id: "off", label: "OFF" }, { id: "medium", label: "MEDIUM" }, { id: "high", label: "HIGH" }] as const} onChange={(v) => set({ graphics: { ...gr, shadows: v } })} />
          <Slider label="Effects density" value={gr.effects} min={0} max={1} step={0.1} onChange={(v) => set({ graphics: { ...gr, effects: v } })} format={pct} />
          <Toggle label="Dynamic resolution" hint="Lowers the render scale when frames get slow, so the game stays smooth." value={gr.dynamicResolution} onChange={(v) => set({ graphics: { ...gr, dynamicResolution: v } })} />
          <Toggle label="Post-processing" hint="Bloom, tone mapping and vignette." value={gr.postProcessing} onChange={(v) => set({ graphics: { ...gr, postProcessing: v } })} />
          <Toggle label="Anti-aliasing" value={gr.antialiasing} onChange={(v) => set({ graphics: { ...gr, antialiasing: v } })} />
          <Toggle label="Extra scenery models" hint="Characters and weapons are always built in-game; this adds the optional CC0 scenery packs. Off is lighter on weak GPUs." value={gr.importedModels} onChange={(v) => set({ graphics: { ...gr, importedModels: v } })} />
          <Toggle label="Force WebGL2 (disable WebGPU)" hint="Try this if the screen stays black or the renderer crashes." value={gr.renderer === "webgl2"} onChange={(v) => set({ graphics: { ...gr, renderer: v ? "webgl2" : "auto" } })} />
          <p className="muted small">Render scale and field of view apply at once; the rest applies on the next match.</p>
        </div>
      )}

      {tab === "audio" && (
        <div className="tab-body">
          <Slider label="Master" value={a.master} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, master: v } })} format={pct} />
          <Slider label="Effects" value={a.effects} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, effects: v } })} format={pct} />
          <Slider label="Music" value={a.music} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, music: v } })} format={pct} />
          <Slider label="Interface" value={a.ui} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, ui: v } })} format={pct} />
          <p className="muted small">All audio is synthesised by the game at runtime — there are no sound files to load.</p>
        </div>
      )}

      {tab === "interface" && (
        <div className="tab-body">
          <div className="crosshair-editor">
            <CrosshairPreview c={ui.crosshair} />
            <div className="crosshair-fields">
              <label className="field">
                <span>Crosshair colour</span>
                <div className="swatches">
                  {(Object.keys(CROSSHAIR_COLORS) as CrosshairColor[]).map((c) => (
                    <button key={c} type="button" className={`swatch ${ui.crosshair.color === c ? "on" : ""}`} style={{ background: CROSSHAIR_COLORS[c] }} title={c} aria-label={c} onClick={() => { uiSound("click"); setCh({ color: c }); }} />
                  ))}
                </div>
              </label>
              <Slider label="Arm length" value={ui.crosshair.size} min={0} max={16} step={1} onChange={(v) => setCh({ size: v })} format={(v) => (v === 0 ? "dot only" : `${v} px`)} />
              <Slider label="Gap" value={ui.crosshair.gap} min={0} max={16} step={1} onChange={(v) => setCh({ gap: v })} format={(v) => `${v} px`} />
              <Slider label="Thickness" value={ui.crosshair.thickness} min={1} max={5} step={1} onChange={(v) => setCh({ thickness: v })} format={(v) => `${v} px`} />
              <Toggle label="Centre dot" value={ui.crosshair.dot} onChange={(v) => setCh({ dot: v })} />
              <Toggle label="Dynamic (opens with spread)" value={ui.crosshair.dynamic} onChange={(v) => setCh({ dynamic: v })} />
              <Toggle label="Dark outline" value={ui.crosshair.outline} onChange={(v) => setCh({ outline: v })} />
              <button type="button" className="link" onClick={() => { uiSound("click"); setCh({ ...DEFAULT_CROSSHAIR }); }}>RESET CROSSHAIR</button>
            </div>
          </div>
          <Slider label="HUD scale" value={ui.hudScale} min={0.8} max={1.3} step={0.05} onChange={(v) => setUi({ hudScale: v })} format={pct} />
          <Toggle label="Minimap and compass" value={ui.minimap} onChange={(v) => setUi({ minimap: v })} />
          <Toggle label="Kill feed" value={ui.killFeed} onChange={(v) => setUi({ killFeed: v })} />
          <Toggle label="Money toasts" hint='The floating "+$300" after a kill.' value={ui.moneyToasts} onChange={(v) => setUi({ moneyToasts: v })} />
          <Toggle label="Show FPS and ping" value={ui.showFps} onChange={(v) => setUi({ showFps: v })} />
        </div>
      )}

      {tab === "controls" && <ControlsTab settings={settings} onChange={onChange} />}

      {tab === "credits" && (
        <div className="tab-body">
          <Credits />
          <button type="button" className="link" onClick={() => { if (window.confirm("Reset every setting to its default? Your nickname is kept.")) { uiSound("click"); onChange({ ...defaultSettings(), nickname: settings.nickname }); } }}>RESET ALL SETTINGS</button>
        </div>
      )}
    </div>
  );
}

/** The crosshair as the HUD draws it, at rest and (faded) fully bloomed, on a strip of the map's tones. */
function CrosshairPreview({ c }: { c: Settings["interface"]["crosshair"] }) {
  const style = {
    "--ch-len": `${c.size}px`, "--ch-thick": `${c.thickness}px`, "--ch-color": CROSSHAIR_COLORS[c.color],
    "--ch-outline": c.outline ? "0 0 2px rgba(0,0,0,.9)" : "none",
  } as React.CSSProperties;
  const one = (gap: number, cls: string) => (
    <div className={`crosshair ${cls}`} style={{ ...style, "--gap": `${gap}px` } as React.CSSProperties}>
      {c.size > 0 && <><span className="ch-top" /><span className="ch-bottom" /><span className="ch-left" /><span className="ch-right" /></>}
      {c.dot && <span className="ch-dot" />}
    </div>
  );
  return (
    <div className="crosshair-preview" data-testid="crosshair-preview">
      <div className="crosshair-stage">{one(c.gap, "")}<small>REST</small></div>
      <div className="crosshair-stage">{one(c.dynamic ? c.gap + 22 : c.gap, "bloom")}<small>{c.dynamic ? "FULL SPREAD" : "STATIC"}</small></div>
    </div>
  );
}

/**
 * Key rebinding (2.1). Click a key, press the new one. Escape cancels, Backspace clears the
 * secondary key. A key already used elsewhere is accepted and both rows are flagged — refusing it
 * would stop a player from SWAPPING two keys, which is the most common edit.
 */
function ControlsTab({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const bindings = resolveBindings(settings.keys);
  const conflicts = bindingConflicts(bindings);
  const [listening, setListening] = useState<{ action: BindableAction; slot: number } | null>(null);

  useEffect(() => {
    if (!listening) return;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") { setListening(null); return; }
      const cur = [...bindings[listening.action]];
      if (e.code === "Backspace" || e.code === "Delete") {
        // Clearing the primary key promotes the secondary; an action never ends up with no key.
        if (cur.length > 1) cur.splice(listening.slot, 1);
        else { setListening(null); return; }
      } else if (RESERVED_CODES.has(e.code)) {
        return; // fixed keys: the list sits under the table
      } else {
        cur[listening.slot] = e.code;
      }
      onChange({ ...settings, keys: { ...settings.keys, [listening.action]: cur } });
      uiSound("click");
      setListening(null);
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [listening, bindings, settings, onChange]);

  const reset = () => { if (window.confirm("Restore the default keys?")) { uiSound("click"); onChange({ ...settings, keys: {} }); } };

  return (
    <div className="tab-body controls" data-testid="controls">
      <table>
        <thead><tr><th>ACTION</th><th>PRIMARY</th><th>SECONDARY</th></tr></thead>
        <tbody>
          {BINDABLE_ACTIONS.map((a) => {
            const codes = bindings[a.id];
            const conflict = conflicts.has(a.id);
            return (
              <tr key={a.id} className={conflict ? "conflict" : ""} data-testid={`bind-${a.id}`}>
                <td>{a.label}</td>
                {[0, 1].map((slot) => {
                  const active = listening?.action === a.id && listening.slot === slot;
                  return (
                    <td key={slot}>
                      <button type="button" className={`keycap ${active ? "listening" : ""} ${codes[slot] ? "" : "empty"}`} onClick={() => { uiSound("click"); setListening(active ? null : { action: a.id, slot }); }} data-testid={`key-${a.id}-${slot}`}>
                        {active ? "PRESS A KEY" : codes[slot] ? keyLabel(codes[slot]) : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {conflicts.size > 0 && <div className="notice error" data-testid="bind-conflict">Two actions share a key. It still works, but only one of them will win.</div>}
      <table className="fixed-keys">
        <tbody>
          {([["LMB / RMB", "Fire / aim down sights"], ["1 · 2 · 3 · wheel", "Primary · sidearm · clippers"], ["Tab", "Scoreboard"], ["Enter / Y", "Chat to all / to the team"], ["MMB", "Mark a spot · spot an enemy"], ["Esc", "Release the mouse / pause"]] as const).map(([k, v]) => (
            <tr key={k}><td className="key">{k}</td><td>{v} <span className="muted">· fixed</span></td></tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button type="button" className="link" onClick={reset}>RESTORE DEFAULT KEYS</button>
        <span className="muted small">Click a key to change it · Backspace clears a secondary key · Esc cancels</span>
      </div>
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
        Everything else — map, textures, effects, weapon drawings and all audio — is made by the game itself.
        Fonts: Bebas Neue, Inter, JetBrains Mono (SIL OFL 1.1). Engine: Babylon.js (Apache-2.0), Colyseus (MIT).
      </p>
    </div>
  );
}
