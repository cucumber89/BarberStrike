/**
 * HUD state gallery (dev page, not shipped — Vite's build input is `index.html` alone: see
 * `vite.config.ts`, which sets no `rollupOptions.input`, so root pages like this one are served by
 * the dev server and never built).
 *
 * Drop U's brief: the in-game UI is "a thousand captions, tiny counters and no time to read any of
 * it" — make it feel like CS / Call of Duty, the HUD AND the moments around it: warm-up, countdown,
 * round end, halftime, death, pause, match end. Every one of those is a moment a player reaches
 * only by playing a match up to it, so nobody could put them side by side and "it is cluttered"
 * stayed an opinion. This page puts the REAL <Hud> (or the real <Loading>) into any of them on
 * demand — `?s=<scenario>` — with a whole match behind it: five against five with Polish nicks, a
 * kill feed, a wallet, a score and clocks that read real numbers. `e2e/tools/hud-states.mjs`
 * photographs every scenario and counts the words, text blocks and font sizes on screen, so
 * "simpler" is a number before and after, not an impression.
 *
 * Determinism: the gallery owns every clock the HUD reads. `performance.now()` is pinned (the kill
 * feed, the respawn countdown, the damage arrow, the flag notice and the HUD's own 4 Hz clock all
 * read it), `serverNow` is a constant the scenario's deadlines are computed from, and once the
 * moment is on screen every CSS animation is paused at the same offset. The same scenario renders
 * the same pixels on every run.
 *
 * What a returning player sees: the first-run hints are marked as seen (they show once ever, on a
 * timer), and the DEV-only frame counter is hidden unless `&debug=1` — a built game shows it only
 * when the player turns it on in the settings.
 *
 * A round BREAK is not a state but an edge: the HUD recognises it as "the first Prep after
 * Playing" (Hud.tsx, `breakEndsAt`), so those scenarios play the `before` state first and then
 * the break, exactly as the network delivers it.
 */
// The same cascade as the game. `App` imports `Menu`, which imports menu.css, and main.tsx's own
// sheets are evaluated after its imports — so menu.css comes first, then the fonts, styles.css and
// cinematic.css. Measured font sizes and colours are only the game's if the cascade is.
import "./ui/menu.css";
import "@fontsource/bebas-neue";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./ui/styles.css";
import "./ui/cinematic.css";
import React from "react";
import { createRoot } from "react-dom/client";
import {
  BOMB, CS_ECONOMY, DUEL_MAP_ID, ECONOMY, MAPS, MatchPhase, NIGHT_DISTRICT, OSTRZYZENI, TEAM_NAMES, WEAPONS,
  bombAttackTeam, csLossBonus, encodeHaircut, ladderWeapon, levelFor, planOffer, scoreLimitFor,
  type BombData, type GameMode, type MapDef, type Team, type WeaponId,
} from "@frankibarber/shared";
import { Hud } from "./ui/Hud";
import { Loading } from "./ui/Loading";
import { HINTS, saveSeen } from "./ui/hintRules";
import { hud, initialHud, type HudState, type KillFeedEntry, type ScoreRow } from "./game/store";
import { emptyProfile, type MatchReward } from "./game/progression/profile";
import { defaultSettings } from "./settings";
import type { RadarSnapshot } from "./game/Game";

// ------------------------------------------------------------------------------------ clocks

/** The local clock (`performance.now()`) at the photographed instant. */
const T = 200_000;
/** The server clock at the same instant; every deadline below is `S + <ms left>`. */
const S = 3_600_000;
let clock = T;
performance.now = () => clock;
/** Where every CSS animation is paused once the moment is on screen. */
const FREEZE_AT_MS = 600;

// ------------------------------------------------------------------------------------ roster

type Side = "mine" | "theirs";
interface Seat { id: string; name: string; side: Side; bot: boolean; ping: number; hair: string; /** Full-match line: kills, deaths, assists. */ line: [number, number, number] }

/**
 * Five a side, the way a public room looks: three people and two of the server's bots each (the
 * bots carry `BOT_NAMES`' spelling). The full-match lines add up — FADE's kills are TAPER's deaths
 * and the other way round — so a scoreboard at any fraction of the match still reads as one match.
 */
const SEATS: Seat[] = [
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
const seat = (id: string): Seat => SEATS.find((s) => s.id === id)!;
const teamOf = (id: string, myTeam: Team): Team => (seat(id).side === "mine" ? myTeam : (1 - myTeam) as Team);

interface RosterOpts {
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
function roster(o: RosterOpts): ScoreRow[] {
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

type Kill = [ago: number, killer: string, victim: string, weapon: string, extra?: { headshot?: boolean; assists?: string[]; shave?: boolean }];

/** Kill-feed rows, youngest last, all inside the six seconds `Game.syncHud` keeps them. */
function feed(myTeam: Team, kills: Kill[], ffa = false): KillFeedEntry[] {
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
function radarFor(map: MapDef, spawnTeam: Team, f: number, o: { alive?: boolean; dead?: string[]; mates: string[]; spotted?: boolean }): RadarSnapshot {
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
const MATES = ["p1", "p2", "bot-1", "bot-2"];
const DUEL_MAP = MAPS[DUEL_MAP_ID] ?? NIGHT_DISTRICT;

// ------------------------------------------------------------------------------------ states

const kit = (w: WeaponId, ammo?: number): Partial<HudState> => ({ weapon: w, ammo: ammo ?? WEAPONS[w].magazine, reserve: WEAPONS[w].reserve });

/** What every in-match frame has: connected, holding the pointer, alive, full health. */
const base = (mode: GameMode, myTeam: Team = 0): Partial<HudState> => ({
  connected: true, myId: "me", myTeam, mode, pointerLocked: true, loadStage: "ready",
  alive: true, health: 100, serverNow: S, ping: 24, fps: 141, tac: 1, profile: emptyProfile(),
  owned: ["pistol"], ...kit("pistol"),
});

const TDM_LIMIT = scoreLimitFor("tdm", SEATS.length);

/** A TDM wave in full swing: 23 : 19, 4:12 on the clock, three kills in the feed. */
const tdmLive = (): Partial<HudState> => ({
  ...base("tdm"), phase: MatchPhase.Playing, phaseEndsAt: S + 7_400, matchEndsAt: S + 252_000,
  scoreA: 23, scoreB: 19, players: roster({ f: 0.58, dead: ["p7", "bot-2", "bot-4"] }),
  health: 76, armor: 50, ...kit("rifle", 19), owned: ["pistol", "rifle"], money: 3_450,
  lethal: "frag", lethalCount: 1, tactical: "flash", tacticalCount: 1, buyWindowLeft: 0,
  killFeed: feed(0, [[4_800, "p1", "p7", "rifle"], [3_100, "p5", "bot-2", "dmr", { headshot: true }], [1_600, "me", "bot-4", "rifle", { assists: ["p2"] }]]),
  moneyToasts: [{ key: 1, delta: ECONOMY.killReward, reason: "kill", total: 3_450, at: T - 1_500 }],
});
const tdmRadar = (o: { alive?: boolean } = {}) => radarFor(NIGHT_DISTRICT, 0, 0.45, { mates: MATES, dead: ["bot-2"], spotted: true, ...o });

const bombData = (p: Partial<BombData>): BombData => ({
  round: 5, attackTeam: 0, stage: "carried", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0,
  actor: "", progress: 0, result: "", ...p,
});
/** A Bomb frame: the bomb block plus the two fields `Game.syncHud` derives from it. */
const bombState = (b: BombData, rest: Partial<HudState>): Partial<HudState> => ({
  ...base("bomb", (rest.myTeam ?? 0) as Team), bomb: b, round: b.round, roundResult: b.result, ...rest,
});
const SITE_A = NIGHT_DISTRICT.sites?.[0] ?? { id: "A", x: -35, y: 0, z: 24 };
/**
 * Bomb's match clock. The server gives a Bomb match thirty minutes up front (TdmRoom `startMatch`)
 * so it ends on rounds, and the HUD's top timer shows THAT clock in every Prep (Hud.tsx `matchLeft`)
 * — so it has to be the real one here too: 30:00 less ~100 s per round played (15 s freeze, a
 * typical 80 s round, the 5 s break) less how far into this round we are.
 */
const bombMatchEnds = (roundsPlayed: number, intoRound: number): number => S + 30 * 60_000 - roundsPlayed * 100_000 - intoRound;
/** A freeze: the shop open for `left` ms, the attackers holding the bomb. */
const bombFreeze = (round: number, left: number, rest: Partial<HudState> = {}): Partial<HudState> => {
  const attackTeam = bombAttackTeam(round);
  const b = bombData({ round, attackTeam, stage: "buy", carrier: attackTeam === 0 ? "p1" : "p5", roundEndsAt: S + left + BOMB.roundMs });
  return bombState(b, {
    phase: MatchPhase.Prep, phaseEndsAt: S + left, matchEndsAt: bombMatchEnds(round - 1, BOMB.buyMs - left), buyWindowLeft: left, money: 3_150,
    ...kit("rifle"), owned: ["pistol", "rifle"], armor: 0,
    players: roster({ f: 0.3 }), ...rest,
  });
};

const levels = (before: number, gained: number): Pick<MatchReward, "before" | "after" | "total" | "levelsGained"> => ({
  before: levelFor(before), after: levelFor(before + gained), total: gained, levelsGained: levelFor(before + gained).level - levelFor(before).level,
});
const REWARD_WIN: MatchReward = {
  lines: [{ label: "Zabójstwa ×12", xp: 240 }, { label: "Trafienia w głowę ×4", xp: 120 }, { label: "Asysty ×4", xp: 80 }, { label: "Rozegrany mecz", xp: 100 }, { label: "Wygrana", xp: 250 }],
  ...levels(4_300, 790), earned: ["first-blood"], haircuts: [], title: "CZELADNIK",
};
const REWARD_LOSS: MatchReward = {
  lines: [{ label: "Zabójstwa ×5", xp: 100 }, { label: "Trafienia w głowę ×1", xp: 30 }, { label: "Asysty ×2", xp: 40 }, { label: "Rozegrany mecz", xp: 100 }],
  ...levels(4_300, 270), earned: [], haircuts: [], title: "CZELADNIK",
};

// ------------------------------------------------------------------------------------ scenarios

interface Scenario {
  id: string;
  /** The moment of the match, in one line (it goes into states.json). */
  moment: string;
  /** `loading`: the loading screen alone; `loading-ready`: its READY step over a dormant HUD (App.tsx). */
  view?: "hud" | "loading" | "loading-ready";
  /** Played first when the moment is an EDGE (a round break is "the first Prep after Playing"). */
  before?: Partial<HudState>;
  state: Partial<HudState>;
  radar?: RadarSnapshot;
  /** Keys held down once the HUD is up (`keydown` on window, as the game's listeners take them). */
  keys?: string[];
  /** Selectors that must be on the page, or the scenario did not reach its moment. */
  expect: string[];
  /** Words that must be on screen (case-insensitive: the CSS upper-cases much of the HUD). */
  text?: string[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "warmup", moment: "Rozgrzewka: sam na serwerze, czekasz na drugiego gracza",
    state: { ...base("tdm"), phase: MatchPhase.Waiting, players: roster({ f: 0, only: ["me"] }), money: ECONOMY.startMoney, buyWindowLeft: Infinity },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.1, { mates: [] }),
    expect: ["[data-testid=objective]", "[data-testid=timer]"], text: ["ROZGRZEWKA"],
  },
  {
    id: "countdown", moment: "Odliczanie do startu meczu (3…)",
    state: { ...base("tdm"), phase: MatchPhase.Countdown, phaseEndsAt: S + 2_600, players: roster({ f: 0 }), money: ECONOMY.startMoney, buyWindowLeft: Infinity },
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
    expect: ["[data-testid=countdown]", "[data-testid=objective]"], text: ["START 3"],
  },
  {
    id: "tdm-live", moment: "TDM, fala trwa: 23 : 19, 4:12 do końca",
    state: tdmLive(), radar: tdmRadar(),
    expect: ["[data-testid=crosshair]", "[data-testid=killfeed] li", "[data-testid=score-goal]"], text: ["04:12"],
  },
  {
    id: "tdm-wave-prep", moment: "TDM, przerwa między falami: wszyscy wstają, 3 s zamrożenia",
    before: { ...tdmLive(), serverNow: S - 1_800, phaseEndsAt: S - 1_700 },
    state: {
      ...tdmLive(), phase: MatchPhase.Prep, phaseEndsAt: S + 3_200, matchEndsAt: S + 235_000, scoreA: 24, scoreB: 19,
      players: roster({ f: 0.6 }), health: 100, ammo: WEAPONS.rifle.magazine, buyWindowLeft: Infinity, moneyToasts: [],
      killFeed: feed(0, [[4_300, "p5", "bot-2", "dmr", { headshot: true }], [2_700, "me", "bot-4", "rifle", { assists: ["p2"] }], [2_000, "p1", "p6", "smg"]]),
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
    expect: ["[data-testid=buy-prompt]", "[data-testid=timer]"], text: ["03:55"],
  },
  {
    id: "dom-live-capturing", moment: "Domination: stoisz na B i przejmujesz ją (62 %)",
    state: {
      ...base("dom"), phase: MatchPhase.Playing, phaseEndsAt: S + 6_000, matchEndsAt: S + 303_000, scoreA: 61, scoreB: 54,
      players: roster({ f: 0.5, dead: ["p2"] }), health: 88, armor: 50, ...kit("smg", 22), owned: ["pistol", "smg"], money: 2_800,
      tactical: "smoke", tacticalCount: 1, buyWindowLeft: 0,
      flags: NIGHT_DISTRICT.flags.map((f, i) => ({ id: f.id, name: f.name, owner: i === 0 ? 0 : i === 2 ? 1 : -1, capTeam: i === 1 ? 0 : -1, cap: i === 1 ? 0.62 : 0, contested: false })),
      inFlag: 1,
      flagNotice: { text: `${TEAM_NAMES[0]} TOOK ${NIGHT_DISTRICT.flags[0]?.id ?? "A"} · ${NIGHT_DISTRICT.flags[0]?.name ?? ""}`, team: 0, at: T - 900 },
      killFeed: feed(0, [[3_900, "p6", "p2", "rifle"], [2_200, "me", "p6", "smg", { headshot: true }]]),
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.55, { mates: MATES, dead: ["p2"], spotted: true }),
    expect: ["[data-testid=capture]", "[data-testid=flags]", "[data-testid=flag-notice]"], text: ["62%"],
  },
  {
    id: "bomb-freeze", moment: "Bomb, runda 5, zamrożenie: zakupy + głosowanie planu (atak)",
    state: bombFreeze(5, 11_400, {
      scoreA: 3, scoreB: 1,
      plan: { options: planOffer(5), tally: [1, 2], chosen: 0, appliesAt: S + 11_400, votingTeam: 0, round: 5, at: T - 3_600 },
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
    expect: ["[data-testid=bomb-hud]", "[data-testid=plan-vote]", "[data-testid=buy-prompt]"], text: ["START ZA 12s", "23:17"],
  },
  {
    id: "bomb-live-carrier", moment: "Bomb, runda trwa, niesiesz ładunek (atak)",
    state: bombState(bombData({ stage: "carried", carrier: "me", roundEndsAt: S + 71_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 71_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 44_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, dead: ["p7", "bot-2"] }), health: 100, armor: 100, ...kit("rifle", 27), owned: ["pistol", "rifle"], money: 350,
      lethal: "frag", lethalCount: 1, tactical: "smoke", tacticalCount: 1,
      plan: { options: planOffer(5), tally: [1, 2], chosen: planOffer(5)[1] ?? 0, appliesAt: S - 44_000, votingTeam: 0, round: 5, at: T - 44_000 },
      planId: planOffer(5)[1] ?? 0,
      killFeed: feed(0, [[4_100, "p1", "p7", "rifle"], [1_900, "bot-3", "bot-2", "smg"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: MATES, dead: ["bot-2"], spotted: true }),
    expect: ["[data-testid=bomb-hud]", "[data-testid=crosshair]"], text: ["MASZ ŁADUNEK", "01:11"],
  },
  {
    id: "bomb-planted-defender", moment: "Bomb: ładunek podłożony na A, bronisz, 28 s do wybuchu",
    state: bombState(bombData({ stage: "planted", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, endsAt: S + 27_400, roundEndsAt: S + 40_000 }), {
      myTeam: 1, phase: MatchPhase.Playing, phaseEndsAt: S + 40_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 75_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, myTeam: 1, dead: ["p2", "bot-1", "p6"] }), health: 54, armor: 30, ...kit("rifle", 12), owned: ["pistol", "rifle"], money: 1_150,
      tactical: "flash", tacticalCount: 1,
      killFeed: feed(1, [[5_200, "p6", "p2", "rifle"], [3_300, "bot-3", "bot-1", "shotgun"], [900, "me", "p6", "rifle", { headshot: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.5, { mates: MATES, dead: ["p2", "bot-1"], spotted: true }),
    expect: [".bomb-hud.armed", "[data-testid=timer].urgent"], text: ["ROZBROIĆ", "00:28"],
  },
  {
    id: "bomb-round-won", moment: "Bomb: przerwa po rundzie — ładunek wybuchł, runda dla nas",
    before: bombState(bombData({ stage: "planted", site: SITE_A.id, x: SITE_A.x, z: SITE_A.z, endsAt: S + 200, roundEndsAt: S + 20_000 }), {
      phase: MatchPhase.Playing, serverNow: S - 1_600, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), scoreA: 3, scoreB: 1, players: roster({ f: 0.36, dead: ["p2", "p5", "p6"] }),
      ...kit("rifle", 14), owned: ["pistol", "rifle"], health: 63, money: 450,
    }),
    state: bombState(bombData({ stage: "resolved", site: SITE_A.id, x: SITE_A.x, z: SITE_A.z, result: "BOMB DETONATED" }), {
      phase: MatchPhase.Prep, phaseEndsAt: S + 3_400, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), roundWinner: 0, scoreA: 4, scoreB: 1,
      players: roster({ f: 0.36, dead: ["p2", "p5", "p6", "p7", "bot-3", "bot-4"] }), ...kit("rifle", 14), owned: ["pistol", "rifle"], health: 63, money: 450 + BOMB.winMoney,
      killFeed: feed(0, [[4_600, "me", "p6", "rifle"], [1_300, "p1", "p5", "rifle", { headshot: true }]]),
      moneyToasts: [{ key: 7, delta: BOMB.winMoney, reason: "capture", total: 450 + BOMB.winMoney, at: T - 600 }],
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.6, { mates: MATES, dead: ["p2"] }),
    expect: ["[data-testid=round-end].mine", "[data-testid=bomb-hud]"], text: ["RUNDA DLA FADE"],
  },
  {
    id: "bomb-round-lost", moment: "Bomb: przerwa po rundzie — atak wybity, zginąłeś, runda dla nich",
    before: bombState(bombData({ stage: "dropped", roundEndsAt: S + 30_000 }), {
      phase: MatchPhase.Playing, serverNow: S - 1_600, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), scoreA: 3, scoreB: 1, alive: false, health: 0, killerName: seat("p6").name, killerWeapon: "smg",
      players: roster({ f: 0.36, dead: ["me", "p1", "bot-1", "bot-2", "p7"] }), money: 200,
    }),
    state: bombState(bombData({ stage: "resolved", result: "ATTACKERS ELIMINATED" }), {
      phase: MatchPhase.Prep, phaseEndsAt: S + 3_400, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), roundWinner: 1, scoreA: 3, scoreB: 2, alive: false, health: 0,
      killerName: seat("p6").name, killerWeapon: "smg",
      players: roster({ f: 0.36, dead: ["me", "p1", "p2", "bot-1", "bot-2", "p7"] }), money: 200 + csLossBonus(0),
      killFeed: feed(0, [[5_000, "p6", "me", "smg"], [2_900, "p5", "p1", "dmr", { headshot: true }], [1_200, "bot-3", "p2", "shotgun"]]),
      moneyToasts: [{ key: 8, delta: csLossBonus(0), reason: "capture", total: 200 + csLossBonus(0), at: T - 600 }],
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.55, { alive: false, mates: MATES, dead: ["p1", "p2", "bot-1", "bot-2"] }),
    expect: ["[data-testid=round-end].theirs", "[data-testid=death]"], text: ["RUNDA DLA TAPER", "WRACASZ W NASTĘPNEJ RUNDZIE", "21:44"],
  },
  {
    id: "bomb-halftime", moment: "Bomb: połowa — runda 7, zmiana stron, pistolety i 800 $",
    state: bombFreeze(7, 12_600, {
      scoreA: 4, scoreB: 2, money: BOMB.startMoney, ...kit("pistol"), owned: ["pistol"], armor: 0, players: roster({ f: 0.5 }),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0, { mates: MATES }),
    expect: ["[data-testid=bomb-hud]", "[data-testid=buy-prompt]"], text: ["ZMIANA STRON", "OBRONA", "19:58"],
  },
  {
    id: "duel-freeze", moment: "1 v 1: zamrożenie przed rundą 2 (15 s na zakupy)",
    state: {
      ...base("duel"), phase: MatchPhase.Prep, phaseEndsAt: S + 11_200, matchEndsAt: S + 13 * 60_000 + 12_000, round: 1, scoreA: 1, scoreB: 0,
      players: roster({ f: 0.1, only: ["me", "p5"] }), buyWindowLeft: 11_200, money: CS_ECONOMY.start + CS_ECONOMY.win - 500,
    },
    radar: radarFor(DUEL_MAP, 0, 0, { mates: [] }),
    expect: ["[data-testid=duel-line]", "[data-testid=buy-prompt]"], text: ["ZAMROŻENIE", "START ZA 12s"],
  },
  {
    id: "duel-live-buytail", moment: "1 v 1: runda ruszyła, sklep otwarty jeszcze 3 s",
    state: {
      ...base("duel"), phase: MatchPhase.Playing, phaseEndsAt: S + 57_600, matchEndsAt: S + 12 * 60_000 + 55_000, round: 1, scoreA: 1, scoreB: 0,
      players: roster({ f: 0.1, only: ["me", "p5"] }), buyWindowLeft: 2_600, money: 150, ...kit("smg"), owned: ["pistol", "smg"], armor: 100,
    },
    radar: radarFor(DUEL_MAP, 0, 0.1, { mates: [] }),
    expect: ["[data-testid=duel-line]", "[data-testid=buy-prompt]"], text: ["SKLEP OTWARTY JESZCZE 3s"],
  },
  {
    id: "duel-round-break", moment: "1 v 1: przerwa po rundzie, wygrałeś ją i przeżyłeś",
    before: {
      ...base("duel"), phase: MatchPhase.Playing, serverNow: S - 900, phaseEndsAt: S + 31_000, matchEndsAt: S + 12 * 60_000, round: 1, scoreA: 1, scoreB: 0,
      players: roster({ f: 0.1, only: ["me", "p5"] }), ...kit("smg", 9), owned: ["pistol", "smg"], armor: 70, health: 61, money: 150,
    },
    state: {
      ...base("duel"), phase: MatchPhase.Prep, phaseEndsAt: S + 2_100, matchEndsAt: S + 12 * 60_000, round: 2, scoreA: 2, scoreB: 0,
      roundResult: "ELIMINATED", roundWinner: 0, buyWindowLeft: 0,
      players: roster({ f: 0.15, only: ["me", "p5"], dead: ["p5"] }), ...kit("smg", 9), owned: ["pistol", "smg"], armor: 70, health: 61,
      money: 150 + ECONOMY.killReward + CS_ECONOMY.win,
      killFeed: feed(0, [[900, "me", "p5", "smg", { headshot: true }]]),
      moneyToasts: [
        { key: 3, delta: ECONOMY.killReward, reason: "kill", total: 150 + ECONOMY.killReward, at: T - 900 },
        { key: 4, delta: CS_ECONOMY.win, reason: "round", total: 150 + ECONOMY.killReward + CS_ECONOMY.win, at: T - 880 },
      ],
    },
    radar: radarFor(DUEL_MAP, 0, 0.5, { mates: [] }),
    expect: ["[data-testid=round-end].mine", "[data-testid=round-end-carry]", "[data-testid=duel-line]"], text: ["NASTĘPNA RUNDA ZA 3s"],
  },
  {
    id: "duel-match-point", moment: "1 v 1: runda 10 przy 5 : 4 — meczbol",
    state: {
      ...base("duel"), phase: MatchPhase.Playing, phaseEndsAt: S + 41_300, matchEndsAt: S + 4 * 60_000 + 30_000, round: 9, scoreA: 5, scoreB: 4,
      players: roster({ f: 0.8, only: ["me", "p5"] }), buyWindowLeft: 0, health: 100, armor: 100, ...kit("rifle", 30), owned: ["pistol", "rifle"], money: 5_450,
      lethal: "frag", lethalCount: 1,
    },
    radar: radarFor(DUEL_MAP, 0, 0.3, { mates: [] }),
    expect: ["[data-testid=duel-line]"], text: ["MECZBOL", "00:42"],
  },
  {
    id: "dead-next-round", moment: "Bomb: zginąłeś w trakcie rundy, wracasz w następnej",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 64_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 64_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 51_000), scoreA: 3, scoreB: 1, alive: false, health: 0,
      killerName: seat("p5").name, killerWeapon: "dmr", buyWindowLeft: 0, money: 350,
      players: roster({ f: 0.34, dead: ["me", "bot-3"] }),
      killFeed: feed(0, [[3_800, "p1", "bot-3", "rifle"], [900, "p5", "me", "dmr", { headshot: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { alive: false, mates: MATES }),
    expect: ["[data-testid=death]"], text: ["WRACASZ W NASTĘPNEJ RUNDZIE"],
  },
  {
    id: "dead-respawn", moment: "TDM: zginąłeś, odrodzenie za 3 s",
    state: {
      ...tdmLive(), alive: false, health: 0, respawnAt: T + 2_300, killerName: seat("p6").name, killerWeapon: "shotgun", moneyToasts: [],
      players: roster({ f: 0.58, dead: ["me", "p7", "bot-4"] }),
      killFeed: feed(0, [[4_800, "p1", "p7", "rifle"], [2_600, "me", "bot-4", "rifle", { assists: ["p2"] }], [1_100, "p6", "me", "shotgun"]]),
    },
    radar: tdmRadar({ alive: false }),
    expect: ["[data-testid=death]"], text: ["ODRODZENIE ZA 3"],
  },
  {
    id: "shop-open", moment: "Bomb, runda 4, zamrożenie: sklep otwarty (B)",
    state: bombFreeze(4, 9_800, { scoreA: 2, scoreB: 1, money: 4_150, ...kit("pistol"), owned: ["pistol"], shopOpen: true, pointerLocked: false }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
    expect: ["[data-testid=shop]"],
  },
  {
    id: "scoreboard", moment: "TDM: trzymasz Tab — tabela wyników",
    state: tdmLive(), radar: tdmRadar(), keys: ["Tab"],
    expect: ["[data-testid=scoreboard]"],
  },
  {
    id: "pause", moment: "TDM: ESC — karta pauzy",
    state: { ...tdmLive(), pointerLocked: false }, radar: tdmRadar(),
    expect: ["[data-testid=pause]", "[data-testid=btn-resume]"],
  },
  {
    id: "match-end-win", moment: `TDM: koniec meczu, wygrana ${TDM_LIMIT} : 33`,
    state: {
      ...base("tdm"), phase: MatchPhase.Ended, phaseEndsAt: S + 11_400, scoreA: TDM_LIMIT, scoreB: 33, winner: 0, reward: REWARD_WIN,
      players: roster({ f: 1, set: { "bot-3": { haircut: encodeHaircut("mohawk", 3) }, p2: { haircut: encodeHaircut("bowl", 1) } } }),
      ...kit("rifle", 11), owned: ["pistol", "rifle"], money: 5_200,
    },
    radar: tdmRadar(),
    expect: ["[data-testid=result][data-outcome=win]"], text: ["ZWYCIĘSTWO"],
  },
  {
    id: "match-end-loss", moment: "Bomb: koniec meczu, porażka 4 : 7",
    state: bombState(bombData({ round: 11, attackTeam: 1, stage: "resolved", result: "BOMB DETONATED" }), {
      phase: MatchPhase.Ended, phaseEndsAt: S + 11_400, scoreA: 4, scoreB: 7, winner: 1, reward: REWARD_LOSS,
      players: roster({ f: 0.9, set: { p1: { haircut: encodeHaircut("bleach", 2) } } }), money: 1_900,
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.5, { mates: MATES }),
    expect: ["[data-testid=result][data-outcome=loss]"], text: ["PORAŻKA"],
  },
  {
    id: "infection-prep", moment: "Ostrzyżeni: przygotowanie do rundy 2, RYSIEK dostał maszynkę",
    state: {
      // The room's clock for the whole match (TdmRoom `startMatch`), one round and 2.7 s in.
      ...base("ostrzyzeni"), phase: MatchPhase.Prep, phaseEndsAt: S + 5_300, round: 1, scoreA: 1, scoreB: 0,
      matchEndsAt: S + OSTRZYZENI.rounds * (OSTRZYZENI.prepMs + OSTRZYZENI.roundMs + OSTRZYZENI.breakMs) + 60_000
        - (OSTRZYZENI.prepMs + OSTRZYZENI.roundMs + OSTRZYZENI.breakMs) - (OSTRZYZENI.prepMs - 5_300),
      players: roster({
        f: 0.2, myTeam: 0,
        set: Object.fromEntries(SEATS.map((s) => [s.id, s.id === "bot-3" ? { team: 1 as Team, shaved: true, haircut: encodeHaircut(s.hair, 2) } : { team: 0 as Team }])),
      }),
      buyWindowLeft: Infinity, money: 1_200,
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
    expect: ["[data-testid=infection-line]"], text: ["RUNDA 2 / 5", "RUNDA ZA 6s", "07:50"],
  },
  {
    id: "gungame-live", moment: "Gun Game: szczebel 7/14, prowadzi xXPiotrekXx (9/14)",
    state: {
      ...base("gungame"), phase: MatchPhase.Playing, phaseEndsAt: S + 190_000, matchEndsAt: S + 190_000,
      players: roster({
        f: 0.5, ffa: true,
        set: { me: { score: 6, kills: 7 }, p5: { score: 8, kills: 10 }, p1: { score: 5, kills: 6 }, p6: { score: 5, kills: 5 }, p2: { score: 4, kills: 5 },
          "bot-1": { score: 3, kills: 3 }, p7: { score: 3, kills: 4 }, "bot-3": { score: 2, kills: 2 }, "bot-2": { score: 1, kills: 1 }, "bot-4": { score: 1, kills: 2 } },
      }),
      ...kit(ladderWeapon(6), 4), owned: [ladderWeapon(6)], money: 0, buyWindowLeft: 0,
      killFeed: feed(0, [[4_400, "p5", "p7", ladderWeapon(8)], [2_500, "p1", "bot-2", ladderWeapon(5), { headshot: true }], [700, "me", "p2", ladderWeapon(5)]], true),
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: [], spotted: true }),
    expect: ["[data-testid=ladder]", "[data-testid=ladder-gun]"], text: ["7/14"],
  },
  {
    id: "low-health-reloading", moment: "TDM: 18 HP, płyta rozbita przed chwilą, przeładowanie pod ostrzałem",
    state: {
      ...tdmLive(), health: 18, armor: 0, armorBrokeAt: T - 350, reloading: true, ammo: 0, damageAt: T - 150, damageAngle: 2.4, moneyToasts: [],
    },
    radar: tdmRadar(),
    expect: [".hud.low-health", ".reloading", ".damage-dir", ".armor-num.broke"],
  },
  {
    id: "scoped", moment: "TDM: celujesz przez lunetę SR-50, oddech trzymany",
    state: { ...tdmLive(), ...kit("sniper", 4), owned: ["pistol", "sniper"], scoped: true, scopeStyle: "tube", aiming: true, breath: 0.62, moneyToasts: [] },
    radar: tdmRadar(),
    expect: ["[data-testid=scope]"],
  },
  {
    id: "loading", view: "loading", moment: "Ładowanie meczu: wczytywanie mapy",
    state: { mode: "bomb", loadStage: "map" },
    expect: ["[data-testid=loading]"],
  },
  {
    id: "loading-ready", view: "loading-ready", moment: "Ładowanie skończone: WEJDŹ DO MECZU (HUD uśpiony pod spodem)",
    state: { ...bombFreeze(1, BOMB.buyMs - 200, { scoreA: 0, scoreB: 0, money: BOMB.startMoney, ...kit("pistol"), owned: ["pistol"], players: roster({ f: 0 }) }), pointerLocked: false },
    expect: ["[data-testid=enter-game]", ".hud.dormant"],
  },
];

// ------------------------------------------------------------------------------------ page

declare global {
  interface Window {
    hudStates?: { ready: boolean; scenario: string; scenarios: string[]; moment?: string; error?: string };
  }
}

const noop = () => {};
const shopApi = { buy: noop, sell: noop, close: noop, selectClass: noop } as never;
const settings = defaultSettings();
const params = new URLSearchParams(location.search);
const DEBUG = params.get("debug") === "1";

/**
 * Stands in for the game canvas: a night street (sky, facades, pavement) with a warm lamp and a
 * cold sign in it, because HUD text is read over a lit 3D scene and never over flat black.
 */
const SCENE: React.CSSProperties = {
  position: "absolute", inset: 0, zIndex: 0,
  background: [
    "radial-gradient(ellipse 16% 28% at 24% 36%, rgba(255,190,110,.30), transparent 70%)",
    "radial-gradient(ellipse 12% 20% at 74% 40%, rgba(120,170,255,.20), transparent 70%)",
    "linear-gradient(180deg, #0b0f17 0%, #161c28 30%, #252a33 49%, #3a3a3d 50%, #2a2a2e 72%, #151517 100%)",
  ].join(","),
};

function Gallery({ sc }: { sc: Scenario }) {
  const view = sc.view ?? "hud";
  const radar = () => sc.radar ?? null;
  return (
    // `.app` is the game's own root (App.tsx), and the HUD's absolute layout is measured against it.
    <div className="app">
      {!DEBUG && <style>{"[data-testid=debug]{display:none!important}"}</style>}
      {view === "hud" && <div className="hs-scene" style={SCENE} aria-hidden="true" />}
      {view !== "loading" && (
        <Hud
          dormant={view === "loading-ready"}
          settings={settings} onSettings={noop} onLeave={noop}
          onResume={async () => true} onPause={noop} onFullscreen={async () => false}
          onChooseTeam={noop} onVotePlan={noop}
          shop={shopApi} chat={{ send: noop, close: noop }} radar={radar}
        />
      )}
      {view !== "hud" && <Loading ready={view === "loading-ready"} entering={false} onEnter={noop} onCancel={noop} />}
    </div>
  );
}

/** Unknown or missing `?s=`: a plain index of the moments, so the page is usable by hand too. */
function Index({ asked }: { asked: string }) {
  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif", color: "#ddd", overflow: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 20 }}>HUD state gallery</h1>
      {asked && <p style={{ color: "#f88" }}>Unknown scenario “{asked}”.</p>}
      <ol>{SCENARIOS.map((s) => <li key={s.id}><a style={{ color: "#9cf" }} href={`?s=${s.id}`}>{s.id}</a> — {s.moment}</li>)}</ol>
    </div>
  );
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => { for (let i = 0; i < n; i++) await frame(); };
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
/** A whole state, not a patch: nothing from the previous state may leak into the next. */
const whole = (s: Partial<HudState>): HudState => ({ ...initialHud, ...s });

async function main(): Promise<void> {
  const ids = SCENARIOS.map((s) => s.id);
  const asked = params.get("s") ?? "";
  const sc = SCENARIOS.find((s) => s.id === asked);
  const root = createRoot(document.getElementById("root")!);
  if (!sc) {
    root.render(<Index asked={asked} />);
    window.hudStates = { ready: false, scenario: asked, scenarios: ids, error: asked ? `unknown scenario "${asked}"` : "no ?s= given" };
    return;
  }
  // A returning player: every first-run hint already seen (see the header).
  saveSeen(new Set(HINTS.map((h) => h.id)));
  // The moment before, one second earlier on the local clock, when the scenario is an edge.
  clock = sc.before ? T - 1_000 : T;
  hud.set(whole(sc.before ?? sc.state));
  root.render(<React.StrictMode><Gallery sc={sc} /></React.StrictMode>);
  await frames(4);
  if (sc.before) {
    clock = T;
    hud.set(whole(sc.state));
    await frames(4);
  }
  for (const code of sc.keys ?? []) window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true }));
  // Longer than the HUD's 300 ms pause arming (Hud.tsx), so a scenario that would wrongly show the
  // pause card shows it before it is checked, not after it is photographed.
  await sleep(450);
  await frames(2);

  const missing = sc.expect.filter((sel) => !document.querySelector(sel));
  const shown = document.body.innerText.toLocaleUpperCase("pl");
  const missingText = (sc.text ?? []).filter((t) => !shown.includes(t.toLocaleUpperCase("pl")));
  const stray = sc.id === "pause" || sc.view ? [] : ["[data-testid=pause]"].filter((sel) => document.querySelector(sel));
  const problems = [
    ...missing.map((s) => `missing ${s}`), ...missingText.map((t) => `missing text "${t}"`), ...stray.map((s) => `unexpected ${s}`),
  ];

  // Every animation stopped at the same offset: a pulse, a toast rising, a reload bar filling.
  for (const a of document.getAnimations()) {
    try { a.pause(); a.currentTime = FREEZE_AT_MS; } catch { /* an animation that cannot seek stays paused */ }
  }
  await frames(2);
  window.hudStates = problems.length
    ? { ready: false, scenario: sc.id, scenarios: ids, moment: sc.moment, error: problems.join("; ") }
    : { ready: true, scenario: sc.id, scenarios: ids, moment: sc.moment };
}

void main().catch((e: unknown) => {
  window.hudStates = { ready: false, scenario: params.get("s") ?? "", scenarios: SCENARIOS.map((s) => s.id), error: String(e) };
});
