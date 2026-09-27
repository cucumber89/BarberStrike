import React, { useMemo, useState } from "react";
import { BUILDS, DROPPABLE_OUTFITS, EMOTES, buildDef, emoteDef, outfitDef, HAIRCUTS, WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { catalog, COLLECTIONS, collectionName, fitsWeapon, type SkinDef } from "@frankibarber/skins";
import { ensureStarterSkins, equipBuild, equipEmote, equipHaircut, equipOutfit, equipSkin, ownedCuts } from "../game/progression/profile";
import { keyLabel } from "../settings";
import { uiSound } from "../game/audio";
import { SkinPreview } from "./SkinPreview";
import { SkinArt } from "./SkinArt";
import { CharacterPreview } from "./CharacterPreview";
import { Crates } from "./Crates";
import { HaircutArt } from "./HaircutArt";

const rarityLabel: Record<SkinDef["rarity"], string> = {
  pospolity: "POSPOLITY", rzadki: "RZADKI", epicki: "EPICKI", legendarny: "LEGENDARNY", zloty: "ZŁOTY",
};

/** A short Polish date for the trophy shelf (P7); an unreadable timestamp shows a dash rather than NaN. */
const fmtTrophyDate = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  try {
    return new Date(ms).toLocaleDateString("pl-PL", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
};

export function Armoury({ onHaircut, onBuild, onOutfit, emoteKey = "KeyH" }: { onHaircut?: (id: string) => void; onBuild?: (id: string) => void; onOutfit?: (id: string) => void; emoteKey?: string }) {
  const initial = useMemo(() => ensureStarterSkins(), []);
  const [weapon, setWeapon] = useState<WeaponId>("rifle");
  const [equip, setEquip] = useState(initial.equip);
  const [owned, setOwned] = useState(() => new Set(initial.skins.map(instance => instance.skin)));
  const [section, setSection] = useState<"skins" | "haircuts" | "body" | "outfits" | "emotes" | "crates" | "trophies">("skins");
  // The dances (H): owned ones, the one on the key, and the one playing on the body right now —
  // a locked dance can be watched, it just cannot go on the key.
  const [emotes, setEmotes] = useState(() => new Set(initial.emotes));
  const [emote, setEmote] = useState(initial.emote);
  const [emotePreview, setEmotePreview] = useState(initial.emote);
  // Drop V (P7): the tournament shelf from the profile (D7). Read once on mount — it only grows at the
  // end of a tournament, which cannot happen while the Armoury is open.
  const tournaments = useMemo(() => [...initial.tournaments].sort((a, b) => b.endedAt - a.endedAt), [initial.tournaments]);
  const [haircut, setHaircut] = useState(initial.haircut);
  const [hairPreview, setHairPreview] = useState(initial.haircut);
  const [build, setBuild] = useState(initial.build);
  const [outfit, setOutfit] = useState(initial.outfit);
  const [fits, setFits] = useState(() => new Set(initial.fits));
  const [preview, setPreview] = useState(initial.equip.rifle ?? catalog.find((skin) => fitsWeapon(skin, "rifle"))?.id ?? "");
  // Every finish that fits the gun is on the wall, owned or not: a locked skin can be looked at on
  // the model, it just cannot be worn. That is what makes a crate worth opening.
  const skins = catalog.filter((skin) => fitsWeapon(skin, weapon));
  const ownedHere = skins.filter((skin) => owned.has(skin.id)).length;
  const previewSkin = catalog.find((skin) => skin.id === preview);
  const ownedHaircutIds = new Set(ownedCuts().map((item) => item.id));

  // Hair is judged on a head, not beside a gun: all three character pickers share the body stage.
  const onBody = section === "haircuts" || section === "body" || section === "outfits" || section === "emotes";

  const chooseWeapon = (id: WeaponId) => {
    setWeapon(id); setPreview(equip[id] ?? catalog.find((skin) => fitsWeapon(skin, id))?.id ?? "");
    uiSound("hover");
  };
  const chooseSkin = (id: string) => {
    if (id && !owned.has(id)) { setPreview(id); uiSound("hover"); return; } // Look, don't wear.
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
  const chooseEmote = (id: string, available: boolean) => {
    setEmotePreview(id);
    if (!available) { uiSound("hover"); return; }
    setEmote(equipEmote(id));
    uiSound("click");
  };
  const chooseHaircut = (id: string, available: boolean) => {
    setHairPreview(id);
    if (!available) { uiSound("hover"); return; }
    const equipped = equipHaircut(id);
    setHaircut(equipped);
    onHaircut?.(equipped);
    uiSound("click");
  };

  return (
    <section className={onBody ? "armoury on-body" : section === "crates" ? "armoury on-crates" : "armoury"} data-testid="armoury">
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
            ? <CharacterPreview build={build} haircut={section === "haircuts" ? hairPreview : haircut} outfit={outfit} emote={section === "emotes" ? emotePreview : ""} />
            : <SkinPreview weapon={weapon} skinId={preview} />}
        </div>
        <div className="armoury-current">
          {onBody
            ? section === "haircuts"
              ? <div><small>FRYZURA</small><b>{HAIRCUTS.find((item) => item.id === hairPreview)?.name}</b></div>
              : section === "emotes"
              ? <div><small>TANIEC · {rarityLabel[emoteDef(emotePreview).rarity]}</small><b>{emoteDef(emotePreview).name}</b></div>
              : <div><small>{buildDef(build).name}</small><b>{outfitDef(outfit).name}</b></div>
            : <div><small>{WEAPONS[weapon].name}{previewSkin ? ` · ${collectionName(previewSkin.collection)} · ${rarityLabel[previewSkin.rarity]}` : ""}</small><b>{previewSkin ? previewSkin.name : "Fabryczny"}</b></div>}
          <span>{section === "emotes" ? emotePreview === emote ? `POD ${keyLabel(emoteKey)}` : emotes.has(emotePreview) || emotePreview === EMOTES[0].id ? "PODGLĄD" : "ZE SKRZYNKI" : section === "haircuts" ? hairPreview === haircut ? "ZAŁOŻONA" : "PODGLĄD" : onBody ? "ZAŁOŻONE" : equip[weapon] === preview ? "ZAŁOŻONY" : preview && !owned.has(preview) ? "ZE SKRZYNKI" : "PODGLĄD"}</span>
        </div>
      </div>

      <aside className="armoury-skins">
        <div className="armoury-tabs">
          <button className={section === "skins" ? "on" : ""} onClick={() => setSection("skins")} data-testid="armoury-skins">SKINY</button>
          <button className={section === "haircuts" ? "on" : ""} onClick={() => setSection("haircuts")} data-testid="armoury-haircuts">FRYZURY</button>
          <button className={section === "body" ? "on" : ""} onClick={() => setSection("body")} data-testid="armoury-body">SYLWETKA</button>
          <button className={section === "outfits" ? "on" : ""} onClick={() => setSection("outfits")} data-testid="armoury-outfits">STRÓJ</button>
          <button className={section === "emotes" ? "on" : ""} onClick={() => setSection("emotes")} data-testid="armoury-emotes">TAŃCE</button>
          <button className={section === "crates" ? "on" : ""} onClick={() => setSection("crates")} data-testid="armoury-crates">SKRZYNKI</button>
          <button className={section === "trophies" ? "on" : ""} onClick={() => setSection("trophies")} data-testid="armoury-trophies">TROFEA</button>
        </div>
        {section === "skins" && (
          <>
            <div className="armoury-heading"><span>03</span><div><b>SKINY</b><small>Posiadane · {ownedHere}/{skins.length}</small></div></div>
            <div className="armoury-skin-grid">
              <button type="button" className={!equip[weapon] ? "skin-card on" : "skin-card"} onClick={() => chooseSkin("")} data-testid="skin-factory">
                <i className="skin-swatch factory" /><b>Fabryczny</b><small>ORYGINALNY</small>
              </button>
              {COLLECTIONS.map((collection) => {
                const inCollection = skins.filter((skin) => skin.collection === collection.id);
                if (!inCollection.length) return null;
                return (
                  <React.Fragment key={collection.id}>
                    <div className="skin-collection" data-testid={`skin-collection-${collection.id}`}><b>{collection.name}</b><small>{inCollection.filter((skin) => owned.has(skin.id)).length}/{inCollection.length}</small></div>
                    {inCollection.map((skin) => {
                      const has = owned.has(skin.id);
                      const state = equip[weapon] === skin.id ? "on" : preview === skin.id ? "peek" : "";
                      return (
                        <button type="button" key={skin.id} className={`skin-card ${skin.rarity} ${state} ${has ? "" : "locked"}`} onClick={() => chooseSkin(skin.id)} data-testid={`skin-${skin.id}`} title={has ? "Załóż skin" : "Podejrzyj skin ze skrzynki"}>
                          <SkinArt skin={skin} weapon={weapon} width={300} focus="receiver" className="skin-art" />
                          <b>{skin.name}</b><small>{rarityLabel[skin.rarity]}{has ? "" : " · ZE SKRZYNKI"}</small>
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
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
                    className={`${haircut === item.id ? "on" : ""} ${available ? "" : "locked"} hair-${item.rarity}`}
                    onClick={() => chooseHaircut(item.id, available)}
                    title={available ? "Załóż fryzurę" : "Podejrzyj nagrodę ze skrzynki"}
                    data-testid={`armoury-haircut-${item.id}`}
                  >
                    <HaircutArt style={item.style} />
                    <b>{item.name}</b>
                    <small>{available ? haircut === item.id ? "ZAŁOŻONA" : "POSIADANA" : `${rarityLabel[item.rarity]} · ${item.requirement}`}</small>
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
        {section === "emotes" && (
          <>
            <div className="armoury-heading"><span>03</span><div><b>TAŃCE</b><small>Posiadane · {emotes.size + 1}/{EMOTES.length}</small></div></div>
            <div className="armoury-emote-key" data-testid="armoury-emote-key"><kbd>{keyLabel(emoteKey)}</kbd><span>Wybrany taniec zagrasz w meczu klawiszem <b>{keyLabel(emoteKey)}</b>. Ruch, strzał albo ponowne {keyLabel(emoteKey)} go kończy.</span></div>
            <div className="armoury-build-list">
              {EMOTES.map((item) => {
                const owned = item.id === EMOTES[0].id || emotes.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`emote-card ${emote === item.id ? "on" : ""} ${emotePreview === item.id && emote !== item.id ? "peek" : ""} ${owned ? "" : "locked"} fit-${item.rarity}`}
                    onClick={() => chooseEmote(item.id, owned)}
                    title={owned ? "Podepnij pod klawisz" : "Podejrzyj taniec ze skrzynki"}
                    data-testid={`armoury-emote-${item.id}`}
                  >
                    <b>{item.name}</b>
                    <em>{rarityLabel[item.rarity]} · {item.vibe}</em>
                    <small>{item.blurb}</small>
                    <span>{owned ? emote === item.id ? `POD ${keyLabel(emoteKey)}` : `PODEPNIJ POD ${keyLabel(emoteKey)}` : "ZE SKRZYNKI"}</span>
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
            setEmotes(new Set(nextProfile.emotes));
          }} />
        )}
        {section === "trophies" && (
          <div className="armoury-trophies" data-testid="trofeum">
            <div className="armoury-heading"><span>03</span><div><b>TROFEA</b><small>Turnieje · {tournaments.length}</small></div></div>
            {tournaments.length === 0 && (
              <p className="armoury-note">Jeszcze żadnego turnieju. Wygraj jeden w poczekalni, a stanie tu twój puchar.</p>
            )}
            <div className="armoury-trophy-list">
              {tournaments.map((t) => (
                <div className="trophy-item" key={t.id} data-testid="trophy-item">
                  <span className="trophy-medal" aria-hidden="true">🏆</span>
                  <b className="trophy-winner">{t.winner || "gość"}</b>
                  <small className="trophy-size">Turniej na {t.size} osób</small>
                  <small className="trophy-date">{fmtTrophyDate(t.endedAt)}</small>
                </div>
              ))}
            </div>
          </div>
        )}
        {section === "haircuts" && <p className="armoury-note">Kliknij każdą fryzurę, żeby zobaczyć ją na postaci. Zablokowane modele wypadają ze Skrzynki Dzielnicy.</p>}
        {section === "emotes" && <p className="armoury-note">Kliknij taniec, żeby zobaczyć go na postaci. Zablokowane wypadają ze Skrzynki Dzielnicy. Taniec to czysta kosmetyka — hitbox stoi w miejscu, a kamera na chwilę odjeżdża za plecy, żebyś widział siebie.</p>}
        {(section === "body" || section === "outfits") && <p className="armoury-note">Sylwetka i strój nie ruszają hitboxa, wzrostu ani strefy głowy — zmienia się wygląd, nie trafienia. Barwy drużyny zostają na piersi i na opasce, cokolwiek nosisz.</p>}
        {!onBody && section !== "crates" && <p className="armoury-note">Wybór zapisuje się od razu i pojawi się w następnym meczu. Zablokowane skiny możesz obejrzeć na broni — wypadają ze Skrzynki Dzielnicy.</p>}
      </aside>
    </section>
  );
}
