// Development-only evidence entry point, deliberately outside the game's production entry graph.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { catalog, COLLECTIONS, fitsWeapon } from "@frankibarber/skins";
import { SkinPreview, type PreviewView } from "../../src/ui/SkinPreview";
import { SkinArt } from "../../src/ui/SkinArt";
import { Engine } from "@babylonjs/core/Engines/engine";
import { SkinRegistry } from "../../src/game/view/skins";
export function diagnostics() {
  return { engines: Engine.Instances.length, scenes: Engine.Instances.flatMap(e => e.scenes).map(s => ({
    meshes: s.meshes.length, textures: s.textures.length, materials: s.materials.length, cache: SkinRegistry.forScene(s).stats,
    painted: s.meshes.filter(m => m.material?.name.startsWith("skin_")).length,
  })) };
}
(globalThis as unknown as { __skinDiagnostics: typeof diagnostics }).__skinDiagnostics = diagnostics;

const VIEWS: PreviewView[] = ["side", "left", "close", "close-left", "front", "back", "top"];
const VIEW_LABEL: Record<PreviewView, string> = { side: "Prawa", left: "Lewa", close: "Zbliżenie", "close-left": "Zbliżenie L", front: "Przód", back: "Tył", top: "Góra" };

function Review() {
  const [weapon, setWeapon] = useState<WeaponId>("rifle"); const [selected, select] = useState(catalog[3].id);
  const [mounted, mount] = useState(true); const [view, setView] = useState<PreviewView>("side"); const [wear, setWear] = useState(0);
  const skin = catalog.find(s => s.id === selected) ?? catalog[0];
  return <main data-testid="skin-review">
    <header><span>BARBERSTRIKE / SKINY</span><h1>Wykończenia z zakładu.</h1><p>{catalog.length} skinów w {COLLECTIONS.length} kolekcjach · przeciągnij broń, żeby obejrzeć detale</p></header>
    <nav>{WEAPON_ORDER.map(id => <button data-testid={`weapon-${id}`} aria-pressed={id === weapon} key={id} onClick={() => setWeapon(id)}>{WEAPONS[id].name}</button>)}</nav>
    <div className="stage">{mounted && <SkinPreview weapon={weapon} skinId={selected} rotate={false} view={view} wear={wear} />}</div>
    <div className="views">
      {VIEWS.map(v => <button key={v} data-testid={`view-${v}`} aria-pressed={v === view} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>)}
      <label>Zużycie <input type="range" min={0} max={1} step={.05} value={wear} onChange={e => setWear(Number(e.target.value))} /> {wear.toFixed(2)}</label>
      <span>{skin.name} · {skin.rarity}{fitsWeapon(skin, weapon) ? "" : " · nie pasuje do tej broni"}</span>
    </div>
    <div className="texture"><small>Tekstura (prawa i lewa strona)</small><SkinArt skin={skin} weapon={weapon} width={1100} both className="tex" alt="tekstura" /><i data-testid="skin-texture" /></div>
    {COLLECTIONS.map(c => <section key={c.id}>
      <h2>{c.name} <small>{c.blurb}</small></h2>
      <div className="grid">{catalog.filter(s => s.collection === c.id).map(s => (
        <button data-testid={`skin-${s.id}`} aria-pressed={s.id === selected} key={s.id} onClick={() => select(s.id)} disabled={!fitsWeapon(s, weapon)} className={s.rarity}>
          <SkinArt skin={s} weapon={weapon} width={260} focus="receiver" /><b>{s.name}</b><small>{s.rarity} · {s.blurb}</small>
        </button>))}</div>
    </section>)}
    <footer><button data-testid="toggle-preview" onClick={() => mount(!mounted)}>{mounted ? "Zamknij podgląd" : "Otwórz podgląd"}</button><span>Fabryczne szkło, stal celowników i mosiądz pozostają bez zmian.</span></footer>
  </main>;
}
const style = document.createElement("style");
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#0d1318;color:#f0e7d9;font:15px system-ui}main{max-width:1400px;margin:auto;padding:28px}header span{letter-spacing:4px;color:#cfa666;font-size:12px}h1{font-size:42px;margin:12px 0 4px}h2{font-size:22px;margin:26px 0 10px;color:#f5d6a2}h2 small{font-size:12px;color:#98a7b3;margin-left:10px}p{color:#98a7b3}nav,.views,.grid{display:flex;gap:8px;flex-wrap:wrap}button{background:#18222b;color:#d4dce2;border:1px solid #35424d;padding:12px 16px;cursor:pointer;text-align:left;font:inherit}button[aria-pressed=true]{border-color:#cfa666;background:#302c26;color:#f5d6a2}button:disabled{opacity:.35;cursor:not-allowed}.stage{height:450px;margin:18px 0 8px;border:1px solid #35424d}.views{align-items:center;color:#98a7b3;font-size:12px}.views label{display:flex;align-items:center;gap:6px}.texture{position:relative;margin:14px 0;padding:8px;background:#06090c;border:1px solid #35424d}.texture small{display:block;color:#98a7b3;font-size:11px;margin-bottom:6px}.texture .tex{display:block;width:100%;height:auto;image-rendering:auto}.texture i{position:absolute;inset:0;pointer-events:none}.grid{display:grid;grid-template-columns:repeat(4,1fr)}.grid button{display:grid;gap:6px;padding:8px}.grid canvas{width:100%;height:auto;display:block;background:#000}b,small{display:block}small{color:#9fadb8;font-size:11px}.grid .rzadki{border-bottom:3px solid #5979ff}.grid .epicki{border-bottom:3px solid #a34fff}.grid .legendarny{border-bottom:3px solid #ef4d93}.grid .zloty{border-bottom:3px solid #ffc52f}footer{display:flex;align-items:center;gap:20px;margin-top:20px;color:#91a0ad;font-size:12px}`;
document.head.appendChild(style); createRoot(document.getElementById("review")!).render(<Review />);
