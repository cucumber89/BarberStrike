/**
 * The HUD state gallery's shared fixtures: the clocks, the roster, the builders every package's
 * scenarios are written with, and the two types a scenario file speaks — `Scenario` and `Pins`.
 *
 * Owned by P0 and frozen for drop U (docs/UI_U_SPEC.md §7.0, P0 step 0b). The seven package files
 * beside this one (`death.ts` P1, `top.ts` P2, `left.ts` P3, `corners.ts` P4, `moments.ts` P5,
 * `end.ts` P6, `screens.ts` P7) hold the scenario STATES each package owns (§5.2) and the PINS
 * each package keeps on its own zones (§8.7); `index.ts` merges them and `../hudStates.tsx` runs
 * them. A package that needs a builder of its own writes it in its own file: this one does not
 * change after P0.
 *
 * The clocks, the roster, the radar and the state builders below the types were moved verbatim out
 * of the pre-drop `hudStates.tsx` (only `export` was added), so the 28 scenarios that existed
 * before the drop render exactly the state they always did. The last section, the drop U seeds,
 * is new: the builders the 41 seeded scenarios share.
 */
import {
  BOMB, DUEL, DUEL_MAP_ID, ECONOMY, MAPS, MatchPhase, NIGHT_DISTRICT, WEAPONS,
  bombAttackTeam, encodeHaircut, levelFor, scoreLimitFor,
  type BombData, type GameMode, type MapDef, type Team, type WeaponId,
} from "@frankibarber/shared";
import type { ChatLine, HudKiller, HudState, KillFeedEntry, ScoreRow } from "../game/store";
import { emptyProfile, type MatchReward } from "../game/progression/profile";
import type { RadarSnapshot } from "../game/Game";
import type { ErrCode } from "../ui/hud/copy";

// ------------------------------------------------------------------------------------ types

/**
 * The zone ids of §4.2. A text node belongs to its nearest `[data-zone]` ancestor; `none` is text
 * outside every zone. `e2e/tools/hud-states.mjs` carries the same list (and checks it against this
 * one through `window.hudStates.zones`), because the budgets it gates are written per zone.
 */
export const ZONES = [
  "top", "top-line", "action", "bracket",
  "radar", "wallet", "plan", "chat", "hint",
  "vitals", "perks", "inv", "gear", "weapon", "feed", "crosshair",
  "banner", "alert", "intro",
  "death", "prompt", "veil",
  "scoreboard", "result", "shop", "pause", "settings", "loading", "fade",
] as const;
export type Zone = (typeof ZONES)[number];

/** The seven wave-2 packages (§7), which own the scenario files and tag their pins. */
export type Pkg = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7";

/**
 * What the runner mounts:
 * - `hud`: the real `<Hud>` over the stand-in scene (the default);
 * - `loading`: the loading screen alone; `loading-ready`: its READY step over a dormant HUD (App.tsx);
 * - `menu-error`: the real `<Menu>` after a failed join, its notice fed the text of `errorCode`
 *   (`copy.ts` ERROR_TEXT). `Menu.tsx` itself is untouched.
 */
export type View = "hud" | "loading" | "loading-ready" | "menu-error";

export interface Scenario {
  id: string;
  /** The scenario's row in the spec's state table (§5.2); the gallery runs them in this order. */
  n: number;
  /** The moment of the match, in one line (it goes into states.json). */
  moment: string;
  view?: View;
  /** Played first when the moment is an EDGE (a round break is "the first Prep after Playing"). */
  before?: Partial<HudState>;
  /** The store at the photographed instant: the local clock reads `T`, the server clock `S`. */
  state: Partial<HudState>;
  radar?: RadarSnapshot;
  /** Keys held down once the HUD is up (`keydown` on window, as the game's listeners take them). */
  keys?: string[];
  /** Selectors clicked in order once the HUD is up and the pause card has armed (after `keys`). */
  clicks?: string[];
  /**
   * How long before the photograph the moment's edge happened, in ms (a banner photographed 900 ms
   * into its 2000 ms, a break photographed 9000 ms in). The runner lands `state` at the local clock
   * `T − elapsed` with the server clock `S − elapsed` (and `before` one second earlier still), then
   * moves both clocks to `T` / `S` and photographs. Absent or 0 is the pre-drop behaviour: the
   * state lands at the photographed instant.
   */
  elapsed?: number;
  /**
   * The §5.2 cap on the whole scenario's words at 1600×900, with the §4.5 visibility rows applied;
   * `null` where the table has "–". Checked at the integration and final gates (§7.0), reported
   * otherwise.
   */
  maxWords: number | null;
  /** One of the 41 scenarios seeded by P0 from §5.2 (the rows marked "new"), not a pre-drop one. */
  isNew?: true;
  /** `view: "menu-error"`: the error code whose Polish text the menu notice shows (§5.5). */
  errorCode?: ErrCode;
}

/**
 * A package's pins on one scenario (§8.8). Every pin of every package runs on every scenario it is
 * written for, at every size, and a failing pin fails the scenario — a package may not break
 * another package's pin.
 */
export interface Pins {
  /** The element exists. */
  expect?: string[];
  /** No such element. */
  absent?: string[];
  /** It exists and `checkVisibility` is false (a §4.5 hide); every match must be hidden. */
  invisible?: string[];
  /** Case-insensitive, in the page's `innerText`. */
  text?: string[];
  /** Case-sensitive, in the page's `textContent` (whitespace collapsed), as Playwright compares. */
  caseText?: string[];
  /** Not present (case-insensitive `innerText`), optionally only inside one zone. */
  textAbsent?: { text: string; zone?: Zone }[];
  /** A per-scenario word cap for a zone, tighter than §5.1 (checked by the tool, which counts). */
  zoneWords?: Partial<Record<Zone, number>>;
  /** The box of A ends left of the box of B. */
  leftOf?: [selA: string, selB: string];
  /** `scrollHeight ≤ clientHeight + 1` for every match (and at least one match). */
  noScroll?: string[];
}
/** A package file's pins, by scenario id. */
export type PinSet = Record<string, Pins>;

// ------------------------------------------------------------------------------------ clocks

/** The local clock (`performance.now()`) at the photographed instant. */
export const T = 200_000;
/** The server clock at the same instant; every deadline below is `S + <ms left>`. */
export const S = 3_600_000;

// ------------------------------------------------------------------------------------ roster

type Side = "mine" | "theirs";
interface Seat { id: string; name: string; side: Side; bot: boolean; ping: number; hair: string; /** Full-match line: kills, deaths, assists. */ line: [number, number, number] }

/**
 * Five a side, the way a public room looks: three people and two of the server's bots each (the
 * bots carry `BOT_NAMES`' spelling). The full-match lines add up — FADE's kills are TAPER's deaths
 * and the other way round — so a scoreboard at any fraction of the match still reads as one match.
 */
export const SEATS: Seat[] = [
  { id: "me", name: "Kowal", side: "mine", bot: false, ping: 24, hair: "taper", line: [12, 7, 4] },
  { id: "p1", name: "Kasia_Brzytwa", side: "mine", bot: false, ping: 31, hair: "bleach", line: [10, 8, 6] },
  { id: "p2", name: "Młody_Tomek", side: "mine", bot: false, ping: 58, hair: "bowl", line: [8, 9, 3] },
  { id: "bot-1", name: "ZDZICHU", side: "mine", bot: true, ping: 0, hair: "buzz", line: [6, 5, 2] },
  { id: "bot-2", name: "GRAZYNA", side: "mine", bot: true, ping: 0, hair: "curtains", line: [4, 4, 5] },
  { id: "p5", name: "xXPiotrekXx", side: "theirs", bot: false, ping: 19, hair: "undercut", line: [11, 8, 2] },
  { id: "p6", name: "Gruby_Wojtek", side: "theirs", bot: false, ping: 44, hair: "slickback", line: [9, 9, 4] },
  { id: "p7", name: "Szczepan", side: "theirs", bot: false, ping: 72, hair: "pompadour", line: [6, 8, 3] },
  { id: "bot-3", name: "RYSIEK", side: "theirs", bot: true, ping: 0, hair: "mohawk", line: [4, 7, 2] },
  { id: "bot-4", name: "JANUSZ", side: "theirs", bot: true, ping: 0, hair: "topknot", line: [3, 8, 1] },
];
export const seat = (id: string): Seat => SEATS.find((s) => s.id === id)!;
export const teamOf = (id: string, myTeam: Team): Team => (seat(id).side === "mine" ? myTeam : (1 - myTeam) as Team);

export interface RosterOpts {
  /** How far into the match: 1 = the full-match lines. */
  f: number;
  myTeam?: Team;
  dead?: string[];
  /** Only these seats (the 1 v 1). */
  only?: string[];
  /** Per-seat overrides (a gun-game rung, an Ostrzyżeni side, a shave count). */
  set?: Record<string, Partial<ScoreRow>>;
  /** FFA: nobody has a side. */
  ffa?: boolean;
}

/** Scoreboard rows, sorted the way `Game.syncHud` sorts them (score, then kills). */
export function roster(o: RosterOpts): ScoreRow[] {
  const myTeam = o.myTeam ?? 0;
  const rows = SEATS.filter((s) => !o.only || o.only.includes(s.id)).map((s, i): ScoreRow => {
    const [k, d, a] = s.line.map((v) => Math.round(v * o.f));
    return {
      id: s.id, name: s.name, team: o.ffa ? 0 : teamOf(s.id, myTeam), kills: k, deaths: d, assists: a,
      score: k * 100 + a * 50, ping: s.ping, alive: !(o.dead ?? []).includes(s.id), connected: true,
      money: 800 + ((i * 1_370) % 4_200), bot: s.bot, shaved: false, haircut: encodeHaircut(s.hair, 0),
      ...o.set?.[s.id],
    };
  });
  return rows.sort((a, b) => b.score - a.score || b.kills - a.kills);
}

export type Kill = [ago: number, killer: string, victim: string, weapon: string, extra?: { headshot?: boolean; assists?: string[]; shave?: boolean }];

/** Kill-feed rows, youngest last, all inside the six seconds `Game.syncHud` keeps them. */
export function feed(myTeam: Team, kills: Kill[], ffa = false): KillFeedEntry[] {
  return kills.map(([ago, killer, victim, weapon, extra], i) => ({
    key: i + 1, at: T - ago,
    killer, killerName: seat(killer).name, killerTeam: ffa ? 0 : teamOf(killer, myTeam),
    victim, victimName: seat(victim).name, victimTeam: ffa ? 0 : teamOf(victim, myTeam),
    weapon: weapon as KillFeedEntry["weapon"], headshot: !!extra?.headshot, shave: extra?.shave,
    assists: extra?.assists?.map((id) => seat(id).name),
  }));
}

// ------------------------------------------------------------------------------------ radar

/**
 * A radar frame for the minimap: me and my mates `f` of the way from our spawn points towards the
 * middle of the map (0 = standing on the spawn, as in a freeze), one spotted enemy once the round
 * is on. The minimap draws the real map image under it.
 */
export function radarFor(map: MapDef, spawnTeam: Team, f: number, o: { alive?: boolean; dead?: string[]; mates: string[]; spotted?: boolean }): RadarSnapshot {
  const all = map.spawns;
  const cx = all.reduce((s, p) => s + p.x, 0) / all.length, cz = all.reduce((s, p) => s + p.z, 0) / all.length;
  const own = all.filter((p) => p.team === spawnTeam);
  const at = (i: number) => { const p = own[i % own.length]; return { x: p.x + (cx - p.x) * f, z: p.z + (cz - p.z) * f, yaw: p.yaw }; };
  const me = at(0);
  return {
    x: me.x, z: me.z, yaw: me.yaw, alive: o.alive ?? true, map,
    mates: o.mates.map((id, i) => ({ id, ...at(i + 1), alive: !(o.dead ?? []).includes(id) })),
    spotted: o.spotted ? [{ x: me.x + (cx - me.x) * 0.6 + 4, z: me.z + (cz - me.z) * 0.6 - 3 }] : [],
  };
}
export const MATES = ["p1", "p2", "bot-1", "bot-2"];
export const DUEL_MAP = MAPS[DUEL_MAP_ID] ?? NIGHT_DISTRICT;

// ------------------------------------------------------------------------------------ states

export const kit = (w: WeaponId, ammo?: number): Partial<HudState> => ({ weapon: w, ammo: ammo ?? WEAPONS[w].magazine, reserve: WEAPONS[w].reserve });

/** What every in-match frame has: connected, holding the pointer, alive, full health. */
export const base = (mode: GameMode, myTeam: Team = 0): Partial<HudState> => ({
  connected: true, myId: "me", myTeam, mode, pointerLocked: true, loadStage: "ready",
  alive: true, health: 100, serverNow: S, ping: 24, fps: 141, tac: 1, profile: emptyProfile(),
  owned: ["pistol"], ...kit("pistol"),
});

export const TDM_LIMIT = scoreLimitFor("tdm", SEATS.length);

/** A TDM wave in full swing: 23 : 19, 4:12 on the clock, three kills in the feed. */
export const tdmLive = (): Partial<HudState> => ({
  ...base("tdm"), phase: MatchPhase.Playing, phaseEndsAt: S + 7_400, matchEndsAt: S + 252_000,
  scoreA: 23, scoreB: 19, players: roster({ f: 0.58, dead: ["p7", "bot-2", "bot-4"] }),
  health: 76, armor: 50, ...kit("rifle", 19), owned: ["pistol", "rifle"], money: 3_450,
  lethal: "frag", lethalCount: 1, tactical: "flash", tacticalCount: 1, buyWindowLeft: 0,
  killFeed: feed(0, [[4_800, "p1", "p7", "rifle"], [3_100, "p5", "bot-2", "dmr", { headshot: true }], [1_600, "me", "bot-4", "rifle", { assists: ["p2"] }]]),
  moneyToasts: [{ key: 1, delta: ECONOMY.killReward, reason: "kill", total: 3_450, at: T - 1_500 }],
});
export const tdmRadar = (o: { alive?: boolean } = {}) => radarFor(NIGHT_DISTRICT, 0, 0.45, { mates: MATES, dead: ["bot-2"], spotted: true, ...o });

export const bombData = (p: Partial<BombData>): BombData => ({
  round: 5, attackTeam: 0, stage: "carried", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0,
  actor: "", progress: 0, result: "", ...p,
});
/** A Bomb frame: the bomb block plus the two fields `Game.syncHud` derives from it. */
export const bombState = (b: BombData, rest: Partial<HudState>): Partial<HudState> => ({
  ...base("bomb", (rest.myTeam ?? 0) as Team), bomb: b, round: b.round, roundResult: b.result, ...rest,
});
export const SITE_A = NIGHT_DISTRICT.sites?.[0] ?? { id: "A", x: -35, y: 0, z: 24 };
/**
 * Bomb's match clock. The server gives a Bomb match thirty minutes up front (TdmRoom `startMatch`)
 * so it ends on rounds, and the HUD's top timer shows THAT clock in every Prep (ui/hud/TopStrip.tsx `matchLeftOf`)
 * — so it has to be the real one here too: 30:00 less ~100 s per round played (15 s freeze, a
 * typical 80 s round, the 5 s break) less how far into this round we are.
 */
export const bombMatchEnds = (roundsPlayed: number, intoRound: number): number => S + 30 * 60_000 - roundsPlayed * 100_000 - intoRound;
/** A freeze: the shop open for `left` ms, the attackers holding the bomb. */
export const bombFreeze = (round: number, left: number, rest: Partial<HudState> = {}): Partial<HudState> => {
  const attackTeam = bombAttackTeam(round);
  const b = bombData({ round, attackTeam, stage: "buy", carrier: attackTeam === 0 ? "p1" : "p5", roundEndsAt: S + left + BOMB.roundMs });
  return bombState(b, {
    phase: MatchPhase.Prep, phaseEndsAt: S + left, matchEndsAt: bombMatchEnds(round - 1, BOMB.buyMs - left), buyWindowLeft: left, money: 3_150,
    ...kit("rifle"), owned: ["pistol", "rifle"], armor: 0,
    players: roster({ f: 0.3 }), ...rest,
  });
};

export const levels = (before: number, gained: number): Pick<MatchReward, "before" | "after" | "total" | "levelsGained"> => ({
  before: levelFor(before), after: levelFor(before + gained), total: gained, levelsGained: levelFor(before + gained).level - levelFor(before).level,
});
export const REWARD_WIN: MatchReward = {
  lines: [{ label: "Zabójstwa ×12", xp: 240 }, { label: "Trafienia w głowę ×4", xp: 120 }, { label: "Asysty ×4", xp: 80 }, { label: "Rozegrany mecz", xp: 100 }, { label: "Wygrana", xp: 250 }],
  ...levels(4_300, 790), earned: ["first-blood"], haircuts: [], title: "CZELADNIK",
};
export const REWARD_LOSS: MatchReward = {
  lines: [{ label: "Zabójstwa ×5", xp: 100 }, { label: "Trafienia w głowę ×1", xp: 30 }, { label: "Asysty ×2", xp: 40 }, { label: "Rozegrany mecz", xp: 100 }],
  ...levels(4_300, 270), earned: [], haircuts: [], title: "CZELADNIK",
};

// ------------------------------------------------------------------------------------ drop U seeds

/*
 * Builders for the store fields drop U adds (`store.ts`, P0 0c: killer, spectating, roundHistory…)
 * and for the tournament, which three packages photograph. Written once here so the scenarios of
 * P1, P2, P5 and P6 describe ONE tournament and one kill the same way.
 */

/** Who killed me (`HudKiller`), `ago` ms before the photograph; the damage lines are this life's. */
export const killerOf = (id: string, weapon: string, ago: number, o: Partial<HudKiller> & { myTeam?: Team } = {}): HudKiller => {
  const { myTeam = 0, ...rest } = o;
  return {
    id, name: seat(id).name, team: teamOf(id, myTeam), weapon: weapon as HudKiller["weapon"], headshot: false, assists: [],
    hp: 37, armor: 0, dealt: 64, dealtHits: 3, taken: 100, takenHits: 4, at: T - ago, ...rest,
  };
};

/** Chat lines as `Game` stores them: `seen` is the local clock the line arrived at, `ago` ms back. */
export const chatLines = (myTeam: Team, lines: [ago: number, id: string, text: string, all?: boolean][]): ChatLine[] =>
  lines.map(([ago, id, text, all], i) => ({ key: i + 1, id, name: seat(id).name, team: teamOf(id, myTeam), text, all: !!all, seen: T - ago }));

/**
 * One four-player tournament, the way `bracketString` writes it: the two semi-finals, then the
 * final. Kowal (me) beats xXPiotrekXx 6 : 3; ZDZICHU and RYSIEK play the other semi-final; the
 * final is Kowal against its winner. `at` is the pair on the board (3 = the final is over).
 */
export const TOUR = {
  /** Semi-final 1 on the board, me in it, 1 : 0 up. */
  semi1: "4|0;Kowal|xXPiotrekXx|1|0|-;ZDZICHU|RYSIEK|0|0|-;||0|0|-",
  /** Semi-final 1 on the board WITHOUT me: ZDZICHU 2 : 1 RYSIEK, me waiting for semi-final 2. */
  semi1Waiting: "4|0;ZDZICHU|RYSIEK|2|1|-;Kowal|xXPiotrekXx|0|0|-;||0|0|-",
  /** Semi-final 2 on the board: I am through and watching ZDZICHU 4 : 3 RYSIEK. */
  semi2: "4|1;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|4|3|-;Kowal||0|0|-",
  /** Semi-final 2 decided 6 : 4; the final (Kowal vs ZDZICHU) is next. */
  toFinal: "4|2;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|6|4|a;Kowal|ZDZICHU|0|0|-",
  /** Semi-final 2 in its freeze at 2 : 1 when RYSIEK left: a walkover for ZDZICHU. */
  semi2Freeze: "4|1;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|2|1|-;Kowal||0|0|-",
  walkover: "4|2;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|2|1|a;Kowal|ZDZICHU|0|0|-",
  /** The final is over: ZDZICHU took it 6 : 4. */
  done: "4|3;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|6|4|a;Kowal|ZDZICHU|4|6|b",
} as const;

/**
 * A tournament frame: the four entrants' rows (the pair on the board are teams 0 and 1 — `a` is
 * team 0, as the room seats a pair — and everyone else is down, watching), the duel machine's
 * fields, and the bracket string. `pair` names the two seats playing now, `a` first; `dead` are
 * pair players down in this round, `gone` entrants who left the room (their row stays,
 * disconnected, as the server keeps it).
 */
export const turniej = (bracket: string, pair: [string, string] | null, rest: Partial<HudState> = {}, o: { gone?: string[]; dead?: string[] } = {}): Partial<HudState> => {
  const entrants = ["me", "p5", "bot-1", "bot-3"];
  const myTeam: Team = pair ? (pair[1] === "me" ? 1 : 0) : 0;
  const set = Object.fromEntries(entrants.map((id) => {
    const side = pair ? pair.indexOf(id) : -1;
    const row: Partial<ScoreRow> = side >= 0 ? { team: side as Team, alive: true } : { team: 0 as Team, alive: false };
    return [id, o.gone?.includes(id) ? { ...row, alive: false, connected: false } : o.dead?.includes(id) ? { ...row, alive: false } : row];
  }));
  return {
    ...base("turniej", myTeam), bracket, round: 1,
    players: roster({ f: 0.2, only: entrants, set }),
    alive: !!pair && pair.includes("me") && !o.dead?.includes("me"), health: pair?.includes("me") && !o.dead?.includes("me") ? 100 : 0,
    ...rest,
  };
};
/** The 1 v 1's clock caps (`DUEL.matchMs`), for a tournament pair's `matchEndsAt`. */
export const pairMatchEnds = (roundsPlayed: number): number => S + DUEL.matchMs - roundsPlayed * 75_000;
