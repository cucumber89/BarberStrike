import { useMemo, useState } from "react";
import { WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { catalog, fitsWeapon, type SkinDef } from "@frankibarber/skins";
import { ensureStarterSkins, equipSkin } from "../game/progression/profile";
import { uiSound } from "../game/audio";
import { SkinPreview } from "./SkinPreview";
import { Crates } from "./Crates";

const rarityLabel: Record<SkinDef["rarity"], string> = {
  pospolity: "POSPOLITY", rzadki: "RZADKI", epicki: "EPICKI", legendarny: "LEGENDARNY", zloty: "ZŁOTY",
};

function swatch(skin: SkinDef): string {
  const colors = String(skin.params.colors ?? skin.params.color ?? "#65717a").split(",");
  if (skin.generator === "stripes") return `repeating-linear-gradient(${skin.params.angle ?? 45}deg, ${colors.map((color, i) => `${color} ${i * 18}px ${(i + 1) * 18}px`).join(",")})`;
  return `linear-gradient(135deg, ${colors[0]}, #101419)`;
}

export function Armoury() {
  const initial = useMemo(() => ensureStarterSkins(), []);
  const [weapon, setWeapon] = useState<WeaponId>("rifle");
  const [equip, setEquip] = useState(initial.equip);
  const [owned, setOwned] = useState(() => new Set(initial.skins.map(instance => instance.skin)));
  const [preview, setPreview] = useState(initial.equip.rifle ?? catalog.find((skin) => fitsWeapon(skin, "rifle"))?.id ?? "");
  const skins = catalog.filter((skin) => fitsWeapon(skin, weapon) && owned.has(skin.id));

  const chooseWeapon = (id: WeaponId) => {
    setWeapon(id); setPreview(equip[id] ?? catalog.find((skin) => fitsWeapon(skin, id))?.id ?? "");
    uiSound("hover");
  };
  const chooseSkin = (id: string) => {
    const equipped = equipSkin(weapon, id);
    setEquip((current) => {
      const next = { ...current }; if (equipped) next[weapon] = equipped; else delete next[weapon]; return next;
    });
    setPreview(id); uiSound("click");
  };

  return (
    <section className="armoury" data-testid="armoury">
      <aside className="armoury-weapons">
        <div className="armoury-heading"><span>01</span><div><b>BROŃ</b><small>Wybierz model</small></div></div>
        <div className="armoury-weapon-list">
          {WEAPON_ORDER.map((id) => (
            <button key={id} type="button" className={id === weapon ? "on" : ""} onClick={() => chooseWeapon(id)} data-testid={`armoury-weapon-${id}`}>
              <span>{WEAPONS[id].name}</span><small>{equip[id] ? catalog.find((skin) => skin.id === equip[id])?.name : "Fabryczny"}</small>
            </button>
          ))}
        </div>
      </aside>

      <div className="armoury-stage">
        <div className="armoury-heading"><span>02</span><div><b>PODGLĄD</b><small>Przeciągnij, żeby obrócić</small></div></div>
        <div className="armoury-canvas"><SkinPreview weapon={weapon} skinId={preview} /></div>
        <div className="armoury-current">
          <div><small>{WEAPONS[weapon].name}</small><b>{preview ? catalog.find((skin) => skin.id === preview)?.name : "Fabryczny"}</b></div>
          <span>{equip[weapon] === preview ? "ZAŁOŻONY" : "PODGLĄD"}</span>
        </div>
      </div>

      <aside className="armoury-skins">
        <div className="armoury-heading"><span>03</span><div><b>SKINY</b><small>Kolekcja startowa · {skins.length}</small></div></div>
        <div className="armoury-skin-grid">
          <button type="button" className={!equip[weapon] ? "skin-card on" : "skin-card"} onClick={() => chooseSkin("")} data-testid="skin-factory">
            <i className="skin-swatch factory" /><b>Fabryczny</b><small>ORYGINALNY</small>
          </button>
          {skins.map((skin) => (
            <button type="button" key={skin.id} className={equip[weapon] === skin.id ? `skin-card ${skin.rarity} on` : `skin-card ${skin.rarity}`} onClick={() => chooseSkin(skin.id)} data-testid={`skin-${skin.id}`}>
              <i className="skin-swatch" style={{ background: swatch(skin) }} /><b>{skin.name}</b><small>{rarityLabel[skin.rarity]}</small>
            </button>
          ))}
        </div>
        <p className="armoury-note">Wybór zapisuje się od razu. Skin zobaczysz po wejściu do następnego meczu.</p>
        <Crates onProfile={(profile) => { setEquip(profile.equip); setOwned(new Set(profile.skins.map(instance => instance.skin))); }} />
      </aside>
    </section>
  );
}
