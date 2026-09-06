import type { WeaponId } from "./weapons";
import type { GrenadeId } from "./grenades";

export type Team = 0 | 1;

/** Drop 4: game modes. TDM and Domination are team modes; FFA puts everyone on team 0 with no friendly checks. */
export type GameMode = "tdm" | "ffa" | "dom" | "bomb";
export const GAME_MODES: readonly GameMode[] = ["tdm", "ffa", "dom", "bomb"] as const;
export const isGameMode = (v: unknown): v is GameMode => v === "tdm" || v === "ffa" || v === "dom" || v === "bomb";

export enum MatchPhase {
  Waiting = "waiting",
  Countdown = "countdown",
  /**
   * A live wave: the fighting happens here. It lasts MATCH.waveMs, not the whole match — the match
   * clock is `MatchState.matchEndsAt`, which is why that field had to be split out of `phaseEndsAt`.
   */
  Playing = "playing",
  /**
   * Between waves (1.1 drop 7). Everyone who died comes back at the START of this phase, and NOBODY
   * can move, shoot or throw until it ends — you look around, buy, reload, and both sides are
   * released from the line together. `phaseEndsAt` is when that happens.
   */
  Prep = "prep",
  Ended = "ended",
}

/** Bit flags packed into PlayerInput.buttons. */
export const Btn = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Crouch: 1 << 6,
  Fire: 1 << 7,
  Aim: 1 << 8,
  // ---- drop 4: lean (Q / E) and tactical sprint (double-tap Shift). The server masks inputs to BTN_MASK.
  LeanL: 1 << 9,
  LeanR: 1 << 10,
  Tac: 1 << 11,
} as const;

/** Every valid button bit; the server ANDs incoming inputs with it. */
export const BTN_MASK = 0xfff;

/**
 * One frame of player intent. Sent client→server as a compact tuple (see InputTuple).
 * `dt` is milliseconds and is clamped server-side.
 */
export interface PlayerInput {
  seq: number;
  dt: number;
  buttons: number;
  yaw: number;
  pitch: number;
}

/** Wire form of PlayerInput: [seq, dtMs, buttons, yaw, pitch]. */
export type InputTuple = [number, number, number, number, number];

export const packInput = (i: PlayerInput): InputTuple => [i.seq, i.dt, i.buttons, i.yaw, i.pitch];
export const unpackInput = (t: InputTuple): PlayerInput => ({ seq: t[0], dt: t[1], buttons: t[2], yaw: t[3], pitch: t[4] });

/** Minimal kinematic state the movement simulation reads and writes. */
export interface BodyState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  crouching: boolean;
  /** Ms remaining before the body may jump again. */
  jumpCooldown: number;
  /** Tactical sprint budget left (ms); drains while tac-sprinting, refills otherwise (drop 4). */
  tac: number;
}

/** Client→server message names. */
export const C2S = {
  Input: "i",
  Fire: "f",
  Equip: "e",
  Reload: "r",
  Ping: "p",
  Ready: "ready",
  Rematch: "rematch",
  /** Buy / sell in the shop: { item } (drop 2). */
  Buy: "buy",
  Sell: "sell",
  /** Throw a grenade: ThrowMessage (drop 2). */
  Throw: "throw",
  /** Text chat: ChatMessage (drop 5). */
  Chat: "chat",
  /** Ping / mark a spot or an enemy for the team: MarkMessage (drop 5). */
  Mark: "mark",
} as const;

/** Drop 5: chat limits (the server enforces them, the client mirrors them in the box). */
export const CHAT = { maxLen: 120, minIntervalMs: 700, history: 8, showMs: 9000 } as const;
/** Drop 5: mark limits. A "go" mark lives ttlMs; a "spot" (enemy) mark spotTtlMs. */
export const MARK = { minIntervalMs: 1200, ttlMs: 8000, spotTtlMs: 4500, maxRange: 60 } as const;

export interface ChatMessage { text: string; team: boolean }
export interface ChatEvent { id: string; name: string; team: Team; text: string; all: boolean; at: number }
export type MarkKind = "go" | "spot";
export interface MarkMessage { x: number; y: number; z: number; kind: MarkKind; target?: string }
export interface MarkEvent { id: string; name: string; team: Team; x: number; y: number; z: number; kind: MarkKind; target?: string; at: number }

/** Server→client message names. */
export const S2C = {
  Welcome: "welcome",
  Pong: "pong",
  Shot: "shot",
  Hit: "hit",
  Damaged: "dmg",
  Kill: "kill",
  Spawn: "spawn",
  Reject: "reject",
  MatchEvent: "match",
  /** A grenade was thrown (everyone simulates its flight locally): ThrowEvent. */
  Throw: "thr",
  /** A grenade detonated / stuck / started an effect: BoomEvent. */
  Boom: "boom",
  /** You are flashed: FlashedEvent (only to affected clients). */
  Flashed: "flash",
  /** Wallet change with a reason (kill, assist, buy…): MoneyEvent. */
  Money: "money",
  /** Result of a buy/sell request: ShopResult. */
  Shop: "shop",
  /** Domination: a flag changed hands: FlagEvent (drop 4). */
  Flag: "flag",
  /** Text chat line: ChatEvent (drop 5). */
  Chat: "chat",
  /** A team mark: MarkEvent (drop 5). */
  Mark: "mark",
} as const;

/** Domination (drop 4): flag `flag` (index into MapDef.flags) is now owned by `team`; `by` names the capturers. */
export interface FlagEvent {
  flag: number;
  team: Team;
  by: string[];
}

export interface FireMessage {
  /** Input sequence the shot belongs to (for ordering). */
  seq: number;
  weapon: WeaponId;
  /** Muzzle origin (eye position) in world space. */
  o: [number, number, number];
  /** Normalised aim direction. */
  d: [number, number, number];
  /** Server time (ms) the client was rendering remote players at, for lag compensation. */
  t: number;
}

export interface ShotEvent {
  id: string;
  weapon: WeaponId;
  o: [number, number, number];
  /** End points of each pellet/trace, world space. */
  e: [number, number, number][];
  /** 0 = miss/world, 1 = player body, 2 = player head (per pellet). */
  k: number[];
}

export interface HitEvent {
  victim: string;
  damage: number;
  kill: boolean;
  headshot: boolean;
  /** Part of the hit went into the victim's plate (drop 3): the hit marker reads "armour". */
  armor?: boolean;
}

export interface DamagedEvent {
  from: string;
  amount: number;
  /** Direction from victim to attacker (xz, normalised) for the damage indicator. */
  dx: number;
  dz: number;
  health: number;
  /** Plate points left after the hit and whether this hit broke it (drop 3). */
  armor?: number;
  broke?: boolean;
}

export interface KillEvent {
  killer: string;
  killerName: string;
  killerTeam: Team;
  victim: string;
  victimName: string;
  victimTeam: Team;
  /** Weapon or grenade that killed (see `killerName()` in economy.ts for display). */
  weapon: WeaponId | GrenadeId;
  headshot: boolean;
}

export interface ThrowMessage {
  kind: GrenadeId;
  /** Release point (hand, near the eye) and normalised direction. */
  o: [number, number, number];
  d: [number, number, number];
  /** Ms the frag was cooked before release (0 for others). */
  cookMs: number;
}

export interface ThrowEvent {
  id: number;
  kind: GrenadeId;
  owner: string;
  o: [number, number, number];
  /** Initial velocity (m/s) — includes the throw speed and the thrower's momentum. */
  v: [number, number, number];
  fuseMs: number;
  /** Server time (ms) of the throw, so late clients can catch the flight up. */
  t: number;
}

export interface BoomEvent {
  id: number;
  kind: GrenadeId;
  x: number; y: number; z: number;
  /** Surface normal for stuck knives / resting orientation. */
  nx: number; ny: number; nz: number;
  /** Ms the after-effect lasts (smoke, fire); 0 for instant. */
  effectMs: number;
}

export interface FlashedEvent {
  strength: number;
  ms: number;
}

export interface MoneyEvent {
  delta: number;
  reason: "kill" | "headshot" | "assist" | "buy" | "sell" | "reset" | "capture";
  total: number;
}

export interface ShopResult {
  ok: boolean;
  item: string;
  reason?: string;
}

export interface SpawnEvent {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface WelcomeMessage {
  id: string;
  serverTime: number;
  tickRate: number;
}

export interface MatchEventMessage {
  phase: MatchPhase;
  winner: Team | -1;
  winnerId?: string;
  winnerName?: string;
  /**
   * Server time this phase ends. Carried on the message because the replicated `phaseEndsAt` is
   * only polled at 10 Hz: a client that had already seen `phase: prep` but still held the previous
   * WAVE's clock would judge itself released — early, and by up to a whole poll interval.
   */
  endsAt?: number;
}
