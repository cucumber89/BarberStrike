import React, { useMemo, useState } from "react";
import { BUILDS, DROPPABLE_OUTFITS, buildDef, outfitDef, HAIRCUTS, WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { catalog, fitsWeapon, type SkinDef } from "@frankibarber/skins";
import { ensureStarterSkins, equipBuild, equipHaircut, equipOutfit, equipSkin, ownedCuts } from "../game/progression/profile";
import { uiSound } from "../game/audio";
import { SkinPreview } from "./SkinPreview";
import { CharacterPreview } from "./CharacterPreview";
import { Crates } from "./Crates";

const rarityLabel: Record<SkinDef["rarity"], string> = {
  pospolity: "POSPOLITY", rzadki: "RZADKI", epicki: "EPICKI", legendarny: "LEGENDARNY", zloty: "ZŁOTY",
};

function swatch(skin: SkinDef): string {
  const colors = String(skin.params.colors ?? skin.params.color ?? "#65717a").split(",");
  if (skin.generator === "stripes") return `repeating-linear-gradient(${skin.params.angle ?? 45}deg, ${colors.map((color, i) => `${color} ${i * 18}px ${(i + 1) * 18}px`).join(",")})`;
  return `linear-gradient(135deg, ${colors[0]}, #101419)`;
}

export function Armoury({ onHaircut, onBuild, onOutfit }: { onHaircut?: (id: string) => void; onBuild?: (id: string) => void; onOutfit?: (id: string) => void }) {
  const initial = useMemo(() => ensureStarterSkins(), []);
  const [weapon, setWeapon] = useState<WeaponId>("rifle");
  const [equip, setEquip] = useState(initial.equip);
  const [owned, setOwned] = useState(() => new Set(initial.skins.map(instance => instance.skin)));
  const [section, setSection] = useState<"skins" | "haircuts" | "body" | "outfits" | "crates">("skins");
  const [haircut, setHaircut] = useState(initial.haircut);
  const [build, setBuild] = useState(initial.build);
  const [outfit, setOutfit] = useState(initial.outfit);
  const [fits, setFits] = useState(() => new Set(initial.fits));
  const [preview, setPreview] = useState(initial.equip.rifle ?? catalog.find((skin) => fitsWeapon(skin, "rifle"))?.id ?? "");
  const skins = catalog.filter((skin) => fitsWeapon(skin, weapon) && owned.has(skin.id));
  const ownedHaircutIds = new Set(ownedCuts().map((item) => item.id));

  // POSTAĆ and STRÓJ are two pickers onto ONE body, so they share the stage and the preview.
  const onBody = section === "body" || section === "outfits";

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
  const chooseBuild = (id: string) => {
    const equipped = equipBuild(id);
    setBuild(equipped);
    onBuild?.(equipped);
    uiSound("click");
  };
  const chooseOutfit = (id: string) => {
    const equipped = equipOutfit(id);
    setOutfit(equipped); onOutfit?.(equipped);
    uiSound("click");
  };
  const chooseHaircut = (id: string) => {
    const equipped = equipHaircut(id);
    setHaircut(equipped);
    onHaircut?.(equipped);
    uiSound("click");
  };

  return (
    <section className={onBody ? "armoury on-body" : "armoury"} data-testid="armoury">
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
        {/* One stage, two subjects. The body preview owns its own engine, so it is mounted only
            while the POSTAĆ tab is open and released the moment it is not — two live WebGL
            contexts in one panel is a context a browser may take back without warning. */}
        <div className="armoury-canvas">
          {onBody
            ? <CharacterPreview build={build} haircut={haircut} outfit={outfit} />
            : <SkinPreview weapon={weapon} skinId={preview} />}
        </div>
        <div className="armoury-current">
          {onBody
            ? <div><small>{buildDef(build).name}</small><b>{outfitDef(outfit).name}</b></div>
            : <div><small>{WEAPONS[weapon].name}</small><b>{preview ? catalog.find((skin) => skin.id === preview)?.name : "Fabryczny"}</b></div>}
          <span>{onBody ? "ZAŁOŻONE" : equip[weapon] === preview ? "ZAŁOŻONY" : "PODGLĄD"}</span>
        </div>
      </div>

      <aside className="armoury-skins">
        <div className="armoury-tabs">
          <button className={section === "skins" ? "on" : ""} onClick={() => setSection("skins")} data-testid="armoury-skins">SKINY</button>
          <button className={section === "haircuts" ? "on" : ""} onClick={() => setSection("haircuts")} data-testid="armoury-haircuts">FRYZURY</button>
          <button className={section === "body" ? "on" : ""} onClick={() => setSection("body")} data-testid="armoury-body">SYLWETKA</button>
          <button className={section === "outfits" ? "on" : ""} onClick={() => setSection("outfits")} data-testid="armoury-outfits">STRÓJ</button>
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
        {section === "body" && (
          <>
            <div className="armoury-heading"><span>03</span><div><b>SYLWETKA</b><small>Każda ma ten sam hitbox</small></div></div>
            <div className="armoury-build-list">
              {BUILDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={build === item.id ? "on" : ""}
                  onClick={() => chooseBuild(item.id)}
                  data-testid={`armoury-build-${item.id}`}
                >
                  <b>{item.name}</b>
                  <small>{item.blurb}</small>
                  <span>{build === item.id ? "ZAŁOŻONA" : "ZAŁÓŻ"}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {section === "outfits" && (
          <>
            <div className="armoury-heading"><span>03</span><div><b>STRÓJ</b><small>Posiadane · {fits.size + 1}/{DROPPABLE_OUTFITS.length + 1}</small></div></div>
            <div className="armoury-build-list">
              {[outfitDef(""), ...DROPPABLE_OUTFITS].map((item) => {
                const owned = item.id === outfitDef("").id || fits.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!owned}
                    className={`${outfit === item.id ? "on" : ""} ${owned ? "" : "locked"} fit-${item.rarity}`}
                    onClick={() => chooseOutfit(item.id)}
                    data-testid={`armoury-outfit-${item.id}`}
                  >
                    <b>{item.name}</b>
                    <small>{item.blurb}</small>
                    <span>{owned ? outfit === item.id ? "ZAŁOŻONY" : "ZAŁÓŻ" : "ZE SKRZYNKI"}</span>
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
            setFits(new Set(nextProfile.fits));
          }} />
        )}
        {onBody && <p className="armoury-note">Sylwetka i strój nie ruszają hitboxa, wzrostu ani strefy głowy — zmienia się wygląd, nie trafienia. Barwy drużyny zostają na piersi i na opasce, cokolwiek nosisz.</p>}
        {!onBody && section !== "crates" && <p className="armoury-note">Wybór zapisuje się od razu i pojawi się w następnym meczu.</p>}
      </aside>
    </section>
  );
}
