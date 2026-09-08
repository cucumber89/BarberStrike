import { useSyncExternalStore } from "react";
import { MatchPhase, type GameMode, type GrenadeId, type KillEvent, type MoneyEvent, type PerkTimes, type ShopResult, type Team, type WeaponId } from "@frankibarber/shared";
import { emptyProfile, type MatchReward, type Profile } from "./progression/profile";

/** Drop 4: a Domination flag for the HUD. */
export interface HudFlag { id: string; name: string; owner: number; capTeam: number; cap: number; contested: boolean }

export interface ScoreRow {
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
}

/** Drop 5: a chat line as shown (server time `at`, local `seen` for the fade). */
export interface ChatLine { key: number; id: string; name: string; team: Team; text: string; all: boolean; seen: number }
/** Drop 5: a team mark: world position, kind, who, when (performance.now), optional tracked enemy. */
export interface HudMark { key: number; id: string; name: string; team: Team; x: number; y: number; z: number; kind: "go" | "spot"; target?: string; at: number; until: number }

export interface KillFeedEntry extends KillEvent { at: number; key: number }

export interface HudState {
  smokeOpacity: number;
  bomb: import("@frankibarber/shared").BombData | null;
  /** Rounds finished in a round mode (Bomb Plant, Ostrzyżeni). 0 outside them. */
  round: number;
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
  players: ScoreRow[];
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
  /** Startup progress: "connecting" | "engine" | "map" | "players" | "ready". */
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
  /** Breath hold left (0..1) while scoped; 0 when not holding. */
  breath: number;
  /** Last hit marker was on a plate. */
  hitArmor: boolean;
  /** Bomb Plant (2.2): defuse kit carried. */
  kit: boolean;
  // ---- drop 4: modes, flags, movement
  mode: GameMode;
  /** 2.1: the room's name, for the pause screen's invite link ("" for an unnamed quick-play room). */
  roomName: string;
  flags: HudFlag[];
  /** Index of the flag we are standing in, -1 otherwise. */
  inFlag: number;
  /** FFA winner (session id / name) once the match ended. */
  winnerId: string;
  winnerName: string;
  /** Last flag change: text + team + time, for the centre notice. */
  flagNotice: { text: string; team: Team; at: number } | null;
  /** Tactical sprint budget 0..1 and whether it runs now. */
  tac: number;
  tacOn: boolean;
  // ---- drop 5: chat, marks
  chat: ChatLine[];
  /** Chat box open for all / team, or closed. */
  chatOpen: "all" | "team" | null;
  marks: HudMark[];
}

export const initialHud: HudState = {
  connected: false, myId: "", myTeam: 0,
  health: 100, alive: false, respawnAt: 0, killerName: "", killerWeapon: null,
  weapon: "pistol", ammo: 0, reserve: 0, reloading: false,
  phase: MatchPhase.Waiting, phaseEndsAt: 0, matchEndsAt: 0, scoreA: 0, scoreB: 0, winner: -1,
  reward: null, profile: emptyProfile(),
  players: [], killFeed: [],
  hitAt: 0, hitKill: false, hitHead: false, damageAt: 0, damageAngle: 0,
  ping: 0, fps: 0, pointerLocked: false, serverNow: 0, spawnProtectedUntil: 0,
  loadStage: "connecting", crosshairSpread: 0, aiming: false, telemetry: {}, reconnecting: false,
  money: 0, owned: ["pistol"], lethal: "", lethalCount: 0, tactical: "", tacticalCount: 0,
  buyWindowLeft: 0, nearStation: false, shopOpen: false, shopResult: null, moneyToasts: [],
  cookingKind: "", cooking: 0, flashStrength: 0, flashUntil: 0, flashAt: 0,
  armor: 0, perks: { flask: 0, roids: 0, energy: 0, fade: 0 }, armorBrokeAt: 0, scoped: false, breath: 0, hitArmor: false, kit: false,
  mode: "tdm", roomName: "", smokeOpacity: 0, bomb: null, round: 0, flags: [], inFlag: -1, winnerId: "", winnerName: "", flagNotice: null, tac: 1, tacOn: false,
  chat: [], chatOpen: null, marks: [],
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

  reset(): void { this.set({ ...initialHud, killFeed: [], players: [], moneyToasts: [], chat: [], marks: [] }); }

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
