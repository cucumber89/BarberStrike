import type { SkinDef } from "./types";

/** Six deliberately different directions for the owner's slice-4 art gate; no bitmap assets. */
export const catalog: readonly SkinDef[] = [
  { id: "warsztat", name: "Warsztat", rarity: "pospolity", generator: "solid", seed: 1987, params: { color: "#4a4f45", finish: "mat", grain: .35 }, weapons: "all", blurb: "Zapach oleju i poniedziałku." },
  { id: "stalowka", name: "Stalówka", rarity: "pospolity", generator: "solid", seed: 1044, params: { color: "#a9b0b8", finish: "połysk", grain: .15 }, weapons: "all", blurb: "Czysta stal. Nic więcej." },
  { id: "talk", name: "Talk", rarity: "pospolity", generator: "solid", seed: 2026, params: { color: "#e8e2d6", finish: "mat", grain: .18 }, weapons: "all", blurb: "Biała jak ręcznik, który zaraz przestanie być biały." },
  { id: "slupek-frankiego", name: "Słupek Frankiego", rarity: "rzadki", generator: "stripes", seed: 1987, params: { angle: 62, width: 34, gap: 22, helix: true, colors: "#e8e2d6,#c8102e,#0a3d91" }, weapons: "all", blurb: "Kręci się od 1987 i nikt nie wie po co." },
  { id: "szlaczek-babci", name: "Szlaczek Babci", rarity: "rzadki", generator: "stripes", seed: 1938, params: { angle: 0, width: 8, gap: 10, edge: "malowane", colors: "#7a5c3a,#d9c9a3" }, weapons: "all", blurb: "Wzór z serwetki, przeniesiony na broń." },
  { id: "osy", name: "Osy", rarity: "rzadki", generator: "stripes", seed: 7331, params: { angle: 38, width: 26, gap: 26, edge: "postrzępione", colors: "#f2b400,#141414" }, weapons: "all", blurb: "Nie drażnić." },
];
