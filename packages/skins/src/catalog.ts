import type { SkinDef } from "./types";

/** Six deliberately different directions for the owner's slice-4 art gate; no bitmap assets. */
export const catalog: readonly SkinDef[] = [
  { id: "warsztat", name: "Warsztat", rarity: "pospolity", generator: "solid", seed: 1987, params: { color: "#4a4f45", finish: "mat", grain: .35 }, weapons: "all", blurb: "Zapach oleju i poniedziałku." },
  { id: "stalowka", name: "Stalówka", rarity: "pospolity", generator: "solid", seed: 1044, params: { color: "#a9b0b8", finish: "połysk", grain: .15 }, weapons: "all", blurb: "Czysta stal. Nic więcej." },
  { id: "talk", name: "Talk", rarity: "pospolity", generator: "solid", seed: 2026, params: { color: "#e8e2d6", finish: "mat", grain: .18 }, weapons: "all", blurb: "Biała jak ręcznik, który zaraz przestanie być biały." },
  { id: "slupek-frankiego", name: "Słupek Frankiego", rarity: "rzadki", generator: "stripes", seed: 1987, params: { angle: 62, width: 34, gap: 22, helix: true, colors: "#e8e2d6,#c8102e,#0a3d91" }, weapons: "all", blurb: "Kręci się od 1987 i nikt nie wie po co." },
  { id: "szlaczek-babci", name: "Szlaczek Babci", rarity: "rzadki", generator: "stripes", seed: 1938, params: { angle: 0, width: 8, gap: 10, edge: "malowane", colors: "#7a5c3a,#d9c9a3" }, weapons: "all", blurb: "Wzór z serwetki, przeniesiony na broń." },
  { id: "osy", name: "Osy", rarity: "rzadki", generator: "stripes", seed: 7331, params: { angle: 38, width: 26, gap: 26, edge: "postrzępione", colors: "#f2b400,#141414" }, weapons: "all", blurb: "Nie drażnić." },
  { id: "beton", name: "Beton", rarity: "pospolity", generator: "solid", seed: 81, params: { color: "#697077", finish: "mat", grain: .55 }, weapons: "all", blurb: "Surowy i niezawodny." },
  { id: "oliwka", name: "Oliwka", rarity: "pospolity", generator: "solid", seed: 82, params: { color: "#596044", finish: "mat", grain: .38 }, weapons: "all", blurb: "Klasyka zaplecza." },
  { id: "rdza", name: "Rdza", rarity: "pospolity", generator: "stripes", seed: 83, params: { angle: 12, width: 7, gap: 20, colors: "#442f25,#99552e" }, weapons: "all", blurb: "Po przejściach." },
  { id: "nocna-zmiana", name: "Nocna Zmiana", rarity: "rzadki", generator: "stripes", seed: 91, params: { angle: 55, width: 18, gap: 24, colors: "#10141c,#315d85,#9fc9df" }, weapons: "all", blurb: "Światła miasta po zamknięciu." },
  { id: "brzytwa", name: "Brzytwa", rarity: "rzadki", generator: "stripes", seed: 92, params: { angle: 4, width: 4, gap: 16, colors: "#20252b,#dce4e8" }, weapons: "all", blurb: "Ostry srebrny rytm." },
  { id: "landrynka", name: "Landrynka", rarity: "rzadki", generator: "stripes", seed: 93, params: { angle: 68, width: 15, gap: 10, colors: "#3c183d,#ef4d9b,#5de1d0" }, weapons: "all", blurb: "Słodka tylko z daleka." },
  { id: "fioletowy-dym", name: "Fioletowy Dym", rarity: "epicki", generator: "stripes", seed: 101, params: { angle: 27, width: 32, gap: 9, edge: "postrzępione", colors: "#160d25,#7138a8,#d68cff" }, weapons: "all", blurb: "Zostaje w pamięci." },
  { id: "tokio", name: "Tokio po Północy", rarity: "epicki", generator: "stripes", seed: 102, params: { angle: 73, width: 9, gap: 13, colors: "#071726,#00d9ff,#ff287f" }, weapons: "all", blurb: "Neon odbity w mokrym asfalcie." },
  { id: "krolewski", name: "Królewski Fach", rarity: "epicki", generator: "stripes", seed: 103, params: { angle: 45, width: 24, gap: 24, colors: "#20152e,#744aa8,#d6b768" }, weapons: "all", blurb: "Dla mistrza stanowiska." },
  { id: "krwawy-zachod", name: "Krwawy Zachód", rarity: "epicki", generator: "stripes", seed: 104, params: { angle: 8, width: 38, gap: 7, edge: "postrzępione", colors: "#22080b,#b20f2c,#ff8b45" }, weapons: "all", blurb: "Ostatni klient już wyszedł." },
  { id: "czarne-zloto", name: "Czarne Złoto", rarity: "legendarny", generator: "stripes", seed: 111, params: { angle: 60, width: 28, gap: 8, colors: "#080808,#c99832,#fff0a6" }, weapons: "all", blurb: "Luksus bez kompromisów." },
  { id: "zorza", name: "Zorza", rarity: "legendarny", generator: "stripes", seed: 112, params: { angle: 20, width: 42, gap: 5, colors: "#071326,#13e0a1,#4b69ff,#d64cff" }, weapons: "all", blurb: "Kolor, który nie powinien istnieć." },
  { id: "korona-frankiego", name: "Korona Frankiego", rarity: "zloty", generator: "stripes", seed: 1987, params: { angle: 48, width: 36, gap: 4, colors: "#110c05,#ffbd24,#fff2a1" }, weapons: "all", blurb: "Najrzadszy znak zakładu." },
];
