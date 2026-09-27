import type { OutfitRarity } from "./outfits";

/**
 * Emotes — the dances on H.
 *
 * Purely cosmetic (L1): a dance changes what the body DOES for a few seconds, never what it can do.
 * It cannot be started while moving, and any movement, shot or weapon switch ends it, so a dance is
 * a thing you do after a round, over a body, or in the spawn — not a stance that hides a hitbox.
 * The hitbox is the server's capsule and does not dance at all.
 *
 * One is owned by everyone (the wave), the rest drop from the Skrzynka Dzielnicy like outfits do
 * (L5: earned, never bought). Which one sits on H is chosen in the wardrobe, and the id travels in
 * a one-off message (`C2S.Emote`), not in the schema: nobody joining late needs to know that
 * somebody was flossing ten seconds ago.
 */

export interface EmoteDef {
  id: string;
  name: string;
  rarity: OutfitRarity;
  /** One line for the wardrobe card. */
  blurb: string;
  /** Length of one loop of the dance (ms); the pose repeats at this period. */
  loopMs: number;
  /** Rough tempo, for the wardrobe: what the dance is doing in three words. */
  vibe: string;
}

/** Owned by every profile from the first launch, so H does something before any crate is opened. */
export const DEFAULT_EMOTE = "machanie";

/** A dance ends by itself after this long, whatever happens: a stuck dance is a stuck body. */
export const EMOTE_MAX_MS = 20_000;

/** The server refuses a new dance sooner than this after the last one (spam guard). */
export const EMOTE_MIN_INTERVAL_MS = 700;

export const EMOTES: readonly EmoteDef[] = [
  { id: "machanie", name: "Machanie", rarity: "pospolity", blurb: "Siema z drugiego końca mapy.", loopMs: 1600, vibe: "SPOKOJNY" },
  { id: "czesanie", name: "Czesanie", rarity: "pospolity", blurb: "Grzebień w dłoń, grzywka na bok. Barber zawsze wygląda.", loopMs: 1400, vibe: "ZADBANY" },
  { id: "robot", name: "Robot", rarity: "pospolity", blurb: "Bip. Bup. Klasyka każdej wiejskiej dyskoteki.", loopMs: 2000, vibe: "SZTYWNY" },
  { id: "dab", name: "Dab", rarity: "pospolity", blurb: "Twarz w łokieć. Tak się świętowało w 2016.", loopMs: 1800, vibe: "MEMICZNY" },
  { id: "nitka", name: "Nitka", rarity: "rzadki", blurb: "Ręce w tę, biodra w tamtą. Szybciej, niż nadążysz.", loopMs: 900, vibe: "SZYBKI" },
  { id: "frajer-l", name: "Frajer L", rarity: "rzadki", blurb: "L na czole, noga w bok. Pokaż przegranemu, kto przegrał.", loopMs: 1000, vibe: "PRZEŚMIEWCZY" },
  { id: "konik", name: "Konik", rarity: "rzadki", blurb: "Niewidzialne lejce, galop w miejscu. Opa!", loopMs: 800, vibe: "SKOCZNY" },
  { id: "domowka", name: "Domówka", rarity: "rzadki", blurb: "Taniec, który każdy zna, choć nikt się go nie uczył.", loopMs: 1000, vibe: "DOMYŚLNY" },
  { id: "przysiad", name: "Słowiański przysiad", rarity: "epicki", blurb: "Pięty na ziemi, słonecznik w ręce, wzrok na dzielnicę.", loopMs: 3200, vibe: "ZIOMALSKI" },
  { id: "kozak", name: "Kozak", rarity: "epicki", blurb: "Ręce skrzyżowane, nogi wyrzucane z przysiadu. Hopak na gruzach.", loopMs: 700, vibe: "WYCZYNOWY" },
  { id: "wiatrak", name: "Wiatrak", rarity: "legendarny", blurb: "Ręce na boki i kręcenie, aż ekran zacznie wirować.", loopMs: 1000, vibe: "ZAWROTNY" },
  { id: "spucha", name: "Spucha", rarity: "legendarny", blurb: "Walenie konia na środku mapy. Coraz szybciej, aż do wybuchu — potem chwila oddechu i od nowa.", loopMs: 3200, vibe: "NIEPRZYZWOITY" },
];

const BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

export const isEmoteId = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);

/** Unknown ids fall back to the wave, like every other cosmetic lookup. */
export const emoteDef = (id: string): EmoteDef => BY_ID.get(id) ?? BY_ID.get(DEFAULT_EMOTE)!;

/** What a crate can hand out: everything but the wave everyone already has. */
export const DROPPABLE_EMOTES: readonly EmoteDef[] = EMOTES.filter((e) => e.id !== DEFAULT_EMOTE);

/** Client → server: start a dance (`emote` an id) or stop the current one (`emote` ""). */
export interface EmoteMessage { emote: string }
/** Server → everyone else: `id` started `emote` ("" = stopped) at server time `at`. */
export interface EmoteEvent { id: string; emote: string; at: number }

export const isEmoteMessage = (m: unknown): m is EmoteMessage =>
  !!m && typeof m === "object" && typeof (m as EmoteMessage).emote === "string"
  && ((m as EmoteMessage).emote === "" || isEmoteId((m as EmoteMessage).emote));
