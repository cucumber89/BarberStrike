// Development-only evidence entry point, deliberately outside the game's production entry graph.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { catalog } from "@frankibarber/skins";
import { SkinPreview } from "../../src/ui/SkinPreview";
import { Engine } from "@babylonjs/core/Engines/engine";
import { SkinRegistry } from "../../src/game/view/skins";
export function diagnostics() {
  return { engines: Engine.Instances.length, scenes: Engine.Instances.flatMap(e => e.scenes).map(s => ({
    meshes: s.meshes.length, textures: s.textures.length, cache: SkinRegistry.forScene(s).stats,
    painted: s.meshes.filter(m => m.material?.name.startsWith("skin_")).length,
  })) };
}

function Review() {
  const [weapon, setWeapon] = useState<WeaponId>("rifle"); const [selected, select] = useState(catalog[3].id);
  const [mounted, mount] = useState(true);
  return <main data-testid="skin-review">
    <header><span>BARBERSTRIKE / DROP C</span><h1>Wykończenia z zakładu.</h1><p>Sześć kierunków do oceny · przeciągnij broń, żeby obejrzeć detale</p></header>
    <nav>{WEAPON_ORDER.map(id => <button data-testid={`weapon-${id}`} aria-pressed={id === weapon} key={id} onClick={() => setWeapon(id)}>{WEAPONS[id].name}</button>)}</nav>
    <div className="stage">{mounted && <SkinPreview weapon={weapon} skinId={selected} rotate={false} />}</div>
    <section>{catalog.map(s => <button data-testid={`skin-${s.id}`} aria-pressed={s.id === selected} key={s.id} onClick={() => select(s.id)}><b>{s.name}</b><small>{s.blurb}</small></button>)}</section>
    <footer><button data-testid="toggle-preview" onClick={() => mount(!mounted)}>{mounted ? "Zamknij podgląd" : "Otwórz podgląd"}</button><span>Fabryczne szkło, stal celowników i mosiądz pozostają bez zmian.</span></footer>
  </main>;
}
const style = document.createElement("style");
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#0d1318;color:#f0e7d9;font:15px system-ui}main{max-width:1400px;margin:auto;padding:28px}header span{letter-spacing:4px;color:#cfa666;font-size:12px}h1{font-size:42px;margin:12px 0 4px}p{color:#98a7b3}nav,section{display:flex;gap:8px;flex-wrap:wrap}button{background:#18222b;color:#d4dce2;border:1px solid #35424d;padding:12px 16px;cursor:pointer;text-align:left;font:inherit}button[aria-pressed=true]{border-color:#cfa666;background:#302c26;color:#f5d6a2}.stage{height:450px;margin:18px 0;border:1px solid #35424d}section{display:grid;grid-template-columns:repeat(3,1fr)}section button{min-height:85px}b,small{display:block}small{color:#9fadb8;font-size:12px;margin-top:8px}footer{display:flex;align-items:center;gap:20px;margin-top:20px;color:#91a0ad;font-size:12px}`;
document.head.appendChild(style); createRoot(document.getElementById("review")!).render(<Review />);
