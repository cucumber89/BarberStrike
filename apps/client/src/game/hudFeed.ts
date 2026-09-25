import {
  BOMB, DUEL, MatchPhase, TEAM_NAMES, respawnDelayMs,
  type BombSite, type BuyContext, type GameMode, type KillEvent, type Team,
} from "@frankibarber/shared";
import type { HudKiller, HudRoundMvp, HudRoundRecord } from "./store";

/**
 * Drop U (P1): THE HUD'S LIVE STATE — the store fields drop U added, produced from what the room
 * replicates and what this client itself observed (docs/UI_U_SPEC.md §7 P1 (a)–(g)).
 *
 * Every rule here is a pure function or a small observer fed by `Game`, so each one is a named
 * test in `hudFeed.test.ts` rather than a line inside the frame loop. Nothing here invents a fact:
 * a round this client did not see start has no MVP, a round it did not see end is not in the
 * history (Principle 13).
 */

// ------------------------------------------------------------------------------------ (a) buying

/** Turniej is a duel everywhere (`TdmRoom.ts:265`). */
const duelLike = (mode: GameMode): boolean => mode === "duel" || mode === "turniej";

export interface RoundBuyInput {
  mode: GameMode;
  phase: MatchPhase;
  /** Server clock now. */
  now: number;
  phaseEndsAt: number;
  /** `bomb.result`: "" in a freeze, the reason in a break (P-SRV clears it at every duel freeze). */
  roundResult: string;
  bomb: { stage: string; roundEndsAt: number } | null;
}

/** The round modes' half of `BuyContext`: `bombBuying` and the deadline the HUD counts down. */
export interface RoundBuy { bombBuying: boolean | undefined; windowEndsAt: number | undefined }

/**
 * The buy window of a round mode, as the server decides it (`TdmRoom.buyContext`), from the state
 * the client has. It is open in the freeze and for `buyTailMs` after the release — CS's
 * `mp_buytime` running past `mp_freezetime` — and shut in a break. The release is not replicated,
 * but the round clock is: it started at the release with the round's full length on it, so
 * `release = roundEnd − roundMs` (duel and turniej: `phaseEndsAt`; bomb: `bomb.roundEndsAt`).
 * Every other mode keeps the shared rules (`bombBuying` undefined).
 */
export function roundBuy(i: RoundBuyInput): RoundBuy {
  const duel = duelLike(i.mode);
  if (!duel && i.mode !== "bomb") return { bombBuying: undefined, windowEndsAt: undefined };
  if (i.phase === MatchPhase.Prep) {
    const freeze = duel ? i.roundResult === "" : i.bomb?.stage === "buy";
    return { bombBuying: freeze, windowEndsAt: i.phaseEndsAt };
  }
  if (i.phase === MatchPhase.Playing) {
    const release = duel ? i.phaseEndsAt - DUEL.roundMs : (i.bomb?.roundEndsAt ?? 0) - BOMB.roundMs;
    const shuts = release + (duel ? DUEL.buyTailMs : BOMB.buyTailMs);
    return { bombBuying: i.now < shuts, windowEndsAt: shuts };
  }
  return { bombBuying: false, windowEndsAt: undefined };
}

/**
 * The whole `BuyContext` the client asks `buyWindowLeft` with — the HUD's countdown and the B key
 * both — built the way `TdmRoom.buyContext` builds the server's (`TdmRoom.ts:2230-2250`), so the
 * shop the client offers and the one the server honours open and shut on the same rule.
 */
export function buyContextFor(
  s: { mode: GameMode; phase: MatchPhase; phaseEndsAt: number; bomb: { stage: string; roundEndsAt: number; result: string } | null },
  me: { spawnedAt: number; alive: boolean; shaved: boolean },
  now: number, nearStation: boolean,
): BuyContext {
  const r = roundBuy({ mode: s.mode, phase: s.phase, now, phaseEndsAt: s.phaseEndsAt, roundResult: s.bomb?.result ?? "", bomb: s.bomb });
  return {
    mode: s.mode, shaved: me.shaved, now, spawnedAt: me.spawnedAt, phase: s.phase, alive: me.alive, nearStation,
    bombBuying: r.bombBuying, windowEndsAt: r.windowEndsAt,
    releaseAt: s.phase === MatchPhase.Prep ? s.phaseEndsAt : 0,
  };
}

// ------------------------------------------------------------------------------------ (b) respawn

const ROUND_MODES: ReadonlySet<GameMode> = new Set<GameMode>(["bomb", "duel", "turniej", "ostrzyzeni"]);

/**
 * When I come back, on the local clock: `diedAt + respawnDelayMs(mode, {shaved, fade})` — the one
 * rule the server's timer uses (`TdmRoom.ts:295`), so the card reaches 0 on the frame the server
 * revives — or 0, "next round", where the server does not revive on a timer: the bomb and duel
 * rounds, and an unshaved survivor in ostrzyżeni. Warm-up revives everybody on the timer.
 * `shaved` is the victim's side AFTER the kill (a shave converts first, `TdmRoom.kill`).
 */
export function respawnAtFor(mode: GameMode, phase: MatchPhase, diedAt: number, o: { shaved: boolean; fade: boolean }): number {
  const warmUp = phase === MatchPhase.Waiting || phase === MatchPhase.Countdown;
  const returns = warmUp || (phase === MatchPhase.Playing && (!ROUND_MODES.has(mode) || (mode === "ostrzyzeni" && o.shaved)));
  return returns ? diedAt + respawnDelayMs(mode, o) : 0;
}

// ------------------------------------------------------------------------------------ (c) killer

/** One opponent's damage both ways over this life: what I dealt them and what they dealt me. */
interface Ledger { dealt: number; dealtHits: number; taken: number; takenHits: number }

/**
 * This life's damage, per opponent, summed from `S2C.Hit` (mine on them) and `S2C.Damaged` (theirs
 * on me). The death card reads the killer's line — „ZADANE 64 (3) · OTRZYMANE 100 (4)” — as CS2's
 * does: what I did to the one who killed me, and what they did to me.
 */
export class LifeDamage {
  private by = new Map<string, Ledger>();
  private of(id: string): Ledger {
    let l = this.by.get(id);
    if (!l) { l = { dealt: 0, dealtHits: 0, taken: 0, takenHits: 0 }; this.by.set(id, l); }
    return l;
  }
  hit(victim: string, damage: number): void { const l = this.of(victim); l.dealt += damage; l.dealtHits++; }
  damaged(from: string, amount: number): void { const l = this.of(from); l.taken += amount; l.takenHits++; }
  line(id: string): Ledger { return { ...(this.by.get(id) ?? { dealt: 0, dealtHits: 0, taken: 0, takenHits: 0 }) }; }
  /** A new life starts with a clean sheet. */
  reset(): void { this.by.clear(); }
}

/**
 * Who killed me, as the card reads it, or null for a self-kill (killer = me, or nobody). `hp` and
 * `armor` are the killer's replicated health and plate at the kill (-1 when they are not in the
 * room); the damage is this life's with them.
 */
export function killerFrom(e: KillEvent, myId: string, killer: { health: number; armor: number } | null, damage: LifeDamage, at: number): HudKiller | null {
  if (!e.killer || e.killer === myId || e.killer === e.victim) return null;
  return {
    id: e.killer, name: e.killerName, team: e.killerTeam, weapon: e.weapon, headshot: !!e.headshot, assists: [...(e.assists ?? [])],
    hp: killer ? killer.health : -1, armor: killer ? killer.armor : 0, ...damage.line(e.killer), at,
  };
}

// ------------------------------------------------------------------------------------ (d) sites

/** `stepBomb`'s own reach (`bomb.ts` `near`): on the ground within `r`, and on the same floor. */
const near = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }, r: number): boolean =>
  Math.hypot(p.x - q.x, p.z - q.z) <= r && Math.abs(p.y - q.y) < 1.5;

/** The bomb site I stand on — within `BOMB.useRadius` of it, the reach the server plants from — or "". */
export function siteAt(sites: readonly BombSite[], p: { x: number; y: number; z: number }): "" | "A" | "B" {
  const s = sites.find((q) => near(p, q, BOMB.useRadius));
  return s && (s.id === "A" || s.id === "B") ? s.id : "";
}

/** A living defender within reach of the planted bomb: the one who can defuse it now. */
export function nearBombFor(bomb: { stage: string; attackTeam: number; x: number; y: number; z: number } | null, myTeam: Team, alive: boolean, p: { x: number; y: number; z: number }): boolean {
  return !!bomb && alive && bomb.stage === "planted" && myTeam !== bomb.attackTeam && near(p, bomb, BOMB.useRadius);
}

// ------------------------------------------------------------------------------------ (e) rounds

/** What the round watch reads of the replicated state, sampled by `Game.syncHud`. */
export interface RoundView {
  mode: GameMode;
  phase: MatchPhase;
  /** `bomb.round`: the round being played, or in a break the one just finished. */
  round: number;
  /** `bomb.result`. */
  result: string;
  scoreA: number;
  scoreB: number;
  bomb: { stage: string; actor: string; carrier: string } | null;
  players: readonly { id: string; name: string; team: Team }[];
}

/**
 * Watches the rounds this client sees: the kills of the round (counted only from an OBSERVED
 * release, the Prep→Playing edge), the planter and the defuser (latched off `bomb.actor`, which
 * the server clears on the very tick of the plant and of the defuse, so the last actor seen during
 * the action is the one), and at each observed break the round's record and, in bomb, its MVP.
 */
export class RoundWatch {
  private prev: RoundView | null = null;
  /** A release was seen, so this round's kills are all counted. */
  private started = false;
  private kills = new Map<string, { n: number; first: number }>();
  private seq = 0;
  private plantActor = "";
  private defuseActor = "";
  private planter = "";
  private defuser = "";
  mvp: HudRoundMvp | null = null;
  history: HudRoundRecord[] = [];

  /** `S2C.Kill`: a kill of an enemy, in a round whose start was seen. Self-kills and team kills are not. */
  kill(e: KillEvent): void {
    if (!this.started || !e.killer || e.killer === e.victim || e.killerTeam === e.victimTeam) return;
    const k = this.kills.get(e.killer);
    if (k) k.n++; else this.kills.set(e.killer, { n: 1, first: ++this.seq });
  }

  /**
   * One sample of the state. Returns true when `mvp` or `history` changed (a new object each time,
   * so the store sees the change).
   */
  step(v: RoundView): boolean {
    const p = this.prev;
    this.prev = v;
    let changed = false;
    const b = v.bomb;
    if (b) {
      if (b.stage === "carried" && b.actor) this.plantActor = b.actor;
      if (b.stage === "planted" && b.actor) this.defuseActor = b.actor;
    }
    if (!p) return false;
    if (p.phase === MatchPhase.Prep && v.phase === MatchPhase.Playing) {
      this.started = true;
      this.kills.clear(); this.seq = 0;
      this.plantActor = this.defuseActor = this.planter = this.defuser = "";
      if (this.mvp) { this.mvp = null; changed = true; }
    }
    if (b && p.bomb) {
      if (p.bomb.stage !== "planted" && b.stage === "planted") this.planter = this.plantActor || p.bomb.carrier;
      if (p.bomb.stage === "planted" && b.stage === "resolved" && v.result === "BOMB DEFUSED") this.defuser = this.defuseActor;
    }
    const ended = p.phase === MatchPhase.Playing && (v.phase === MatchPhase.Prep || v.phase === MatchPhase.Ended);
    if (ended && ROUND_MODES.has(v.mode) && v.result) {
      const winner: Team | -1 = v.scoreA > p.scoreA ? 0 : v.scoreB > p.scoreB ? 1 : -1;
      this.history = [...this.history, { round: v.round, winner, reason: v.result }];
      this.mvp = this.started && v.mode === "bomb" ? this.pickMvp(v, winner) : null;
      this.started = false;
      changed = true;
    }
    return changed;
  }

  private pickMvp(v: RoundView, winner: Team | -1): HudRoundMvp | null {
    const named = (id: string, why: HudRoundMvp["why"]): HudRoundMvp | null => {
      const row = v.players.find((r) => r.id === id);
      return row ? { id, name: row.name, kills: this.kills.get(id)?.n ?? 0, why } : null;
    };
    if (v.result === "BOMB DEFUSED" && this.defuser) return named(this.defuser, "defuse");
    if (v.result === "BOMB DETONATED" && this.planter) return named(this.planter, "plant");
    if (winner === -1) return null;
    let best: { id: string; n: number; first: number } | null = null;
    for (const [id, k] of this.kills) {
      const row = v.players.find((r) => r.id === id);
      if (!row || row.team !== winner) continue;
      if (!best || k.n > best.n || (k.n === best.n && k.first < best.first)) best = { id, ...k };
    }
    return best ? named(best.id, "kills") : null;
  }

  /**
   * The connection dropped: the gap is not seen, so this round's kills are not all counted and it
   * gets no MVP. Its end, if seen, still goes into the history.
   */
  interrupt(): void { this.started = false; }

  /** A new match (or a new room): nothing seen yet. */
  reset(): void {
    this.prev = null; this.started = false; this.kills.clear(); this.seq = 0;
    this.plantActor = this.defuseActor = this.planter = this.defuser = "";
    this.mvp = null; this.history = [];
  }
}

// ------------------------------------------------------------------------------------ (f) flags

/** The flag notice: „A DLA FADE”, with the flag, its map name and the team as fields (§8.4). */
export function flagNoticeFor(flag: { id: string; name: string } | undefined, team: Team, at: number): { text: string; flag: string; name: string; team: Team; at: number } {
  const id = flag?.id ?? "?";
  return { text: `${id} DLA ${TEAM_NAMES[team]}`, flag: id, name: flag?.name ?? "", team, at };
}

// ------------------------------------------------------------------------------------ (g) late join

/**
 * Joined a round mode mid-round: dead, with no `S2C.Kill` of mine seen since my last spawn —
 * `TdmRoom.ts:641-645` puts a late joiner down with no killer, so nothing ever announced a death.
 */
export function lateJoinFor(mode: GameMode, phase: MatchPhase, alive: boolean, killSeen: boolean): boolean {
  return ROUND_MODES.has(mode) && !alive && !killSeen && (phase === MatchPhase.Playing || phase === MatchPhase.Prep);
}
