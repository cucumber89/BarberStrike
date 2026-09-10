import { useMemo, useState, type CSSProperties } from "react";
import { DROPPABLE_OUTFITS, HAIRCUTS, outfitDef, type OutfitDef } from "@frankibarber/shared";
import { catalog, skinById, type Rarity, type SkinDef } from "@frankibarber/skins";
import {
  CRATE_CHALLENGES,
  CRATE_ODDS,
  openCrate,
  refreshDailyCrates,
  type CratePrize,
  type Profile,
} from "../game/progression/profile";
import { uiSound } from "../game/audio";

/**
 * The crate: what is in it, what the odds are, and what you just got.
 *
 * The panel used to open a crate and say nothing else. Three things were missing and all three are
 * questions a player asks before they press the button, not after: what can this GIVE me, how much
 * of it do I already have, and how likely is the thing I want. So the pool is now on screen with its
 * odds, the collection reads back as three counters, and the reveal names the tier it landed in.
 */

type PrizeKind = CratePrize["kind"];

type ReelItem = {
  id: string;
  kind: PrizeKind;
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

const kindLabel: Record<PrizeKind, string> = { skin: "SKIN BRONI", haircut: "FRYZURA", outfit: "STRÓJ" };
const kindHeading: Record<PrizeKind, string> = { skin: "NOWY SKIN BRONI", haircut: "NOWA FRYZURA", outfit: "NOWY STRÓJ" };

function skinSwatch(skin: SkinDef): string {
  const colors = String(skin.params.colors ?? skin.params.color ?? "#65717a").split(",");
  if (skin.generator === "stripes") {
    const stops = colors.map((color, index) => `${color} ${index * 18}px ${(index + 1) * 18}px`).join(",");
    return `repeating-linear-gradient(${skin.params.angle ?? 45}deg, ${stops})`;
  }
  return `linear-gradient(135deg, ${colors[0]}, #101419)`;
}

/** An outfit's card reads as the outfit: its own shirt over its own vest, with the trim as a band. */
function outfitSwatch(outfit: OutfitDef): string {
  const p = outfit.palette;
  if (!p) return "linear-gradient(160deg, #e3c02c 45%, #12703a 45%)";
  return `linear-gradient(160deg, ${p.cloth} 42%, ${p.vest} 42%, ${p.vest} 78%, ${p.trim} 78%)`;
}

function skinItem(skin: SkinDef): ReelItem {
  return { id: skin.id, kind: "skin", name: skin.name, rarity: skin.rarity, swatch: skinSwatch(skin) };
}

function outfitItem(outfit: OutfitDef): ReelItem {
  return { id: outfit.id, kind: "outfit", name: outfit.name, rarity: outfit.rarity, swatch: outfitSwatch(outfit) };
}

function prizeItem(prize: CratePrize): ReelItem {
  if (prize.kind === "skin") return skinItem(skinById(prize.id) ?? catalog[0]);
  if (prize.kind === "outfit") return outfitItem(outfitDef(prize.id));
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

  /**
   * The reel is drawn from the REAL pool — outfits and finishes both — so the cards flying past are
   * things the crate could actually have given. The prize occupies the card that stops beneath the
   * marker; the rest are scenery.
   */
  const reel = useMemo(() => {
    const pool: ReelItem[] = [...DROPPABLE_OUTFITS.map(outfitItem), ...catalog.map(skinItem)];
    const items = Array.from({ length: 31 }, (_, index) => pool[(index * 7 + 3) % pool.length]);
    if (result) items[27] = prizeItem(result);
    return items;
  }, [result]);

  const collection = [
    { label: "STROJE", have: profile.fits.length + 1, all: DROPPABLE_OUTFITS.length + 1 },
    { label: "SKINY BRONI", have: profile.skins.length, all: catalog.length },
    { label: "FRYZURY", have: HAIRCUTS.filter((h) => h.unlockedBy(profile.life) || profile.crateCuts.includes(h.id)).length, all: HAIRCUTS.length },
  ];

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

      {/* What is inside, before the button is pressed. */}
      <div className="crate-odds" data-testid="crate-odds">
        {(Object.keys(CRATE_ODDS) as PrizeKind[]).map((kind) => (
          <div key={kind}>
            <i className={`odds-${kind}`} />
            <span>{kindLabel[kind]}</span>
            <b>{Math.round(CRATE_ODDS[kind] * 100)}%</b>
          </div>
        ))}
      </div>

      <div className="crate-collection" data-testid="crate-collection">
        {collection.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <i style={{ "--p": `${Math.round(row.have / row.all * 100)}%` } as CSSProperties} />
            <b>{row.have}/{row.all}</b>
          </div>
        ))}
      </div>

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
            <header><small>SKRZYNKA DZIELNICY</small><b>{phase === "rolling" ? "LOSOWANIE NAGRODY" : kindHeading[result?.kind ?? "skin"]}</b></header>
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
                <span>{kindLabel[result.kind]} · {rarityLabel[prizeItem(result).rarity]}</span>
                <b>{prizeItem(result).name}</b>
                {result.kind === "outfit" && <em data-testid="crate-prize-blurb">{outfitDef(result.id).blurb}</em>}
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
