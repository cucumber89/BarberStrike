import { DUEL, GUN_GAME, MATCH, MatchPhase, BOMB, OSTRZYZENI, bombBreakMs, type Team } from "@frankibarber/shared";
import type { HudState } from "../../game/store";
import { createPhaseTracker, type PhaseModel } from "./phase";
import { roundEnd, turniejPair } from "./roundText";
import { uiFlags } from "./uiFlags";

/**
 * Drop U: THE MOMENT BUS (docs/UI_U_SPEC.md §6.5, P5) — which banner and which alert hold the
 * screen right now. A player reads one thing at a time: before this, a round break could stack
 * the round card, the death card, a flag notice and the bracket, each on its own timer.
 *
 * Two layers, both pure:
 * - `MomentBus` is the ARBITER. Items are pushed with a window [start, end) on the server clock;
 *   at any instant it shows at most one banner (the highest row of §6.5 whose window is open) and
 *   at most one alert (likewise), and while a banner is up the only alert is the reconnect line
 *   and the action slot shows only my own progress bar (`actionMode`). A lower item is never
 *   delayed: it shows for whatever part of its window is left, and is gone once that has passed.
 * - `createMomentTracker` is the OBSERVER. Fed every store state in order, it turns what it sees
 *   into items: the phase model's breaks, freezes and final round (their windows follow from the
 *   server's deadlines, so a rejoin mid-break still gets its banner), and the edges it observed —
 *   the plant, a flag notice, a gun-game rung reaching the last weapon, a shave with me as the
 *   victim, Countdown→Waiting, Countdown→Playing, Ended→Waiting — plus `reconnecting`.
 *
 * `publishBannerUp` is how the rest of the HUD hears it: `uiFlags.bannerUp` (§4.5 `data-banner`).
 */

export type BannerKind = "final" | "roundEnd" | "halftime" | "freeze" | "role" | "fight" | "shaved";
export type AlertKind = "reconnect" | "plant" | "flag" | "lastWeapon" | "aborted" | "newMatch";

/** §6.5: the banner rows, 1 the highest. The round end and the halftime card never overlap. */
export const BANNER_PRIORITY: Readonly<Record<BannerKind, number>> = { final: 1, roundEnd: 2, halftime: 2, freeze: 3, role: 3, fight: 4, shaved: 5 };
/** §6.5: the alerts, in priority order (the reconnect line first, for as long as it lasts). */
export const ALERT_PRIORITY: Readonly<Record<AlertKind, number>> = { reconnect: 0, plant: 1, flag: 2, lastWeapon: 3, aborted: 4, newMatch: 5 };

const BANNERS: ReadonlySet<string> = new Set(Object.keys(BANNER_PRIORITY));
export const isBannerKind = (k: string): k is BannerKind => BANNERS.has(k);

/** §6.1 / §6.5 client moment timings, ms. */
export const MOMENT_MS = {
  /** Match end, stage A (round modes): the final-round banner. */
  finalRound: 3000,
  /** The round-end banner comes in this long after the break starts, so the last hit stays visible. */
  roundEndDelay: 250,
  /** Halftime: the round-end banner until +7000, then the ZMIANA STRON card to the end. */
  halftimeCardAt: 7000,
  freezeStart: 2000,
  roleCard: 2500,
  fight: 840,
  shaved: 1500,
  plant: 2000,
  flag: 2600,
  lastWeapon: 1500,
  aborted: 1500,
  newMatch: 1500,
  /** Every banner, alert and the intro leave over this (`--hud-out`). */
  out: 240,
  /** The countdown digit shows in the last three seconds only. */
  digitFrom: 3000,
} as const;

/** One moment on the bus: its window on the server clock, and the words captured when it was seen. */
export interface BusItem<K extends BannerKind | AlertKind = BannerKind | AlertKind> {
  kind: K;
  /** One item per key: pushing the same key again replaces it. */
  key: string;
  start: number;
  end: number;
  data?: Readonly<Record<string, string | number | boolean>>;
}

export type ActionMode = "all" | "progressOnly";

export interface BusState {
  banner: BusItem<BannerKind> | null;
  alert: BusItem<AlertKind> | null;
  actionMode: ActionMode;
}

const RECONNECT_KEY = "reconnect";

/** The arbiter (§6.5). Pure: time is whatever the caller passes. */
export class MomentBus {
  private items = new Map<string, BusItem>();
  private reconnectSince: number | null = null;

  /** Add an item, or replace the one with the same key. */
  push(item: BusItem): void { this.items.set(item.key, item); }

  /** Remove every item of `kind`, except the one keyed `keep`. */
  retain(kind: BannerKind | AlertKind, keep: string | null = null): void {
    for (const [k, it] of this.items) if (it.kind === kind && k !== keep) this.items.delete(k);
  }

  /** The item pushed under `key`, if any. */
  get(key: string): BusItem | undefined { return this.items.get(key); }

  /** The connection is lost (from `now`) or back. The reconnect line lasts exactly as long. */
  reconnect(on: boolean, now: number): void {
    if (on && this.reconnectSince === null) this.reconnectSince = now;
    else if (!on) this.reconnectSince = null;
  }

  /** Forget items whose window closed more than `keepMs` ago. */
  prune(now: number, keepMs = 5000): void {
    for (const [k, it] of this.items) if (it.end < now - keepMs) this.items.delete(k);
  }

  /**
   * What holds the screen at `now`. `pairCard`: the bracket card is up (turniej between pairs,
   * P2), and a banner never shows beside it.
   */
  at(now: number, pairCard = false): BusState {
    let banner: BusItem<BannerKind> | null = null;
    let alert: BusItem<AlertKind> | null = null;
    const reconnecting = this.reconnectSince !== null;
    for (const it of this.items.values()) {
      if (!(it.start <= now && now < it.end)) continue;
      if (isBannerKind(it.kind)) {
        if (reconnecting || pairCard) continue;
        const b = it as BusItem<BannerKind>;
        if (!banner || BANNER_PRIORITY[b.kind] < BANNER_PRIORITY[banner.kind]
            || (BANNER_PRIORITY[b.kind] === BANNER_PRIORITY[banner.kind] && b.start > banner.start)) banner = b;
      } else {
        const a = it as BusItem<AlertKind>;
        if (!alert || ALERT_PRIORITY[a.kind] < ALERT_PRIORITY[alert.kind]
            || (ALERT_PRIORITY[a.kind] === ALERT_PRIORITY[alert.kind] && a.start > alert.start)) alert = a;
      }
    }
    if (reconnecting) alert = { kind: "reconnect", key: RECONNECT_KEY, start: this.reconnectSince!, end: Infinity };
    else if (banner) alert = null;
    return { banner, alert, actionMode: banner ? "progressOnly" : "all" };
  }
}

// ------------------------------------------------------------------------------------ the tracker

/** What the tracker reads from the store; `HudState` fits it, and so do the tests' states. */
export type MomentInput = Pick<HudState,
  "mode" | "phase" | "phaseEndsAt" | "matchEndsAt" | "bomb" | "round" | "roundResult" | "roundWinner" | "bracket" | "scoreA" | "scoreB"
  | "players" | "myTeam" | "myId" | "reconnecting" | "serverNow" | "flagNotice" | "killFeed">;

/** The screen's moments at one instant, as `<Moments>` draws them. One object until it changes. */
export interface MomentView {
  model: PhaseModel;
  banner: BusItem<BannerKind> | null;
  /** The banner's last `MOMENT_MS.out`: it is leaving. */
  bannerOut: boolean;
  alert: BusItem<AlertKind> | null;
  alertOut: boolean;
  actionMode: ActionMode;
  /** The countdown's intro block: in, leaving (the 240 ms after the countdown ended) or none. */
  intro: "in" | "out" | null;
  /** The countdown digit, 3 / 2 / 1 in the last three seconds; 0 otherwise. */
  digit: number;
}

const sameItem = (a: BusItem | null, b: BusItem | null): boolean => a === b || (!!a && !!b && a.key === b.key && a.end === b.end);

const duelLike = (mode: string): boolean => mode === "duel" || mode === "turniej";

/** The break's full length, from the server's constants (P-SRV): its start is its deadline minus this. */
export function breakLength(model: PhaseModel): number {
  if (model.mode === "bomb") return bombBreakMs(model.round);
  if (duelLike(model.mode)) return DUEL.breakMs;
  return OSTRZYZENI.breakMs;
}

/** The gun-game rung that hands out the last weapon. */
const LAST_RUNG = GUN_GAME.ladder.length - 1;

/** Could the round card name the round this state is about? (No banner for a card with no words.) */
const roundCardSays = (h: MomentInput): boolean =>
  roundEnd(h.mode, h.roundResult, h.roundWinner, h.bomb ? (h.bomb.attackTeam as Team) : -1, h.myTeam, h.mode === "turniej" ? turniejPair(h.bracket)?.names : null) !== null;

export interface MomentTracker {
  /** Fold the next store state in (in order) and say what the screen shows. Same state, same object. */
  read(h: MomentInput, localNow: number): MomentView;
  bus: MomentBus;
}

/**
 * The observer. `localNow` is `performance.now()` at the read: the store's `serverNow` moves at the
 * state sync (10 Hz), so between syncs the server clock is carried forward by the local one, and
 * the local stamps of the store (`flagNotice.at`, a kill's `at`) convert with the same offset.
 */
export function createMomentTracker(): MomentTracker {
  const bus = new MomentBus();
  const phase = createPhaseTracker();
  let prev: MomentInput | null = null;
  let prevModel: PhaseModel | null = null;
  let view: MomentView | null = null;
  let lastServerNow = Number.NaN;
  let offset = 0;
  /** The freeze on screen: when it was first seen (the banner's anchor), while it lasts. */
  let freezeAnchor: number | null = null;
  /** The countdown: the instant it ended (its intro leaves for `MOMENT_MS.out` from there). */
  let countdownEndedAt: number | null = null;

  const read = (h: MomentInput, localNow: number): MomentView => {
    if (h === prev && view) return view;
    if (h.serverNow !== lastServerNow) { lastServerNow = h.serverNow; offset = h.serverNow - localNow; }
    const now = localNow + offset;
    const model = phase.read(h);
    const p = prev;

    // ---- edges: what changed since the previous state
    if (p) {
      if (p.phase === MatchPhase.Countdown && h.phase !== MatchPhase.Countdown) countdownEndedAt = now;
      if (p.phase === MatchPhase.Countdown && h.phase === MatchPhase.Waiting) {
        bus.push({ kind: "aborted", key: `aborted:${now}`, start: now, end: now + MOMENT_MS.aborted });
      }
      if (p.phase === MatchPhase.Countdown && h.phase === MatchPhase.Playing && !model.roundMode) {
        bus.push({ kind: "fight", key: `fight:${now}`, start: now, end: now + MOMENT_MS.fight });
      }
      if (p.phase === MatchPhase.Ended && h.phase === MatchPhase.Waiting) {
        bus.push({ kind: "newMatch", key: `new:${now}`, start: now, end: now + MOMENT_MS.newMatch });
      }
      if (h.mode === "gungame" && p.mode === "gungame" && h.players !== p.players) {
        const before = new Map(p.players.map((r) => [r.id, r.score]));
        for (const r of h.players) {
          const was = before.get(r.id);
          if (r.score === LAST_RUNG && was !== undefined && was < LAST_RUNG) {
            bus.push({ kind: "lastWeapon", key: `last:${r.id}:${now}`, start: now, end: now + MOMENT_MS.lastWeapon, data: { me: r.id === h.myId, name: r.name } });
          }
        }
      }
    }
    if (h.phase === MatchPhase.Countdown) countdownEndedAt = null;
    bus.reconnect(h.reconnecting, now);

    // ---- items whose window follows from a server deadline or a stamped event
    const b = h.bomb;
    if (h.mode === "bomb" && b && b.stage === "planted" && b.endsAt > 0) {
      const key = `plant:${b.endsAt}`;
      const at = b.endsAt - BOMB.fuseMs;
      bus.push({ kind: "plant", key, start: at, end: at + MOMENT_MS.plant, data: { site: b.site } });
      bus.retain("plant", key);
    } else bus.retain("plant");

    const fn = h.flagNotice;
    if (fn && h.phase !== MatchPhase.Ended) {
      const key = `flag:${fn.at}`;
      if (!bus.get(key)) {
        const at = fn.at + offset;
        bus.push({ kind: "flag", key, start: at, end: at + MOMENT_MS.flag, data: { text: fn.text, team: fn.team, flag: fn.flag ?? "" } });
      }
    } else bus.retain("flag");

    // „WALCZ!” and „OSTRZYŻONY!” belong to the fight: when a round ends on the shave that made me
    // a chaser (the last survivor), the round card has the screen and the shave is not flashed first.
    if (model.moment === "live") {
      for (const k of h.killFeed) {
        if (!k.shave || k.victim !== h.myId || !h.myId) continue;
        const key = `shave:${k.key}:${k.at}`;
        if (!bus.get(key)) bus.push({ kind: "shaved", key, start: k.at + offset, end: k.at + offset + MOMENT_MS.shaved });
      }
    } else { bus.retain("shaved"); bus.retain("fight"); }

    // The round end and the halftime card: the break's windows, from its deadline.
    if (model.inBreak && h.phaseEndsAt > 0 && roundCardSays(h)) {
      const start = h.phaseEndsAt - breakLength(model);
      const endKey = `end:${h.phaseEndsAt}`;
      const halftime = model.moment === "halftime";
      bus.push({ kind: "roundEnd", key: endKey, start: start + MOMENT_MS.roundEndDelay, end: halftime ? start + MOMENT_MS.halftimeCardAt : h.phaseEndsAt });
      bus.retain("roundEnd", endKey);
      if (halftime) {
        const halfKey = `half:${h.phaseEndsAt}`;
        bus.push({ kind: "halftime", key: halfKey, start: start + MOMENT_MS.halftimeCardAt, end: h.phaseEndsAt });
        bus.retain("halftime", halfKey);
      } else bus.retain("halftime");
    } else { bus.retain("roundEnd"); bus.retain("halftime"); }

    // The freeze start (or Ostrzyżeni's role card): from the instant this freeze was first seen —
    // the edge that opened it, or the join that found it — and never past its release.
    if (model.moment === "freeze" && model.roundMode) {
      if (freezeAnchor === null || prevModel?.moment !== "freeze") freezeAnchor = now;
      const role = model.mode === "ostrzyzeni" && model.mySide !== null;
      const kind: BannerKind = role ? "role" : "freeze";
      const key = `${kind}:${freezeAnchor}`;
      const end = freezeAnchor + (role ? MOMENT_MS.roleCard : MOMENT_MS.freezeStart);
      bus.push({ kind, key, start: freezeAnchor, end: h.phaseEndsAt > freezeAnchor ? Math.min(end, h.phaseEndsAt) : end });
      bus.retain(kind, key); bus.retain(role ? "freeze" : "role");
    } else { freezeAnchor = null; bus.retain("freeze"); bus.retain("role"); }

    // Match end, stage A (round modes): the final round, 0–3000 ms of Ended.
    if (model.moment === "ended" && model.roundMode && h.phaseEndsAt > 0 && roundCardSays(h)) {
      const start = h.phaseEndsAt - MATCH.endedMs;
      const key = `final:${h.phaseEndsAt}`;
      bus.push({ kind: "final", key, start, end: start + MOMENT_MS.finalRound });
      bus.retain("final", key);
    } else bus.retain("final");

    bus.prune(now);
    const st = bus.at(now, model.moment === "betweenPairs");
    const bannerOut = !!st.banner && now >= st.banner.end - MOMENT_MS.out;
    const alertOut = !!st.alert && now >= st.alert.end - MOMENT_MS.out;
    const intro: MomentView["intro"] = model.moment === "countdown" ? "in"
      : countdownEndedAt !== null && now < countdownEndedAt + MOMENT_MS.out ? "out" : null;
    const left = h.phaseEndsAt - now;
    const digit = model.moment === "countdown" && h.phaseEndsAt > 0 && left > 0 && left <= MOMENT_MS.digitFrom ? Math.ceil(left / 1000) : 0;

    prev = h; prevModel = model;
    // One object while nothing on screen changes, so `useSyncExternalStore` re-renders only then.
    if (view && view.model === model && sameItem(view.banner, st.banner) && view.bannerOut === bannerOut && sameItem(view.alert, st.alert)
        && view.alertOut === alertOut && view.actionMode === st.actionMode && view.intro === intro && view.digit === digit) return view;
    view = { model, banner: st.banner, bannerOut, alert: st.alert, alertOut, actionMode: st.actionMode, intro, digit };
    return view;
  };
  return { read, bus };
}

/** §6.5: the bus publishes whether a banner holds the screen (`.hud[data-banner]`, §4.5). */
export function publishBannerUp(up: boolean): void {
  uiFlags.set({ bannerUp: up });
}
