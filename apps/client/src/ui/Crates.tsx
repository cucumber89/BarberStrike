import { useMemo, useState, type CSSProperties } from "react";
import { HAIRCUTS } from "@frankibarber/shared";
import { catalog, skinById, type Rarity, type SkinDef } from "@frankibarber/skins";
import {
  CRATE_CHALLENGES,
  openCrate,
  refreshDailyCrates,
  type CratePrize,
  type Profile,
} from "../game/progression/profile";
import { uiSound } from "../game/audio";

type ReelItem = {
  id: string;
  kind: "skin" | "haircut";
  name: string;
  rarity: Rarity;
  swatch: string;
};

const rarityLabel: Record<Rarity, string> = {
  pospolity: "POSPOLITY",
  rzadki: "RZADKI",
  epicki: "EPICKI",
  legendarny: "LEGENDARNY",
  zloty: "ZŁOTY",
};

function skinSwatch(skin: SkinDef): string {
  const colors = String(skin.params.colors ?? skin.params.color ?? "#65717a").split(",");
  if (skin.generator === "stripes") {
    const stops = colors.map((color, index) => `${color} ${index * 18}px ${(index + 1) * 18}px`).join(",");
    return `repeating-linear-gradient(${skin.params.angle ?? 45}deg, ${stops})`;
  }
  return `linear-gradient(135deg, ${colors[0]}, #101419)`;
}

function skinItem(skin: SkinDef): ReelItem {
  return { id: skin.id, kind: "skin", name: skin.name, rarity: skin.rarity, swatch: skinSwatch(skin) };
}

function prizeItem(prize: CratePrize): ReelItem {
  if (prize.kind === "skin") return skinItem(skinById(prize.id) ?? catalog[0]);
  const haircut = HAIRCUTS.find((item) => item.id === prize.id);
  return {
    id: prize.id,
    kind: "haircut",
    name: haircut?.name ?? prize.id,
    rarity: "epicki",
    swatch: haircut?.style.tone === "bleach" ? "#e8d99f" : "#29201a",
  };
}

export function Crates({ onProfile }: { onProfile(profile: Profile): void }) {
  const [profile, setProfile] = useState(() => refreshDailyCrates());
  const [result, setResult] = useState<CratePrize | null>(null);
  const [phase, setPhase] = useState<"closed" | "rolling" | "won">("closed");

  // The prize occupies the card that stops beneath the marker. Surrounding cards are cosmetic.
  const reel = useMemo(() => {
    const items = Array.from({ length: 31 }, (_, index) => skinItem(catalog[(index * 7 + 3) % catalog.length]));
    if (result) items[27] = prizeItem(result);
    return items;
  }, [result]);

  const open = () => {
    if (!profile.crates || phase === "rolling") return;
    const rolled = openCrate();
    if (!rolled) return;
    setProfile(rolled.profile);
    onProfile(rolled.profile);
    setResult(rolled.prize);
    setPhase("rolling");
    uiSound("open");
    window.setTimeout(() => {
      setPhase("won");
      uiSound("click");
    }, 4300);
  };

  return (
    <section className="crate-panel" data-testid="crates">
      <div className="crate-top">
        <div><b>SKRZYNKI DZIELNICY</b><small>Codzienny odbiór i nagrody za zadania</small></div>
        <strong data-testid="crate-count">{profile.crates}</strong>
      </div>

      <button className="crate-case" type="button" onClick={open} disabled={!profile.crates || phase === "rolling"} data-testid="crate-open">
        <i /><span>M</span><b>{phase === "rolling" ? "LOSOWANIE…" : profile.crates ? "OTWÓRZ" : "WRÓĆ JUTRO"}</b>
      </button>

      <div className="crate-tasks">
        {CRATE_CHALLENGES.map((task) => {
          const progress = Math.max(0, profile.life[task.stat] - profile.challengeBase[task.stat]);
          const done = profile.challengeClaims.includes(task.id);
          return (
            <div key={task.id} className={done ? "done" : ""}>
              <i style={{ "--p": `${Math.min(100, progress / task.target * 100)}%` } as CSSProperties} />
              <span>{task.label}</span>
              <b>{done ? "✓ SKRZYNKA" : `${Math.min(progress, task.target)}/${task.target}`}</b>
            </div>
          );
        })}
      </div>

      {phase !== "closed" && (
        <div className={`crate-opening ${phase}`} data-testid="crate-opening">
          <div className="crate-dialog">
            <button className="crate-close" onClick={() => setPhase("closed")} disabled={phase === "rolling"} aria-label="Zamknij">×</button>
            <header><small>SKRZYNKA DZIELNICY</small><b>{phase === "rolling" ? "LOSOWANIE NAGRODY" : "NOWY PRZEDMIOT"}</b></header>
            <div className="reel-window">
              <i />
              <div className="reel-track">
                {reel.map((item, index) => (
                  <div key={`${item.id}-${index}`} className={item.rarity} data-winning={index === 27 ? "true" : undefined}>
                    <span
                      className={item.kind === "haircut" ? "haircut-drop" : ""}
                      style={{ "--swatch": item.swatch } as CSSProperties}
                    />
                    <b>{item.name}</b><small>{item.kind === "haircut" ? "FRYZURA" : rarityLabel[item.rarity]}</small>
                  </div>
                ))}
              </div>
            </div>
            {phase === "won" && result && (
              <div className={`crate-reveal ${prizeItem(result).rarity}`} data-testid="crate-prize">
                <span>{result.kind === "skin" ? "SKIN BRONI" : "NOWA FRYZURA"}</span>
                <b>{prizeItem(result).name}</b>
                <button onClick={() => setPhase("closed")}>DODAJ DO KOLEKCJI</button>
              </div>
            )}
            <p>Każda nagroda jest kosmetyczna. Rzadkie przedmioty nie dają przewagi.</p>
          </div>
        </div>
      )}
    </section>
  );
}
