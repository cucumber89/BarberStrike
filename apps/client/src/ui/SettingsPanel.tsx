import { useEffect, useState } from "react";
import { modifierBindingWarning } from "../game/input/browserKeys";
import {
  BINDABLE_ACTIONS, CROSSHAIR_STYLES, QUALITY_MODES, RESERVED_CODES, applyQualityMode, applyQualityPreset, bindingConflicts,
  defaultSettings, isCustomGraphics, keyLabel, qualityMode, resolveBindings,
  type BindableAction, type QualityPreset, type Settings,
} from "../settings";

/** Six that stay legible against this map at night; the picker next to them takes anything. */
const CROSSHAIR_COLORS = ["#ffffff", "#00ff88", "#00e5ff", "#ffd23f", "#ff4d4d", "#ff44cc"] as const;

interface Props { settings: Settings; onChange: (s: Settings) => void }

/**
 * A setting is a NAME, its current value, and — where the name is not enough — one line saying
 * what it does to the game. The hint is the whole difference between "Skala renderu 80 %" and
 * knowing that it is the dial to turn when the game stutters.
 */
function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  return (
    <label className="field slider">
      <span>{label}<em>{format ? format(value) : value}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="field toggle">
      <span>{label}{hint && <small className="field-hint">{hint}</small>}</span>
      <button type="button" className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value}>{value ? "WŁ." : "WYŁ."}</button>
    </label>
  );
}

/** Quality levels, in the game's language — the ids stay English, the screen does not. */
const PRESET_PL: Record<string, string> = { low: "NISKI", medium: "ŚREDNI", high: "WYSOKI", ultra: "ULTRA" };

/** The five screens, plus the credits that have to be reachable wherever the game is deployed. */
type SettingsTab = "gra" | "sterowanie" | "obraz" | "dzwiek" | "celownik" | "o-grze";
const SETTINGS_TABS: readonly { id: SettingsTab; label: string; note: string }[] = [
  { id: "gra", label: "GRA", note: "czułość myszy, pole widzenia, kamera" },
  { id: "sterowanie", label: "STEROWANIE", note: "klawisze i ich konflikty" },
  { id: "obraz", label: "OBRAZ", note: "jakość, płynność, jasność" },
  { id: "dzwiek", label: "DŹWIĘK", note: "głośności" },
  { id: "celownik", label: "CELOWNIK", note: "kształt, kolor, wskaźniki na ekranie" },
  { id: "o-grze", label: "O GRZE", note: "licencje i twórcy" },
];

/**
 * A live crosshair on the settings panel's own background. Every number below changes something a
 * player can only judge by looking at it, and making them close the menu, shoot, and come back to
 * try 2 px wider is how a crosshair menu becomes a thing nobody touches.
 */
function CrosshairPreview({ c }: { c: Settings["hud"]["crosshair"] }) {
  const vars = { "--gap": `${c.gap}px`, "--len": `${c.size}px`, "--gap-n": c.gap, "--len-n": c.size, "--w": `${c.thickness}px`, "--ch-color": c.color } as React.CSSProperties;
  return (
    <div className="ch-preview" data-testid="crosshair-preview">
      <div className={`crosshair ch-${c.style} ${c.outline ? "outlined" : ""}`} style={vars}>
        {c.style !== "dot" && c.style !== "circle" && <><span className="ch-top" /><span className="ch-bottom" /><span className="ch-left" /><span className="ch-right" /></>}
        {c.style === "circle" && <span className="ch-circle" />}
        {(c.style === "dot" || c.style === "cross-dot") && <span className="ch-dot" />}
      </div>
    </div>
  );
}

/**
 * Settings, in tabs — CS2's shape, and for CS2's reason.
 *
 * It was one scroll: crosshair, gameplay, graphics, controls, audio, credits, about forty controls
 * deep, in English, in a panel 60 vh tall. Finding "czułość myszy" meant scrolling past every
 * shadow option in the game. Six tabs put every screen within one click, each short enough to see
 * whole, and the labels are now in the language the rest of the game speaks.
 *
 * Nothing was dropped in the move: every control that existed is still here, under the tab it
 * belongs to.
 */
export function SettingsPanel({ settings, onChange }: Props) {
  const g = settings.gameplay, gr = settings.graphics, a = settings.audio;
  const hud = settings.hud, c = hud.crosshair;
  const [tab, setTab] = useState<SettingsTab>("gra");
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const setCh = (patch: Partial<Settings["hud"]["crosshair"]>) => set({ hud: { ...hud, crosshair: { ...c, ...patch } } });
  return (
    <div className="settings" data-testid="settings">
      <nav className="set-tabs" role="tablist" aria-label="Ustawienia">
        {SETTINGS_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} title={t.note}
            className={`set-tab ${tab === t.id ? "on" : ""}`} data-testid={`set-tab-${t.id}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <p className="set-note" data-testid="set-note">{SETTINGS_TABS.find((t) => t.id === tab)?.note}</p>

      <div className="set-body" role="tabpanel" data-testid={`set-panel-${tab}`}>
      {tab === "gra" && <>
        <Slider label="Czułość myszy" value={g.sensitivity} min={0.3} max={8} step={0.1} onChange={(v) => set({ gameplay: { ...g, sensitivity: v } })} format={(v) => v.toFixed(1)}
          hint="Jak daleko obraca się postać na ten sam ruch myszy. Niżej = celniej, wyżej = szybszy obrót." />
        <Slider label="Pole widzenia" value={g.fov} min={70} max={110} step={1} onChange={(v) => set({ gameplay: { ...g, fov: v } })} format={(v) => `${v}°`}
          hint="Ile widzisz po bokach. Więcej = szersza scena, ale cele są mniejsze." />
        <Slider label="Kołysanie kamery przy chodzeniu" value={g.headBob} min={0} max={1} step={0.1} onChange={(v) => set({ gameplay: { ...g, headBob: v } })} format={(v) => `${Math.round(v * 100)}%`}
          hint="Ustaw 0 %, jeśli ruch obrazu męczy oczy." />
        <Slider label="Wstrząsy kamery" value={g.cameraShake} min={0} max={1} step={0.1} onChange={(v) => set({ gameplay: { ...g, cameraShake: v } })} format={(v) => `${Math.round(v * 100)}%`}
          hint="Drgania po wybuchach i przy strzale." />
        <Toggle label="Odwróć oś Y" value={g.invertY} onChange={(v) => set({ gameplay: { ...g, invertY: v } })}
          hint="Mysz w górę patrzy w dół." />
      </>}

      {tab === "sterowanie" && <Controls settings={settings} onChange={onChange} />}

      {tab === "obraz" && <>
        {/* The four the brief asks for. AUTOMATYCZNIE is not a fifth level: it hands `preset` to
            the auto-quality director, which measures real frames (see perf/autoQuality.ts). */}
        <label className="field">
          <span>Jakość</span>
          <div className="segmented">
            {QUALITY_MODES.map((q) => (
              <button key={q.id} type="button" className={qualityMode(gr) === q.id ? "active" : ""} onClick={() => set({ graphics: applyQualityMode(gr, q.id) })}>{q.label}</button>
            ))}
          </div>
        </label>
        <p className="muted small">{gr.auto
          ? `Automatycznie — gra mierzy twój komputer i trzyma ${gr.targetFps} kl./s. Teraz działa poziom ${PRESET_PL[gr.preset] ?? gr.preset.toUpperCase()}.`
          : isCustomGraphics(gr) ? "WŁASNE · pojedyncze ustawienia poniżej różnią się od tego poziomu"
          : QUALITY_MODES.find((q) => q.id === qualityMode(gr))?.blurb ?? "Jasność jest taka sama na każdym poziomie."}</p>
        {!gr.auto && (
          <label className="field">
            <span>Stały poziom</span>
            <div className="segmented">
              {(["low", "medium", "high", "ultra"] as QualityPreset[]).map((p) => (
                <button key={p} type="button" className={gr.preset === p ? "active" : ""} onClick={() => set({ graphics: applyQualityPreset(gr, p) })}>{PRESET_PL[p] ?? p.toUpperCase()}</button>
              ))}
            </div>
          </label>
        )}
        <Slider label="Jasność" value={gr.brightness} min={.75} max={1.5} step={.05} onChange={v => set({ graphics: { ...gr, brightness: v } })} format={v => `${Math.round(v * 100)}%`}
          hint="Mapa jest nocna — podnieś, jeśli nie widzisz nic w zaułkach." />
        <label className="field"><span>Docelowa płynność</span><div className="segmented">{([60, 90, 120] as const).map(fps => <button key={fps} type="button" className={gr.targetFps === fps ? "active" : ""} onClick={() => set({ graphics: { ...gr, targetFps: fps } })}>{fps} KL./S</button>)}</div></label>
        <Slider label="Ostrość obrazu (obniż, gdy gra się tnie)" value={gr.renderScale} min={0.5} max={1} step={0.05} onChange={(v) => set({ graphics: { ...gr, renderScale: v } })} format={(v) => `${Math.round(v * 100)}%`}
          hint="Gra rysuje mniejszy obraz i rozciąga go na ekran — mniej ostro, za to płynniej." />
        <label className="field">
          <span>Cienie</span>
          <div className="segmented">
            {([["off", "BRAK"], ["medium", "ŚREDNIE"], ["high", "OSTRE"]] as const).map(([p, label]) => (
              <button key={p} type="button" className={gr.shadows === p ? "active" : ""} onClick={() => set({ graphics: { ...gr, shadows: p } })}>{label}</button>
            ))}
          </div>
        </label>
        <Slider label="Gęstość efektów" value={gr.effects} min={0} max={1} step={0.1} onChange={(v) => set({ graphics: { ...gr, effects: v } })} format={(v) => `${Math.round(v * 100)}%`}
          hint="Iskry, dym, łuski." />
        <Toggle label="Dynamiczna rozdzielczość" value={gr.dynamicResolution} onChange={(v) => set({ graphics: { ...gr, dynamicResolution: v } })}
          hint="Gra sama obniża rozdzielczość, żeby utrzymać płynność." />
        <Toggle label="Efekty końcowe" value={gr.postProcessing} onChange={(v) => set({ graphics: { ...gr, postProcessing: v } })} />
        <Toggle label="Wygładzanie krawędzi" value={gr.antialiasing} onChange={(v) => set({ graphics: { ...gr, antialiasing: v } })} />
        <Toggle label="Dodatkowe modele scenerii" value={gr.importedModels} onChange={(v) => set({ graphics: { ...gr, importedModels: v } })}
          hint="Postacie i broń i tak powstają w grze — to tylko dekoracje mapy." />
        <Toggle label="Spróbuj WebGPU (eksperymentalnie)" value={gr.renderer === "auto"} onChange={(v) => set({ graphics: { ...gr, renderer: v ? "auto" : "webgl2" } })}
          hint="WebGL2 jest domyślny i działa zawsze." />
        <p className="muted small">Jasność, cienie, efekty i rozdzielczość działają od razu. Silnik i dodatkowe modele — od następnego meczu.</p>
      </>}

      {tab === "dzwiek" && <>
        <Slider label="Głośność główna" value={a.master} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, master: v } })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Efekty" value={a.effects} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, effects: v } })} format={(v) => `${Math.round(v * 100)}%`}
          hint="Strzały, kroki, wybuchy — po nich poznajesz, gdzie jest przeciwnik." />
        <Slider label="Muzyka" value={a.music} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, music: v } })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Interfejs" value={a.ui} min={0} max={1} step={0.05} onChange={(v) => set({ audio: { ...a, ui: v } })} format={(v) => `${Math.round(v * 100)}%`}
          hint="Kliknięcia w menu i w sklepie." />
      </>}

      {tab === "celownik" && <>
        <CrosshairPreview c={c} />
        <label className="field"><span>Kształt</span>
          <div className="segmented">{CROSSHAIR_STYLES.map((s) => (
            <button key={s.id} type="button" className={c.style === s.id ? "active" : ""} onClick={() => setCh({ style: s.id })}>{s.label}</button>
          ))}</div>
        </label>
        <Slider label="Długość" value={c.size} min={2} max={24} step={1} onChange={(v) => setCh({ size: v })} format={(v) => `${v} px`} />
        <Slider label="Grubość" value={c.thickness} min={1} max={6} step={1} onChange={(v) => setCh({ thickness: v })} format={(v) => `${v} px`} />
        <Slider label="Odstęp od środka" value={c.gap} min={0} max={20} step={1} onChange={(v) => setCh({ gap: v })} format={(v) => `${v} px`} />
        <label className="field"><span>Kolor</span>
          <div className="ch-colors">
            {CROSSHAIR_COLORS.map((hex) => (
              <button key={hex} type="button" className={`ch-swatch ${c.color.toLowerCase() === hex ? "active" : ""}`}
                style={{ background: hex }} aria-label={hex} onClick={() => setCh({ color: hex })} />
            ))}
            <input type="color" value={c.color} onChange={(e) => setCh({ color: e.target.value })} aria-label="Własny kolor celownika" />
          </div>
        </label>
        <Toggle label="Celownik rozchyla się, gdy broń strzela niecelnie" value={c.dynamic} onChange={(v) => setCh({ dynamic: v })}
          hint="Wąski = strzał pewny. Szeroki = poczekaj chwilę albo kucnij." />
        <Toggle label="Ciemny obrys" value={c.outline} onChange={(v) => setCh({ outline: v })}
          hint="Żeby celownik było widać na jasnej ścianie." />
        <Toggle label="Pokazuj klatki i ping" value={hud.fps} onChange={(v) => set({ hud: { ...hud, fps: v } })} />
      </>}

      {tab === "o-grze" && <Credits />}
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
/** Actions a player HOLDS while moving — the ones a modifier bind turns into a browser chord. */
const HELD_ACTIONS = new Set<BindableAction>(["crouch", "sprint", "forward", "back", "left", "right", "leanLeft", "leanRight"]);

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
      if (RESERVED_CODES.has(e.code)) { setRefused(`${keyLabel(e.code)} ma stałe zadanie i nie da się go przypisać.`); return; }
      // Allowed, but not silently: a Ctrl bind on a held action is how players lose the tab.
      setRefused(HELD_ACTIONS.has(action) ? modifierBindingWarning(e.code) ?? "" : "");
      write(action, [e.code]);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <>
      <p className="muted small">Kliknij klawisz, żeby go zmienić. ESC anuluje, BACKSPACE przywraca domyślny.</p>
      {refused && <p className="muted small" data-testid="bind-refused">{refused}</p>}
      {(() => {
        const risky = BINDABLE_ACTIONS.filter((a) => HELD_ACTIONS.has(a.id) && bindings[a.id].some((c) => modifierBindingWarning(c)));
        if (!risky.length) return null;
        const first = bindings[risky[0].id].map(modifierBindingWarning).find(Boolean);
        return <p className="muted small warn" data-testid="bind-risky">{risky.map((a) => a.label).join(", ")}: {first}</p>;
      })()}
      <table className="keys-table">
        <tbody>
          {BINDABLE_ACTIONS.map((a) => (
            <tr key={a.id} className={conflicts.has(a.id) ? "conflict" : ""}>
              <td>{a.label}</td>
              <td className="key">
                <button type="button" className={`keycap ${capturing === a.id ? "capturing" : ""}`} data-testid={`bind-${a.id}`}
                  onClick={() => { setRefused(""); setCapturing(a.id); }}>
                  {capturing === a.id ? "NACIŚNIJ KLAWISZ…" : bindings[a.id].map(keyLabel).join(" / ")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {conflicts.size > 0 && (
        <p className="muted small" data-testid="bind-conflicts">
          Dwie akcje mają ten sam klawisz: {[...conflicts].map((id) => BINDABLE_ACTIONS.find((a) => a.id === id)?.label).join(", ")}. Zadziała ta, która jest pierwsza.
        </p>
      )}
      <button type="button" className="menu-btn" data-testid="bind-reset"
        onClick={() => onChange({ ...settings, keys: defaultSettings().keys })}>PRZYWRÓĆ DOMYŚLNE KLAWISZE</button>
    </>
  );
}
