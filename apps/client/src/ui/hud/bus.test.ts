import { describe, expect, it } from "vitest";
import { BOMB, DUEL, MATCH, MatchPhase, OSTRZYZENI, type BombData } from "@frankibarber/shared";
import { initialHud, type HudState, type ScoreRow } from "../../game/store";
import { ALERT_PRIORITY, BANNER_PRIORITY, MOMENT_MS, MomentBus, createMomentTracker, isBannerKind, type AlertKind, type BannerKind, type BusItem } from "./bus";

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

describe("the moment tracker", () => {
  it("a rejoin in the middle of a break still gets the round banner, from the break's deadline", () => {
    // No Playing→Prep edge was ever seen: the fallback (§6.3) says break, the deadline says when.
    const [v] = feed([st(0, { mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: S0 + 1_800, round: 5, roundResult: "TIME · MORE HEALTH", roundWinner: 0 })]);
    expect(v.banner?.kind).toBe("roundEnd");
    expect(v.banner?.start).toBe(S0 + 1_800 - DUEL.breakMs + MOMENT_MS.roundEndDelay);
    expect(v.actionMode).toBe("progressOnly");
  });

  it("the round end waits 250 ms into the break, and the halftime card takes over at 7000 ms", () => {
    const live = st(0, { mode: "bomb", phase: MatchPhase.Playing, phaseEndsAt: S0 + 90_000, bomb: bomb({ round: 6, stage: "carried" }), round: 6 });
    const brk = (t: number) => st(t, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 1_000 + BOMB.halftimeMs, round: 6, roundResult: "BOMB DEFUSED", roundWinner: 1, bomb: bomb({ round: 6, stage: "resolved", result: "BOMB DEFUSED" }) });
    const vs = feed([live, brk(1_000), brk(1_200), brk(1_300), brk(7_900), brk(8_100), brk(15_900)]);
    expect(vs.map((v) => v.banner?.kind ?? null)).toEqual([null, null, null, "roundEnd", "roundEnd", "halftime", "halftime"]);
    expect(vs[4].bannerOut).toBe(true); // the last 240 ms before the card: leaving
  });

  it("the freeze start is timed from the freeze it saw begin, and never outlives the release", () => {
    const brk = st(0, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 100, round: 4, roundResult: "SITE SECURED", roundWinner: 1, bomb: bomb({ round: 4, stage: "resolved", result: "SITE SECURED" }) });
    const frz = (t: number) => st(t, { mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: S0 + 100 + BOMB.buyMs, round: 5, bomb: bomb({ round: 5, stage: "buy" }) });
    const vs = feed([brk, frz(100), frz(1_000), frz(2_050), frz(2_200)]);
    expect(vs.map((v) => v.banner?.kind ?? null)).toEqual(["roundEnd", "freeze", "freeze", "freeze", null]);
    expect(vs[3].bannerOut).toBe(true);
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
      expect(vs.map((v) => v.banner?.kind ?? null)).toEqual(mode === "tdm" ? [null, null, "fight", "fight", null] : [null, null, "freeze", "freeze", "freeze"]);
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
  });

  it("Ostrzyżeni's freeze shows the role card, for 2500 ms", () => {
    const frz = (t: number) => st(t, { mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: S0 + OSTRZYZENI.prepMs, round: 1, players: [row("me", 0), row("bot-3", 1, { shaved: true })] });
    expect(feed([frz(0), frz(2_400), frz(2_600)]).map((v) => v.banner?.kind ?? null)).toEqual(["role", "role", null]);
  });

  it("the same state gives the same view object, so the zone re-renders only on a change", () => {
    const tr = createMomentTracker();
    const h = st(0, { mode: "tdm", phase: MatchPhase.Countdown, phaseEndsAt: S0 + 4_000 });
    const a = tr.read(h, LOCAL);
    expect(tr.read(h, LOCAL + 50)).toBe(a);
    expect(tr.read({ ...h, serverNow: S0 + 100 }, LOCAL + 100)).toBe(a); // nothing on screen changed
  });
});
