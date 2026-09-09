import React, { useMemo, useState } from "react";
import { HAIRCUTS, WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { catalog, fitsWeapon, type SkinDef } from "@frankibarber/skins";
import { ensureStarterSkins, equipHaircut, equipSkin, ownedCuts } from "../game/progression/profile";
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

export function Armoury({ onHaircut }: { onHaircut?: (id: string) => void }) {
  const initial = useMemo(() => ensureStarterSkins(), []);
  const [weapon, setWeapon] = useState<WeaponId>("rifle");
  const [equip, setEquip] = useState(initial.equip);
  const [owned, setOwned] = useState(() => new Set(initial.skins.map(instance => instance.skin)));
  const [section, setSection] = useState<"skins" | "haircuts" | "crates">("skins");
  const [haircut, setHaircut] = useState(initial.haircut);
  const [preview, setPreview] = useState(initial.equip.rifle ?? catalog.find((skin) => fitsWeapon(skin, "rifle"))?.id ?? "");
  const skins = catalog.filter((skin) => fitsWeapon(skin, weapon) && owned.has(skin.id));
  const ownedHaircutIds = new Set(ownedCuts().map((item) => item.id));

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
  const chooseHaircut = (id: string) => {
    const equipped = equipHaircut(id);
    setHaircut(equipped);
    onHaircut?.(equipped);
    uiSound("click");
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
        <div className="armoury-tabs">
          <button className={section === "skins" ? "on" : ""} onClick={() => setSection("skins")} data-testid="armoury-skins">SKINY</button>
          <button className={section === "haircuts" ? "on" : ""} onClick={() => setSection("haircuts")} data-testid="armoury-haircuts">FRYZURY</button>
          <button className={section === "crates" ? "on" : ""} onClick={() => setSection("crates")} data-testid="armoury-crates">SKRZYNKI</button>
        </div>
        {section === "skins" && (
          <>
            <div className="armoury-heading"><span>03</span><div><b>SKINY</b><small>Posiadane · {skins.length}</small></div></div>
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
          </>
        )}
        {section === "haircuts" && (
          <>
            <div className="armoury-heading"><span>03</span><div><b>FRYZURY</b><small>Wybór dla następnego pokoju</small></div></div>
            <div className="armoury-cut-grid">
              {HAIRCUTS.map((item) => {
                const available = ownedHaircutIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    disabled={!available}
                    className={`${haircut === item.id ? "on" : ""} ${available ? "" : "locked"}`}
                    onClick={() => chooseHaircut(item.id)}
                    data-testid={`armoury-haircut-${item.id}`}
                  >
                    <i className={item.style.cap ? "cut-head cap" : "cut-head"} style={{
                      "--hair": item.style.tone === "bleach" ? "#e8d99f" : "#2a211b",
                      "--height": `${Math.max(8, item.style.crown * 300)}px`,
                      "--width": `${Math.max(10, item.style.width * 160)}px`,
                    } as React.CSSProperties} />
                    <b>{item.name}</b>
                    <small>{available ? haircut === item.id ? "ZAŁOŻONA" : "POSIADANA" : item.requirement}</small>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {section === "crates" && (
          <Crates onProfile={(nextProfile) => {
            setEquip(nextProfile.equip);
            setOwned(new Set(nextProfile.skins.map((instance) => instance.skin)));
          }} />
        )}
        {section !== "crates" && <p className="armoury-note">Wybór zapisuje się od razu i pojawi się w następnym meczu.</p>}
      </aside>
    </section>
  );
}
