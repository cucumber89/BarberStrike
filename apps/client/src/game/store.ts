import { useSyncExternalStore } from "react";
import { MatchPhase, type GameMode, type GrenadeId, type KillEvent, type MoneyEvent, type PerkTimes, type PlanEvent, type ShopResult, type Team, type TeamResult, type WeaponId } from "@frankibarber/shared";
import { emptyProfile, type MatchReward, type Profile } from "./progression/profile";
import type { ScopeStyle } from "./combat/weaponFeel";

/** Drop 4: a Domination flag for the HUD. */
export interface HudFlag { id: string; name: string; owner: number; capTeam: number; cap: number; contested: boolean }

export interface ScoreRow {
  boysClass?: number;
  id: string;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  score: number;
  ping: number;
  alive: boolean;
  connected: boolean;
  /** Drop 5: scoreboard v2. */
  assists: number;
  money: number;
  bot: boolean;
  /** Drop D: on the shaved side (Ostrzyżeni) — the HUD counts the unshaved from these rows. */
  shaved: boolean;
  /** Drop E: the haircut field as replicated. The scoreboard's shave column is parsed from it. */
  haircut: string;
  /**
   * Drop U: the player's health, for the spectate bar (`schema.ts:28`). Optional: P0 adds the type
   * only, and a row without it (no producer yet, P1 writes it at `Game.ts:635`) reads as unknown.
   */
  health?: number;
}

/** Drop 5: a chat line as shown (server time `at`, local `seen` for the fade). */
export interface ChatLine { key: number; id: string; name: string; team: Team; text: string; all: boolean; seen: number }
/** Drop 5: a team mark: world position, kind, who, when (performance.now), optional tracked enemy. */
export interface HudMark { key: number; id: string; name: string; team: Team; x: number; y: number; z: number; kind: "go" | "spot"; target?: string; at: number; until: number }

export interface KillFeedEntry extends KillEvent { at: number; key: number }

/**
 * Drop U: who killed me, as the death card reads it (§5.2 rows 33–36). `hp` / `armor` are the
 * killer's at the moment of the kill; `dealt` / `taken` sum this life's hits both ways, with their
 * hit counts; `at` is `performance.now()` of the kill.
 */
export interface HudKiller {
  id: string;
  name: string;
  team: Team;
  weapon: KillEvent["weapon"];
  headshot: boolean;
  /** Names credited with an assist (`KillEvent.assists`). */
  assists: string[];
  hp: number;
  armor: number;
  dealt: number;
  dealtHits: number;
  taken: number;
  takenHits: number;
  at: number;
}

/** Drop U: the player the camera follows while I am dead (the spectate bar). */
export interface HudSpectating { id: string; name: string; health: number }

/** Drop U: the round's MVP in bomb (the round banner): the defuser, the planter, or the most kills. */
export interface HudRoundMvp { id: string; name: string; kills: number; why: "plant" | "defuse" | "kills" }

/** Drop U: one OBSERVED round (the scoreboard's history strip): its number, who took it and why. */
export interface HudRoundRecord { round: number; winner: Team | -1; reason: string }

export interface HudState {
  smokeOpacity: number;
  bomb: import("@frankibarber/shared").BombData | null;
  /** Rounds finished in a round mode (Bomb Plant, Ostrzyżeni). 0 outside them. */
  round: number;
  /**
   * How the last round ended, as the server's own short reason string ("ELIMINATED", "TIME · MORE
   * HEALTH", …). It rides in `bomb.result`, which only Bomb used to mirror; the 1 v 1 runs on the
   * same round machine and its players were never told why a round had ended.
   */
  roundResult: string;
  /** Drop T: the whole tournament bracket as the server writes it; "" outside a tournament. */
  bracket: string;
  connected: boolean;
  myId: string;
  myTeam: Team;
  health: number;
  alive: boolean;
  respawnAt: number;
  killerName: string;
  /** Weapon or grenade id that killed us (see killerName() for display). */
  killerWeapon: string | null;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  reloading: boolean;
  phase: MatchPhase;
  phaseEndsAt: number;
  /**
   * Progression (2.0). `reward` is what the last finished match paid, shown on the result screen
   * and cleared when the next one starts; `profile` is the running total the menu reads.
   */
  reward: MatchReward | null;
  profile: Profile;
  /** Server time the MATCH ends; `phaseEndsAt` is the current wave or preparation window. */
  matchEndsAt: number;
  scoreA: number;
  scoreB: number;
  winner: Team | -1;
  /**
   * Who took the LAST ROUND (Bomb, 1 v 1, Ostrzyżeni), from the Prep MatchEvent. Kept apart from
   * `winner`, which the 10 Hz state sync overwrites with the match's (still -1) winner a moment
   * after the event, so the round card had nothing to name.
   */
  roundWinner: Team | -1;
  players: ScoreRow[];
  /** Last answer to a team-change request (2.4): what the server decided, and when it was said. */
  teamResult: (TeamResult & { at: number }) | null;
  /** Living arena (2.4): the round's plan vote / result, and the plan in force. */
  plan: (PlanEvent & { at: number }) | null;
  planId: number;
  killFeed: KillFeedEntry[];
  /** Timestamp (performance.now) of the last confirmed hit, for the hit marker. */
  hitAt: number;
  hitKill: boolean;
  hitHead: boolean;
  /** Last damage taken: direction (screen-space angle in radians) and time. */
  damageAt: number;
  damageAngle: number;
  ping: number;
  fps: number;
  pointerLocked: boolean;
  serverNow: number;
  spawnProtectedUntil: number;
  /** Startup progress: "connecting" | "engine" | "map" | "players" | "finishing" | "ready". */
  loadStage: string;
  /** Current effective crosshair spread (radians) for a dynamic crosshair. */
  crosshairSpread: number;
  /** Aiming down sights: the HUD crosshair hides, the sights take over. */
  aiming: boolean;
  /** Dev telemetry published by the perf module (empty in production). */
  telemetry: Record<string, string | number>;
  /** True while the connection dropped and the client is trying to resume the session. */
  reconnecting: boolean;
  // ---- drop 2: wallet, shop, grenades
  money: number;
  /** Carried weapons in slot order (pistol + at most one primary). */
  owned: WeaponId[];
  lethal: GrenadeId | "";
  lethalCount: number;
  tactical: GrenadeId | "";
  tacticalCount: number;
  /** Ms of buy window left (Infinity at a station / in warm-up, 0 when closed). */
  buyWindowLeft: number;
  nearStation: boolean;
  shopOpen: boolean;
  /** Last shop answer, with the time it arrived (for the feedback line). */
  shopResult: (ShopResult & { at: number }) | null;
  /** Recent wallet changes for the floating "+300" toasts. */
  moneyToasts: (MoneyEvent & { at: number; key: number })[];
  /** Grenade in the hand and its cook progress (0..1), for the HUD indicator. */
  cookingKind: GrenadeId | "";
  cooking: number;
  /** Flash blindness: strength 0..1 and the time (performance.now) it ends. */
  flashStrength: number;
  flashUntil: number;
  flashAt: number;
  // ---- drop 3: plate, perks, scope
  armor: number;
  /** Perk end times (server clock ms; compare with `serverNow`). */
  perks: PerkTimes;
  /** Time (performance.now) the plate broke, for the HUD flash. */
  armorBrokeAt: number;
  /** Looking through a scope (scoped weapon in ADS): the HUD draws the reticle, the gun is hidden. */
  scoped: boolean;
  /** Which glass: the SR-50's full tube or the M-1's light ring (matrix D-B2). */
  scopeStyle: ScopeStyle | null;
  /** Breath hold left (0..1) while scoped; 0 when not holding. */
  breath: number;
  /** Last hit marker was on a plate. */
  hitArmor: boolean;
  // ---- drop 4: modes, flags, movement
  boysClass: number; nextClass: number;
  mode: GameMode;
  flags: HudFlag[];
  /** Index of the flag we are standing in, -1 otherwise. */
  inFlag: number;
  /** FFA winner (session id / name) once the match ended. */
  winnerId: string;
  winnerName: string;
  /**
   * Last flag change: text + team + time, for the centre notice. Drop U adds the structured `flag`
   * id („A”) and its `name`, optional until P1's producer (`Game.ts:396`) writes them.
   */
  flagNotice: { text: string; team: Team; at: number; flag?: string; name?: string } | null;
  /** Tactical sprint budget 0..1 and whether it runs now. */
  tac: number;
  tacOn: boolean;
  // ---- drop 5: chat, marks
  chat: ChatLine[];
  /** Chat box open for all / team, or closed. */
  chatOpen: "all" | "team" | null;
  marks: HudMark[];
  // ---- drop U (P0 declares these with their defaults; P1 produces them)
  /** The map being played (`MapDef.id`); "" until the room is joined. */
  mapId: string;
  /** `performance.now()` of my last death; 0 while I have not died in this life. */
  diedAt: number;
  /** Who killed me last, or null (alive, never killed, or a self-kill). */
  killer: HudKiller | null;
  /** Whom the camera follows while I am dead; null when nobody (or alive). */
  spectating: HudSpectating | null;
  /** Joined a round mode mid-round: dead with no kill seen since the last spawn. */
  lateJoin: boolean;
  /** The bomb site I am standing on, if any. */
  siteHere: "" | "A" | "B";
  /** A defender close enough to the planted bomb to defuse it. */
  nearBomb: boolean;
  /** The last round's MVP (bomb only); null when the round start was not observed. */
  roundMvp: HudRoundMvp | null;
  /** The rounds this client saw end, oldest first. Rounds it did not observe are absent. */
  roundHistory: HudRoundRecord[];
  /** `performance.now()` of the last weapon switch, for the weapon-name moment; 0 = none. */
  lastSwitchAt: number;
}

export const initialHud: HudState = {
  connected: false, myId: "", myTeam: 0,
  health: 100, alive: false, respawnAt: 0, killerName: "", killerWeapon: null,
  weapon: "pistol", ammo: 0, reserve: 0, reloading: false,
  phase: MatchPhase.Waiting, phaseEndsAt: 0, matchEndsAt: 0, scoreA: 0, scoreB: 0, winner: -1, roundWinner: -1,
  reward: null, profile: emptyProfile(),
  players: [], killFeed: [], teamResult: null, plan: null, planId: 0,
  hitAt: 0, hitKill: false, hitHead: false, damageAt: 0, damageAngle: 0,
  ping: 0, fps: 0, pointerLocked: false, serverNow: 0, spawnProtectedUntil: 0,
  loadStage: "connecting", crosshairSpread: 0, aiming: false, telemetry: {}, reconnecting: false,
  money: 0, owned: ["pistol"], lethal: "", lethalCount: 0, tactical: "", tacticalCount: 0,
  buyWindowLeft: 0, nearStation: false, shopOpen: false, shopResult: null, moneyToasts: [],
  cookingKind: "", cooking: 0, flashStrength: 0, flashUntil: 0, flashAt: 0,
  armor: 0, perks: { flask: 0, roids: 0, energy: 0, fade: 0 }, armorBrokeAt: 0, scoped: false, scopeStyle: null, breath: 0, hitArmor: false,
  boysClass: 1, nextClass: 1, mode: "tdm", smokeOpacity: 0, bomb: null, round: 0, roundResult: "", bracket: "", flags: [], inFlag: -1, winnerId: "", winnerName: "", flagNotice: null, tac: 1, tacOn: false,
  chat: [], chatOpen: null, marks: [],
  mapId: "", diedAt: 0, killer: null, spectating: null, lateJoin: false, siteHere: "", nearBomb: false,
  roundMvp: null, roundHistory: [], lastSwitchAt: 0,
};

type Listener = () => void;

/**
 * Tiny external store bridging the game loop and React. The game writes with `set`
 * (cheap, no React involvement until subscribers are notified); React reads with `useHud`.
 * Writes are coalesced per animation frame so the HUD never re-renders more than once per frame.
 */
class HudStore {
  private state: HudState = initialHud;
  private listeners = new Set<Listener>();
  private scheduled = false;

  get = (): HudState => this.state;

  set(patch: Partial<HudState>): void {
    let changed = false;
    for (const k in patch) {
      const key = k as keyof HudState;
      if (this.state[key] !== patch[key]) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => {
        this.scheduled = false;
        for (const l of this.listeners) l();
      });
    }
  }

  reset(): void { this.set({ ...initialHud, killFeed: [], players: [], teamResult: null, plan: null, planId: 0, moneyToasts: [], chat: [], marks: [], roundHistory: [] }); }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const hud = new HudStore();


export function useHud(): HudState {
  return useSyncExternalStore(hud.subscribe, hud.get, hud.get);
}

export function useHudSlice<T>(selector: (s: HudState) => T): T {
  return useSyncExternalStore(hud.subscribe, () => selector(hud.get()), () => selector(hud.get()));
}
