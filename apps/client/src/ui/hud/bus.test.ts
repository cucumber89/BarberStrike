import { describe, expect, it } from "vitest";
import { BOMB, DUEL, MATCH, MatchPhase, OSTRZYZENI, bombAttackTeam, bombBreakMs, type BombData } from "@frankibarber/shared";
import { initialHud, type HudState, type ScoreRow } from "../../game/store";
import { ALERT_PRIORITY, BANNER_PRIORITY, MOMENT_MS, MomentBus, STALE_MS, createMomentTracker, isBannerKind, itemWinner, type AlertKind, type BannerKind, type BusItem, type MomentView } from "./bus";
import { bannerCopy, chaserName } from "./Moments";
import { roundBannerOf } from "./RoundBanner";

/** The same generator the spec names (§7 P5 ACCEPTANCE): mulberry32, seeded 1–1000. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BANNER_KINDS = Object.keys(BANNER_PRIORITY) as BannerKind[];
const ALERT_KINDS = (Object.keys(ALERT_PRIORITY) as AlertKind[]).filter((k) => k !== "reconnect");

describe("the moment bus (§6.5)", () => {
  it("1000 seeded push sequences: one banner, one alert, only reconnect beside a banner, nothing outside its window", () => {
    // Plain checks collected into one list (an `expect` per check is 1.2 M calls): every broken
    // rule is named with its seed and step, and the list must come out empty.
    const broken: string[] = [];
    const check = (ok: boolean, what: () => string) => { if (!ok && broken.length < 20) broken.push(what()); };
    let checked = 0, bannersSeen = 0, alertsSeen = 0, suppressed = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const rnd = mulberry32(seed);
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
      const bus = new MomentBus();
      /** Our own copy of what was pushed, to judge the bus against. */
      const mirror = new Map<string, BusItem>();
      let now = 0;
      let reconnecting = false;
      for (let step = 0; step < 120; step++) {
        const at = () => `seed ${seed} step ${step} t ${now}`;
        const r = rnd();
        if (r < 0.55) {
          const kind = rnd() < 0.5 ? pick(BANNER_KINDS) : pick(ALERT_KINDS);
          const start = now + Math.round((rnd() - 0.4) * 5000);
          const item: BusItem = { kind, key: `${kind}:${Math.floor(rnd() * 4)}`, start, end: start + 100 + Math.round(rnd() * 8000) };
          bus.push(item); mirror.set(item.key, item);
        } else if (r < 0.63) {
          reconnecting = !reconnecting;
          bus.reconnect(reconnecting, now);
        } else if (r < 0.68) {
          const kind = rnd() < 0.5 ? pick(BANNER_KINDS) : pick(ALERT_KINDS);
          bus.retain(kind);
          for (const [k, it] of mirror) if (it.kind === kind) mirror.delete(k);
        }
        now += Math.round(rnd() * 400);
        const pairCard = rnd() < 0.1;
        const st = bus.at(now, pairCard);
        const open = [...mirror.values()].filter((it) => it.start <= now && now < it.end);
        const openBanners = open.filter((it) => isBannerKind(it.kind)) as BusItem<BannerKind>[];
        const openAlerts = open.filter((it) => !isBannerKind(it.kind)) as BusItem<AlertKind>[];
        // No item shows outside its window.
        if (st.banner) {
          bannersSeen++;
          check(isBannerKind(st.banner.kind) && st.banner.start <= now && now < st.banner.end, () => `${at()}: banner ${st.banner!.key} outside [${st.banner!.start}, ${st.banner!.end})`);
        }
        if (st.alert && st.alert.kind !== "reconnect") {
          alertsSeen++;
          check(!isBannerKind(st.alert.kind) && st.alert.start <= now && now < st.alert.end, () => `${at()}: alert ${st.alert!.key} outside its window`);
        }
        // Never two: the one shown is THE best open one of its slot, and it is one of the pushed items.
        if (reconnecting || pairCard) {
          check(st.banner === null, () => `${at()}: a banner beside the reconnect line or the pair card`);
          if (openBanners.length) suppressed++;
        } else if (openBanners.length) {
          const best = Math.min(...openBanners.map((it) => BANNER_PRIORITY[it.kind]));
          check(!!st.banner && BANNER_PRIORITY[st.banner.kind] === best && mirror.get(st.banner.key) === st.banner, () => `${at()}: banner ${st.banner?.kind} is not the one open item of row ${best}`);
        } else check(st.banner === null, () => `${at()}: a banner with none open`);
        // While a banner is up: the alert is null or the reconnect line, and the action slot shows my bar only.
        if (st.banner) {
          check(st.alert === null || st.alert.kind === "reconnect", () => `${at()}: alert ${st.alert?.kind} beside a banner`);
          check(st.actionMode === "progressOnly", () => `${at()}: action mode ${st.actionMode} under a banner`);
        } else check(st.actionMode === "all", () => `${at()}: action mode ${st.actionMode} with no banner`);
        if (reconnecting) check(st.alert?.kind === "reconnect", () => `${at()}: no reconnect line while reconnecting`);
        else if (!st.banner && openAlerts.length) {
          const best = Math.min(...openAlerts.map((it) => ALERT_PRIORITY[it.kind]));
          check(!!st.alert && ALERT_PRIORITY[st.alert.kind] === best && mirror.get(st.alert.key) === st.alert, () => `${at()}: alert ${st.alert?.kind} is not the best open one`);
        } else if (!st.banner) check(st.alert === null, () => `${at()}: an alert with none open`);
        checked++;
      }
    }
    expect(broken).toEqual([]);
    // The sequences really exercised every branch.
    expect(checked).toBe(120_000);
    expect(bannersSeen).toBeGreaterThan(10_000);
    expect(alertsSeen).toBeGreaterThan(2_000);
    expect(suppressed).toBeGreaterThan(1_000);
  }, 30_000); // ~0.4 s alone; the machine is shared, so a generous ceiling

  it("a lower item is never delayed: it shows the rest of its window, and is dropped once that has passed", () => {
    const bus = new MomentBus();
    bus.push({ kind: "shaved", key: "s", start: 0, end: 1500 });
    bus.push({ kind: "roundEnd", key: "e", start: 500, end: 1000 });
    expect(bus.at(200).banner?.key).toBe("s");
    expect(bus.at(700).banner?.key).toBe("e");
    expect(bus.at(1200).banner?.key).toBe("s"); // back for what is left of its window
    expect(bus.at(1600).banner).toBeNull(); // never after it
  });

  it("the reconnect line suppresses every banner and outranks every alert, for exactly as long as it lasts", () => {
    const bus = new MomentBus();
    bus.push({ kind: "final", key: "f", start: 0, end: 3000 });
    bus.push({ kind: "plant", key: "p", start: 0, end: 3000 });
    bus.reconnect(true, 100);
    expect(bus.at(500)).toEqual({ banner: null, alert: { kind: "reconnect", key: "reconnect", start: 100, end: Infinity }, actionMode: "all" });
    bus.reconnect(false, 900);
    expect(bus.at(1000).banner?.key).toBe("f");
    expect(bus.at(1000).alert).toBeNull(); // the plant waits under the banner: only reconnect may show
  });
});

// ------------------------------------------------------------------------------------ the tracker

const S0 = 5_000_000;
const LOCAL = 100_000;
const row = (id: string, team: 0 | 1, o: Partial<ScoreRow> = {}): ScoreRow => ({
  id, name: id, team, kills: 0, deaths: 0, assists: 0, score: 0, ping: 20, alive: true, connected: true, money: 800, bot: false, shaved: false, haircut: "", ...o,
});
const bomb = (o: Partial<BombData>): BombData => ({ round: 1, attackTeam: 0, stage: "buy", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0, actor: "", progress: 0, result: "", ...o });
const st = (t: number, o: Partial<HudState>): HudState => ({ ...initialHud, myId: "me", myTeam: 0, connected: true, serverNow: S0 + t, players: [row("me", 0), row("p5", 1)], ...o });
/** Feed states at server time S0 + t; the local clock runs `LOCAL` behind, as it would. */
function feed(states: HudState[]) {
  const tr = createMomentTracker();
  return states.map((h) => tr.read(h, h.serverNow - S0 + LOCAL));
}
/**
 * Feed [state, server ms] pairs: the local clock at each read is given apart from the state, as in
 * the game — a MatchEvent writes the store without moving `serverNow`, only a sync moves it.
 */
function feedAt(reads: [HudState, number][]) {
  const tr = createMomentTracker();
  return reads.map(([h, t]) => tr.read(h, t + LOCAL));
}
/** A banner's three rows, as `<Moments>` draws them (the round card with the winner the bus saw). */
function said(v: MomentView, h: HudState): string {
  const b = v.banner;
  if (!b) return "";
  const c = b.kind === "roundEnd" || b.kind === "final" ? roundBannerOf({ ...h, roundWinner: itemWinner(b) }, v.model)
    : bannerCopy(b.kind, v.model, { myTeam: h.myTeam, bracket: h.bracket, chaser: chaserName(h) });
  if (!c) return "";
  const cls = "cls" in c ? `  .${String(c.cls)}` : "";
  return `${c.eyebrow.map((x) => x.text).join(" ")} / ${c.title} / ${c.line.map((x) => x.text).join(" · ")}${cls}`;
}

describe("the moment tracker", () => {
  it("a rejoin in the middle of a break still gets the round banner, from the break's deadline — and names the right winner", () => {
    // A reload starts the store from `initialHud` (roundWinner -1) and no Playing→Prep edge is ever
    // seen: the fallback (§6.3) says break, the deadline says when, the rows say who (audit case B).
    const brk = (o: Partial<HudState>) => st(0, { mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: S0 + 1_800, round: 5, scoreA: 3, scoreB: 2, roundWinner: -1, ...o });
    const eliminated = brk({ roundResult: "ELIMINATED", players: [row("me", 0), row("p5", 1, { alive: false })], alive: true });
    const [v] = feed([eliminated]);
    expect(v.banner?.kind).toBe("roundEnd");
    expect(v.banner?.start).toBe(S0 + 1_800 - DUEL.breakMs + MOMENT_MS.roundEndDelay);
    expect(v.actionMode).toBe("progressOnly");
    expect(said(v, eliminated)).toBe("WYGRANA / RUNDA DLA FADE / Przeciwnik wyeliminowany · Broń zostaje  .mine");
    // „TIME · MORE HEALTH”: the healthier side, once the rows carry health (P1's `ScoreRow.health`) …
    const time = brk({ roundResult: "TIME · MORE HEALTH", players: [row("me", 0, { health: 31 }), row("p5", 1, { health: 47 })], alive: true });
    expect(said(feed([time])[0], time)).toBe("PRZEGRANA / RUNDA DLA TAPER / Czas — więcej zdrowia · Broń zostaje  .theirs");
    // … and without them nobody is known: no card at all, rather than a draw that did not happen.
    const unknown = brk({ roundResult: "TIME · MORE HEALTH" });
    expect(feed([unknown])[0].banner).toBeNull();
    // A trade IS a draw, whatever the rows say.
    const trade = brk({ roundResult: "TRADE", players: [row("me", 0, { alive: false }), row("p5", 1, { alive: false })], alive: false });
    expect(said(feed([trade])[0], trade)).toBe("REMIS / RUNDA BEZ ROZSTRZYGNIĘCIA / Obaj padli · Broń przepada  .even");
  });

  it("a break's Prep event names the round's winner: the card trusts it when nothing else was seen (a reconnect mid-round)", () => {
    // The connection dropped in the fight (so no score was kept to compare), came back, and the
    // break's Prep event carried roundWinner 1 (`Game.ts:355`); „TIME · MORE HEALTH” with rows that
    // carry no health would otherwise leave the card down.
    const live = st(0, { mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: S0 + 5_000, round: 5, scoreA: 3, scoreB: 2 });
    const lost = { ...live, serverNow: S0 + 1_000, reconnecting: true };
    const back = { ...live, serverNow: S0 + 3_000, reconnecting: false };
    const event: HudState = { ...back, phase: MatchPhase.Prep, phaseEndsAt: S0 + 5_000 + DUEL.breakMs, roundWinner: 1 };
    const synced = { ...event, serverNow: S0 + 5_090, scoreB: 3, roundResult: "TIME · MORE HEALTH" };
    const later = { ...synced, serverNow: S0 + 6_000 };
    const vs = feedAt([[live, 0], [lost, 1_000], [back, 3_000], [event, 5_005], [synced, 5_090], [later, 6_000]]);
    expect(said(vs[5], later)).toBe("PRZEGRANA / RUNDA DLA TAPER / Czas — więcej zdrowia · Broń przepada  .theirs");
    // A draw reason stays a draw even beside a stale event value.
    const trade = { ...later, roundResult: "TRADE", roundWinner: 0 as const };
    expect(said(feedAt([[trade, 6_000]])[0], trade)).toBe("REMIS / RUNDA BEZ ROZSTRZYGNIĘCIA / Obaj padli · Broń przepada  .even");
  });

  it("the duel's deciding round, as Game.ts writes it (no Prep event), is the winner's at stage A — not a draw", () => {
    // Audit case A: the freeze's Prep event sets roundWinner -1 (`TdmRoom.ts:1617`), the round goes
    // Playing → Ended with no Prep event (`:1658-1659`), and the Ended event lands before the sync
    // that brings 6 : 5 and the reason.
    const base: Partial<HudState> = { mode: "duel", roundWinner: -1, alive: true };
    const fzEnd = S0 + DUEL.prepMs, liveEnd = fzEnd + DUEL.roundMs, tE = fzEnd + 20_000;
    const freeze = st(0, { ...base, phase: MatchPhase.Prep, phaseEndsAt: fzEnd, round: 10, scoreA: 5, scoreB: 5 });
    const live = st(DUEL.prepMs + 50, { ...base, phase: MatchPhase.Playing, phaseEndsAt: liveEnd, round: 10, scoreA: 5, scoreB: 5 });
    const endedEvent: HudState = { ...live, phase: MatchPhase.Ended, phaseEndsAt: tE + MATCH.endedMs, winner: 0 };
    const synced = st(tE - S0 + 80, { ...base, phase: MatchPhase.Ended, phaseEndsAt: tE + MATCH.endedMs, winner: 0, round: 11, scoreA: 6, scoreB: 5, roundResult: "ELIMINATED", players: [row("me", 0), row("p5", 1, { alive: false })] });
    const later = { ...synced, serverNow: tE + 1_500 };
    const vs = feedAt([[freeze, 0], [live, DUEL.prepMs + 50], [endedEvent, tE - S0 + 5], [synced, tE - S0 + 80], [later, tE - S0 + 1_500]]);
    expect(vs[2].banner).toBeNull(); // the event alone: no reason yet, so no card
    expect(vs[3].banner?.kind).toBe("final");
    expect(said(vs[4], later)).toBe("OSTATNIA RUNDA / RUNDA DLA FADE / Przeciwnik wyeliminowany  .mine");
    // Reloaded during stage A (no round seen at all): the side at DUEL.wins took the deciding round.
    const reloaded = { ...later, players: [row("me", 0), row("p5", 1)], roundResult: "TIME · MORE HEALTH" };
    expect(said(feed([reloaded])[0], reloaded)).toBe("OSTATNIA RUNDA / RUNDA DLA FADE / Czas — więcej zdrowia  .mine");
    // Turniej's final: `finishPair` has settled the bracket (`at` past the last match) by the time
    // Ended is synced — the card still names the final's pair, not FADE / TAPER.
    const tour = { ...later, mode: "turniej" as const, bracket: "4|3;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|6|4|a;Kowal|ZDZICHU|6|5|a",
      players: [row("me", 0, { name: "Kowal" }), row("p5", 1, { name: "ZDZICHU", alive: false })] };
    expect(said(feed([tour])[0], tour)).toBe("OSTATNIA RUNDA / RUNDA DLA Kowal / Przeciwnik wyeliminowany  .mine");
  });

  it("the round end waits 250 ms into the break, and the halftime card takes over at 7000 ms", () => {
    const live = st(0, { mode: "bomb", phase: MatchPhase.Playing, phaseEndsAt: S0 + 90_000, bomb: bomb({ round: 6, stage: "carried" }), round: 6 });
    const brk = (t: number) => st(t, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 1_000 + BOMB.halftimeMs, round: 6, roundResult: "BOMB DEFUSED", roundWinner: 1, bomb: bomb({ round: 6, stage: "resolved", result: "BOMB DEFUSED" }) });
    const vs = feed([live, brk(1_000), brk(1_200), brk(1_300), brk(7_900), brk(8_100), brk(15_900)]);
    expect(vs.map((v) => v.banner?.kind ?? null)).toEqual([null, null, null, "roundEnd", "roundEnd", "halftime", "halftime"]);
    expect(vs[4].bannerOut).toBe(true); // the last 240 ms before the card: leaving
  });

  it("the freeze start keeps the freeze's own window (+0 → +2000): a HUD that finds the freeze late shows no late banner", () => {
    // Audit case C: mounted 3.6 s into the 15 s bomb freeze — nothing, and the action slot stays whole.
    const frz = (t: number, left: number) => st(t, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + left, round: 5, bomb: bomb({ round: 5, stage: "buy" }) });
    const late = feed([0, 1_000, 2_000, 2_300].map((t) => frz(t, BOMB.buyMs - 3_600)));
    expect(late.map((v) => [v.banner?.kind ?? null, v.actionMode])).toEqual([[null, "all"], [null, "all"], [null, "all"], [null, "all"]]);
    // Mounted 1.0 s in: the rest of the window only — gone at +2000, not at +3000.
    const early = feed([0, 900, 1_000, 1_100].map((t) => frz(t, BOMB.buyMs - 1_000)));
    expect(early.map((v) => v.banner?.kind ?? null)).toEqual(["freeze", "freeze", null, null]);
    expect(early[1].bannerOut).toBe(true);
    // Ostrzyżeni's role card: 2500 ms of its 10 s freeze.
    const role = (t: number) => st(t, { mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: S0 + OSTRZYZENI.prepMs - 2_000, round: 1, players: [row("me", 0), row("bot-3", 1, { shaved: true })] });
    expect(feed([role(0), role(400), role(600)]).map((v) => v.banner?.kind ?? null)).toEqual(["role", "role", null]);
  });

  it("the freeze start is timed from the freeze's start, waits for the sync that brings its round, and never outlives the release", () => {
    const brk = st(0, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 100, round: 4, roundResult: "SITE SECURED", roundWinner: 1, bomb: bomb({ round: 4, stage: "resolved", result: "SITE SECURED" }) });
    const frz = (t: number) => st(t, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 100 + BOMB.buyMs, round: 5, bomb: bomb({ round: 5, stage: "buy" }) });
    const vs = feed([brk, frz(100), frz(190), frz(1_000), frz(2_150), frz(2_200)]);
    // 100: the freeze's first read — no sync has confirmed it yet; 190: the sync, 90 ms late, so the
    // banner keeps its 2000 ms (to 2190) and not a millisecond past that.
    expect(vs.map((v) => v.banner?.kind ?? null)).toEqual(["roundEnd", null, "freeze", "freeze", "freeze", null]);
    expect(vs[4].bannerOut).toBe(true);
    expect(vs[2].banner?.end).toBe(S0 + 100 + MOMENT_MS.freezeStart + 90);
  });

  it("a freeze's banner never opens on the break's words: the event lands before the sync (audit cases E, F)", () => {
    // E: bomb, halftime → round 7. The MatchEvent brings the phase and the deadline; round 7, the new
    // attacking side and the cleared result come with the sync after the patch.
    const half = bombBreakMs(BOMB.halfRounds);
    const bd = (round: number, o: Partial<BombData>) => bomb({ round, attackTeam: bombAttackTeam(round), ...o });
    const live = st(0, { mode: "bomb", phase: MatchPhase.Playing, phaseEndsAt: S0 + 50_000, round: 6, scoreA: 3, scoreB: 2, bomb: bd(6, { stage: "carried" }) });
    const brk = st(1_000, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 1_000 + half, round: 6, scoreA: 4, scoreB: 2, roundResult: "BOMB DETONATED", roundWinner: 0, bomb: bd(6, { stage: "resolved", result: "BOMB DETONATED" }) });
    const fzEnd = S0 + 1_000 + half + BOMB.buyMs;
    const event: HudState = { ...brk, phaseEndsAt: fzEnd, roundWinner: -1 };
    const synced = { ...event, serverNow: S0 + 1_000 + half + 90, round: 7, roundResult: "", bomb: bd(7, { stage: "buy" }) };
    const e = feedAt([[live, 0], [brk, 1_000], [event, 1_000 + half + 5], [synced, 1_000 + half + 90], [{ ...synced, serverNow: synced.serverNow + 500 }, 1_000 + half + 590]]);
    expect(e[2].banner).toBeNull();
    expect(said(e[3], synced)).toBe("DRUGA POŁOWA / RUNDA 7 / BRONISZ");
    expect(e[4].banner?.key).toBe(e[3].banner?.key);
    // F: Ostrzyżeni after ALL SHAVED — the event still has me shaved; the card waits and says PRZETRWAJ.
    const shavedAll = [row("me", 1, { shaved: true }), row("p2", 1, { shaved: true }), row("bot-3", 1, { name: "RYSIEK", shaved: true })];
    const oLive = st(0, { mode: "ostrzyzeni", phase: MatchPhase.Playing, phaseEndsAt: S0 + 30_000, myTeam: 1, round: 1, players: shavedAll });
    const oBrk = st(1_000, { mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: S0 + 1_000 + OSTRZYZENI.breakMs, myTeam: 1, round: 2, scoreB: 1, roundResult: "ALL SHAVED", roundWinner: 1, players: shavedAll });
    const oEvent: HudState = { ...oBrk, phaseEndsAt: oBrk.phaseEndsAt + OSTRZYZENI.prepMs, roundWinner: -1 };
    const oSynced = { ...oEvent, serverNow: oBrk.phaseEndsAt + 90, myTeam: 0 as const, roundResult: "", players: [row("me", 0), row("p2", 0), row("bot-3", 1, { name: "RYSIEK", shaved: true })] };
    const brkEnd = 1_000 + OSTRZYZENI.breakMs;
    const f = feedAt([[oLive, 0], [oBrk, 1_000], [oEvent, brkEnd + 5], [oSynced, brkEnd + 90]]);
    expect(f[2].banner).toBeNull();
    expect(said(f[3], oSynced)).toBe(" / PRZETRWAJ / RYSIEK MA MASZYNKĘ");
  });

  it("a sync that still holds the old phase between the event and the patch neither drops nor restarts a banner (audit case G)", () => {
    const brk = st(1_000, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 1_000 + BOMB.breakMs, round: 4, roundResult: "BOMB DEFUSED", roundWinner: 1, bomb: bomb({ round: 4, stage: "resolved", result: "BOMB DEFUSED" }) });
    const brkEnd = 1_000 + BOMB.breakMs;
    const fzEnd = S0 + brkEnd + BOMB.buyMs;
    const patched = (t: number) => ({ ...brk, phaseEndsAt: fzEnd, serverNow: S0 + t, roundWinner: -1 as const, round: 5, roundResult: "", bomb: bomb({ round: 5, stage: "buy" }) });
    const vs = feedAt([
      [st(0, { mode: "bomb", phase: MatchPhase.Playing, phaseEndsAt: S0 + 50_000, round: 4, bomb: bomb({ round: 4, stage: "carried" }) }), 0],
      [brk, 1_000],
      [{ ...brk, phaseEndsAt: fzEnd, roundWinner: -1 }, brkEnd + 5], // the event
      [{ ...brk, serverNow: S0 + brkEnd + 40, roundWinner: -1 }, brkEnd + 40], // a sync of the OLD state: the break's deadline again
      [patched(brkEnd + 140), brkEnd + 140],
      [patched(brkEnd + 600), brkEnd + 600],
      [patched(brkEnd + 1_900), brkEnd + 1_900],
    ]);
    expect(vs.map((v) => v.model.moment)).toEqual(["live", "break", "freeze", "freeze", "freeze", "freeze", "freeze"]);
    expect(vs.slice(4).map((v) => v.banner?.key)).toEqual([`freeze:${fzEnd}`, `freeze:${fzEnd}`, `freeze:${fzEnd}`]);
    // WALCZ!: Countdown → the Playing event → a sync still in the Countdown → the patch. One item,
    // one key, and the intro does not come back.
    const cd = st(0, { mode: "tdm", phase: MatchPhase.Countdown, phaseEndsAt: S0 + 4_000 });
    // The event keeps the last sync's `serverNow` (S0 + 3950): only a sync moves it.
    const playing = { ...cd, serverNow: S0 + 3_950, phase: MatchPhase.Playing, phaseEndsAt: S0 + 4_000 + MATCH.waveMs };
    const w = feedAt([[cd, 0], [{ ...cd, serverNow: S0 + 3_950 }, 3_950], [playing, 4_005], [{ ...cd, serverNow: S0 + 4_040 }, 4_040], [{ ...playing, serverNow: S0 + 4_090 }, 4_090], [{ ...playing, serverNow: S0 + 4_300 }, 4_300]]);
    const fight = `fight:${S0 + 4_005}`;
    expect(w.map((v) => v.banner?.key ?? null)).toEqual([null, null, fight, fight, fight, fight]);
    expect(w.map((v) => v.intro)).toEqual(["in", "in", "out", "out", "out", null]);
    // A real return to a phase, later than STALE_MS: the countdown that is aborted is still heard.
    const ab = feedAt([[st(0, { phase: MatchPhase.Waiting }), 0], [st(100, { phase: MatchPhase.Countdown, phaseEndsAt: S0 + 4_100 }), 100], [st(100 + STALE_MS + 100, { phase: MatchPhase.Waiting }), 100 + STALE_MS + 100]]);
    expect(ab[2].alert?.kind).toBe("aborted");
  });

  it("WALCZ! only when a continuous mode's countdown turns into the fight; the intro leaves over 240 ms", () => {
    for (const mode of ["tdm", "bomb"] as const) {
      const vs = feed([
        st(0, { mode, phase: MatchPhase.Countdown, phaseEndsAt: S0 + 4_000 }),
        st(3_500, { mode, phase: MatchPhase.Countdown, phaseEndsAt: S0 + 4_000 }),
        st(4_000, { mode, phase: mode === "tdm" ? MatchPhase.Playing : MatchPhase.Prep, phaseEndsAt: S0 + 19_000, bomb: mode === "bomb" ? bomb({}) : null }),
        st(4_300, { mode, phase: mode === "tdm" ? MatchPhase.Playing : MatchPhase.Prep, phaseEndsAt: S0 + 19_000, bomb: mode === "bomb" ? bomb({}) : null }),
        st(4_900, { mode, phase: mode === "tdm" ? MatchPhase.Playing : MatchPhase.Prep, phaseEndsAt: S0 + 19_000, bomb: mode === "bomb" ? bomb({}) : null }),
      ]);
      expect(vs[0]).toMatchObject({ intro: "in", digit: 0 });
      expect(vs[1]).toMatchObject({ intro: "in", digit: 1 });
      expect(vs[2].intro).toBe("out");
      expect(vs[3].intro).toBeNull();
      // Bomb: the freeze's banner comes with the first sync after its event (here 300 ms on).
      expect(vs.map((v) => v.banner?.kind ?? null)).toEqual(mode === "tdm" ? [null, null, "fight", "fight", null] : [null, null, null, "freeze", "freeze"]);
    }
  });

  it("the edges: countdown aborted, a new match, the last weapon — and never at mount", () => {
    const vs = feed([
      st(0, { phase: MatchPhase.Countdown, phaseEndsAt: S0 + 4_000 }),
      st(1_000, { phase: MatchPhase.Waiting }),
      st(2_400, { phase: MatchPhase.Waiting }),
      st(2_600, { phase: MatchPhase.Waiting }),
    ]);
    expect(vs.map((v) => v.alert?.kind ?? null)).toEqual([null, "aborted", "aborted", null]);
    const ended = feed([st(0, { phase: MatchPhase.Ended, phaseEndsAt: S0 + 500 }), st(600, { phase: MatchPhase.Waiting })]);
    expect(ended[1].alert?.kind).toBe("newMatch");
    const gg = (t: number, mine: number, his: number) => st(t, { mode: "gungame", phase: MatchPhase.Playing, players: [row("me", 0, { score: mine }), row("p5", 0, { name: "xXPiotrekXx", score: his })] });
    const last = feed([gg(0, 13, 12), gg(100, 13, 12), gg(200, 13, 13)]);
    expect(last[0].alert).toBeNull(); // already on it at mount: no edge, no alert
    expect(last[2].alert).toMatchObject({ kind: "lastWeapon", data: { me: false, name: "xXPiotrekXx" } });
  });

  it("the plant alert follows the fuse's deadline; a flag and a shave follow their local stamps", () => {
    const planted = (t: number) => st(t, { mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ round: 3, stage: "planted", site: "A", endsAt: S0 + BOMB.fuseMs - 800 }) });
    expect(feed([planted(0)])[0].alert).toMatchObject({ kind: "plant", data: { site: "A" } }); // 0.8 s after the plant
    expect(feed([planted(1_300)])[0].alert).toBeNull(); // 2.1 s after it
    const flag = st(0, { mode: "dom", phase: MatchPhase.Playing, flagNotice: { text: "A DLA FADE", team: 0, at: LOCAL - 2_500, flag: "A" } });
    expect(feed([flag])[0].alert?.kind).toBe("flag");
    expect(feed([{ ...flag, flagNotice: { ...flag.flagNotice!, at: LOCAL - 2_700 } }])[0].alert).toBeNull();
    const shaved = st(0, { mode: "ostrzyzeni", phase: MatchPhase.Playing, phaseEndsAt: S0 + 60_000, killFeed: [{ key: 1, at: LOCAL - 700, killer: "p5", killerName: "p5", killerTeam: 1, victim: "me", victimName: "me", victimTeam: 0, weapon: "clippers", headshot: false, shave: true }] });
    expect(feed([shaved])[0].banner?.kind).toBe("shaved");
  });

  it("stage A of the match's end is the final-round banner, in round modes only", () => {
    const end = (mode: "bomb" | "tdm", into: number) => st(0, { mode, phase: MatchPhase.Ended, phaseEndsAt: S0 + MATCH.endedMs - into, roundResult: "BOMB DEFUSED", bomb: mode === "bomb" ? bomb({ round: 11, attackTeam: 1, stage: "resolved", result: "BOMB DEFUSED" }) : null });
    expect(feed([end("bomb", 1_500)])[0].banner?.kind).toBe("final");
    expect(feed([end("bomb", 3_100)])[0].banner).toBeNull();
    expect(feed([end("tdm", 1_500)])[0].banner).toBeNull();
    // A duel capped during a freeze ends with no result (R7): no final-round card, not an empty one.
    expect(feed([st(0, { mode: "duel", phase: MatchPhase.Ended, phaseEndsAt: S0 + MATCH.endedMs - 500, scoreA: 4, scoreB: 3, roundResult: "" })])[0].banner).toBeNull();
  });

  it("the same state gives the same view object, so the zone re-renders only on a change", () => {
    const tr = createMomentTracker();
    const h = st(0, { mode: "tdm", phase: MatchPhase.Countdown, phaseEndsAt: S0 + 4_000 });
    const a = tr.read(h, LOCAL);
    expect(tr.read(h, LOCAL + 50)).toBe(a);
    expect(tr.read({ ...h, serverNow: S0 + 100 }, LOCAL + 100)).toBe(a); // nothing on screen changed
  });
});
