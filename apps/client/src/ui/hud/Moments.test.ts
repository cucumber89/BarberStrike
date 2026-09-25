import { describe, expect, it } from "vitest";
import {
  BOMB, DUEL, GUN_GAME, MATCH, MatchPhase, OSTRZYZENI, TOURNAMENT, bombAttackTeam, bombBreakMs, type BombData, type Team,
} from "@frankibarber/shared";
import { initialHud, type HudState, type KillFeedEntry, type ScoreRow } from "../../game/store";
import { createMomentTracker, itemWinner, type AlertKind, type BannerKind, type MomentView } from "./bus";
import { alertCopy, bannerCopy, chaserName, introCopy } from "./Moments";
import { roundBannerOf } from "./RoundBanner";
import { countWords } from "./format";

/**
 * Every mode's whole match, walked in 100 ms steps through the moment bus exactly as the store
 * would deliver it (docs/UI_U_SPEC.md §7 P5 ACCEPTANCE): tdm (with an aborted countdown and a lost
 * connection), gun game and domination for the continuous moments, bomb for 12 rounds with the
 * halftime between 6 and 7, the duel to 6 : 5, Ostrzyżeni for 5 rounds, and a tournament with two
 * pairs, a walkover and the final. At every step at most one banner OR the pair card shows, and
 * at most one alert; every item's timed words stay ≤ 3 × the seconds it was on screen (§6.5).
 *
 * "As the store would deliver it" is `asGameWrites`: every phase change reaches the store as the
 * MatchEvent first (`Game.ts:351-356`: the phase, its deadline, the winner — and a Prep's winner as
 * `roundWinner`, the only writer of that field), then, in the worst case, a 10 Hz sync that still
 * holds the previous state, and only then the sync after the patch. The deciding round has no Prep
 * event, so its store never holds its winner; nothing here puts one there.
 */

const STEP = 100;
/** The server clock at the first step, and the local clock (`performance.now()`) then. */
const T0 = 7_000_000;
const LOCAL0 = 50_000;
const local = (serverT: number): number => serverT - T0 + LOCAL0;

interface Seg { ms: number; phase: MatchPhase; patch?: (c: { t: number; start: number; end: number }) => Partial<HudState> }

/**
 * The SERVER's state, one per step: each segment's phase ends at its own end unless it says
 * otherwise. A segment's `roundWinner` is not a server field: it declares who took the round, and
 * `asGameWrites` hands it to the store only the way the game does (the break's Prep event).
 */
function* play(base: Partial<HudState>, segs: Seg[]): Generator<HudState> {
  let start = T0;
  for (const seg of segs) {
    const end = start + seg.ms;
    for (let t = start; t < end; t += STEP) {
      yield { ...initialHud, connected: true, myId: "me", myTeam: 0, ...base, phase: seg.phase, phaseEndsAt: end, serverNow: t, ...seg.patch?.({ t, start, end }) };
    }
    start = end;
  }
}

/** How long after a MatchEvent the sync with the patched state lands, in this walk. */
const SYNC_LAG = 90;

/** One store state as the HUD reads it: at server time `t` (the local clock follows it), with the server's truth beside it. */
interface Read { h: HudState; t: number; server: HudState }

/**
 * The store as `Game.ts` writes it. A step whose phase or deadline changed is a MatchEvent: the
 * event alone first (phase, deadline, winner; `roundWinner` from a Prep event only — the round's
 * winner after Playing, -1 at a freeze), then (`stale`) a sync 40 ms later that still reads the old
 * `conn.state`, then the sync after the patch at +90 ms. `serverNow` moves only with a sync.
 */
function* asGameWrites(steps: Iterable<HudState>, stale: boolean): Generator<Read> {
  let store: HudState = initialHud;
  let before: HudState | null = null;
  for (const server of steps) {
    const t = server.serverNow;
    if (!before) {
      store = { ...server, roundWinner: -1 };
      yield { h: store, t, server };
    } else if (server.phase !== before.phase || server.phaseEndsAt !== before.phaseEndsAt) {
      const winner: Team | -1 = server.phase === MatchPhase.Prep && before.phase === MatchPhase.Playing ? server.roundWinner
        : server.phase === MatchPhase.Ended ? server.winner : -1;
      store = { ...store, phase: server.phase, phaseEndsAt: server.phaseEndsAt, winner, ...(server.phase === MatchPhase.Prep ? { roundWinner: winner } : {}) };
      yield { h: store, t, server };
      if (stale) {
        store = { ...before, serverNow: t + 40, roundWinner: store.roundWinner };
        yield { h: store, t: t + 40, server };
      }
      store = { ...server, serverNow: t + SYNC_LAG, roundWinner: store.roundWinner };
      yield { h: store, t: t + SYNC_LAG, server };
    } else {
      store = { ...server, roundWinner: store.roundWinner };
      yield { h: store, t, server };
    }
    before = server;
  }
}

const row = (id: string, name: string, team: Team, o: Partial<ScoreRow> = {}): ScoreRow => ({
  id, name, team, kills: 0, deaths: 0, assists: 0, score: 0, ping: 20, alive: true, connected: true, money: 800, bot: false, shaved: false, haircut: "", ...o,
});
const FIVES = [
  row("me", "Kowal", 0), row("p1", "Kasia_Brzytwa", 0), row("p2", "Młody_Tomek", 0), row("bot-1", "ZDZICHU", 0, { bot: true }), row("bot-2", "GRAZYNA", 0, { bot: true }),
  row("p5", "xXPiotrekXx", 1), row("p6", "Gruby_Wojtek", 1), row("p7", "Szczepan", 1), row("bot-3", "RYSIEK", 1, { bot: true }), row("bot-4", "JANUSZ", 1, { bot: true }),
];
const bombData = (o: Partial<BombData>): BombData => ({ round: 1, attackTeam: 0, stage: "buy", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0, actor: "", progress: 0, result: "", ...o });
const kill = (key: number, at: number, killer: string, victim: string, o: Partial<KillFeedEntry> = {}): KillFeedEntry => ({
  key, at: local(at), killer, killerName: killer, killerTeam: 1, victim, victimName: victim, victimTeam: 0, weapon: "clippers", headshot: false, ...o,
});

// ------------------------------------------------------------------------------------ the matches

function tdm(): HudState[] {
  return [...play({ mode: "tdm", players: FIVES }, [
    { ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) },
    // A player left two seconds into the countdown (`match.ts:15`): back to the warm-up.
    { ms: 2_000, phase: MatchPhase.Countdown, patch: ({ start }) => ({ phaseEndsAt: start + MATCH.countdownMs }) },
    { ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) },
    { ms: MATCH.countdownMs, phase: MatchPhase.Countdown },
    { ms: 60_000, phase: MatchPhase.Playing, patch: ({ t, start }) => ({ matchEndsAt: start + MATCH.durationMs, reconnecting: t >= start + 20_000 && t < start + 23_000 }) },
    { ms: MATCH.endedMs, phase: MatchPhase.Ended, patch: () => ({ winner: 0 }) },
    { ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) },
  ])];
}

function gungame(): HudState[] {
  const last = GUN_GAME.ladder.length - 1;
  return [...play({ mode: "gungame" }, [
    { ms: 1_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) },
    { ms: MATCH.countdownMs, phase: MatchPhase.Countdown },
    { ms: 30_000, phase: MatchPhase.Playing, patch: ({ t, start }) => ({ players: [
      row("me", "Kowal", 0, { score: t < start + 10_000 ? last - 2 : t < start + 12_000 ? last - 1 : last }),
      row("p5", "xXPiotrekXx", 0, { score: t < start + 20_000 ? last - 1 : last }),
    ] }) },
    { ms: MATCH.endedMs, phase: MatchPhase.Ended },
    { ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) },
  ])];
}

function dom(): HudState[] {
  return [...play({ mode: "dom", players: FIVES }, [
    { ms: MATCH.countdownMs, phase: MatchPhase.Countdown },
    { ms: 30_000, phase: MatchPhase.Playing, patch: ({ t, start }) => ({
      flagNotice: t >= start + 12_000 ? { text: "B DLA TAPER", team: 1, at: local(start + 12_000), flag: "B" }
        : t >= start + 5_000 ? { text: "A DLA FADE", team: 0, at: local(start + 5_000), flag: "A" } : null,
    }) },
    { ms: MATCH.endedMs, phase: MatchPhase.Ended },
    { ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) },
  ])];
}

/** Bomb, 12 rounds: A wins 1, 3, 5, 8, 10, 11 (SITE SECURED) and 12; B the rest — 7 : 5, halftime after 6. */
function bomb(): HudState[] {
  const segs: Seg[] = [{ ms: 2_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) }, { ms: MATCH.countdownMs, phase: MatchPhase.Countdown }];
  let a = 0, b = 0;
  for (let r = 1; r <= BOMB.maxRounds; r++) {
    const atk = bombAttackTeam(r);
    const plant = r % 2 === 1 && r !== 11;
    const result = r === 11 ? "SITE SECURED" : plant ? "BOMB DETONATED" : "ATTACKERS ELIMINATED";
    const winner = (result === "BOMB DETONATED" ? atk : 1 - atk) as Team;
    const [sa, sb] = [a, b];
    segs.push({ ms: BOMB.buyMs, phase: MatchPhase.Prep, patch: () => ({ round: r, scoreA: sa, scoreB: sb, roundResult: "", roundWinner: -1, bomb: bombData({ round: r, attackTeam: atk }) }) });
    segs.push({ ms: plant ? 20_000 + BOMB.fuseMs : 45_000, phase: MatchPhase.Playing, patch: ({ t, start }) => {
      const planted = plant && t >= start + 20_000;
      return {
        round: r, scoreA: sa, scoreB: sb, reconnecting: r === 3 && t >= start + 5_000 && t < start + 8_000,
        bomb: bombData({ round: r, attackTeam: atk, stage: planted ? "planted" : "carried", site: planted ? "A" : "", endsAt: planted ? start + 20_000 + BOMB.fuseMs : 0, roundEndsAt: start + BOMB.roundMs }),
      };
    } });
    if (winner === 0) a++; else b++;
    const done = { round: r, scoreA: a, scoreB: b, roundResult: result, roundWinner: winner, bomb: bombData({ round: r, attackTeam: atk, stage: "resolved", result }),
      roundMvp: { id: "p5", name: "xXPiotrekXx", kills: 3, why: "kills" as const } };
    if (a === BOMB.wins || b === BOMB.wins || r === BOMB.maxRounds) { segs.push({ ms: MATCH.endedMs, phase: MatchPhase.Ended, patch: () => ({ ...done, winner }) }); break; }
    segs.push({ ms: bombBreakMs(r), phase: MatchPhase.Prep, patch: () => done });
  }
  segs.push({ ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0, bomb: null, roundResult: "" }) });
  return [...play({ mode: "bomb", players: FIVES }, segs)];
}

/**
 * One pair's duel (the duel, or one tournament pair): freeze, fight, break, until a side has
 * DUEL.wins — then `decided` says what follows (the match's end, or the pair card).
 */
function pairSegs(winners: Team[], o: { reasons?: string[]; pair: [string, string]; bracket: (a: number, b: number) => string; decided?: (done: Partial<HudState>) => Seg }): Seg[] {
  const segs: Seg[] = [];
  let a = 0, b = 0;
  const players = (dead: string[]) => o.pair.map((id, i) => row(id, id === "me" ? "Kowal" : id, i as Team, { alive: !dead.includes(id) }));
  const mine = o.pair.includes("me");
  winners.forEach((w, i) => {
    const r = i + 1;
    const [sa, sb] = [a, b];
    segs.push({ ms: DUEL.prepMs, phase: MatchPhase.Prep, patch: () => ({ round: r - 1, scoreA: sa, scoreB: sb, roundResult: "", roundWinner: -1, players: players([]), bracket: o.bracket(sa, sb), alive: mine }) });
    segs.push({ ms: 15_000, phase: MatchPhase.Playing, patch: ({ start }) => ({ phaseEndsAt: start + DUEL.roundMs, round: r - 1, scoreA: sa, scoreB: sb, players: players([]), bracket: o.bracket(sa, sb), alive: mine }) });
    if (w === 0) a++; else b++;
    const loser = o.pair[1 - w];
    const done: Partial<HudState> = { round: r, scoreA: a, scoreB: b, roundResult: o.reasons?.[i] ?? "ELIMINATED", roundWinner: w, winner: w, players: players([loser]), bracket: o.bracket(a, b), alive: mine && loser !== "me" };
    if ((a === DUEL.wins || b === DUEL.wins) && o.decided) segs.push(o.decided(done));
    else segs.push({ ms: DUEL.breakMs, phase: MatchPhase.Prep, patch: () => done });
  });
  return segs;
}

const ended = (done: Partial<HudState>): Seg => ({ ms: MATCH.endedMs, phase: MatchPhase.Ended, patch: () => done });

/** The duel to 6 : 5, the sides swapping after rounds 3, 6 and 9; the clock decides every other round. */
function duel(): HudState[] {
  const winners: Team[] = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  const reasons = winners.map((_, i) => (i % 2 ? "ELIMINATED" : "TIME · MORE HEALTH"));
  return [...play({ mode: "duel" }, [
    { ms: MATCH.countdownMs, phase: MatchPhase.Countdown, patch: () => ({ players: [row("me", "Kowal", 0), row("p5", "xXPiotrekXx", 1)] }) },
    ...pairSegs(winners, { reasons, pair: ["me", "p5"], bracket: () => "", decided: ended }),
    { ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0 }) },
  ])];
}

/** Ostrzyżeni, 5 rounds: I am shaved mid-round 2, I start round 3 as the chaser, and in round 4 I am the last head. */
function ostrzyzeni(): HudState[] {
  const segs: Seg[] = [{ ms: MATCH.countdownMs, phase: MatchPhase.Countdown }];
  let a = 0, b = 0;
  for (let r = 1; r <= OSTRZYZENI.rounds; r++) {
    const iChase = r === 3;
    const people = (meShaved: boolean) => [
      row("me", "Kowal", meShaved ? 1 : 0, { shaved: meShaved }), row("p1", "Kasia_Brzytwa", 0), row("p2", "Młody_Tomek", 0),
      row("bot-3", "RYSIEK", iChase ? 0 : 1, { shaved: !iChase }),
    ];
    const [sa, sb] = [a, b];
    segs.push({ ms: OSTRZYZENI.prepMs, phase: MatchPhase.Prep, patch: () => ({ round: r - 1, scoreA: sa, scoreB: sb, roundResult: "", roundWinner: -1, players: people(iChase), myTeam: iChase ? 1 : 0 }) });
    segs.push({ ms: 30_000, phase: MatchPhase.Playing, patch: ({ t, start }) => {
      const shaved = r === 2 && t >= start + 10_000;
      return {
        phaseEndsAt: start + OSTRZYZENI.roundMs, round: r - 1, scoreA: sa, scoreB: sb, players: people(iChase || shaved), myTeam: iChase || shaved ? 1 : 0,
        killFeed: r === 2 && t >= start + 10_000 && t < start + 16_000 ? [kill(1, start + 10_000, "bot-3", "me", { shave: true })] : [],
      };
    } });
    // Round 4: the last survivor is shaved and the round ends on that very kill (ALL SHAVED).
    const result = r === 4 ? "ALL SHAVED" : "SURVIVORS HELD";
    const winner = r === 4 ? OSTRZYZENI.shavedTeam : OSTRZYZENI.survivorTeam;
    if (winner === 0) a++; else b++;
    const done = ({ start }: { start: number }) => ({
      round: r, scoreA: a, scoreB: b, roundResult: result, roundWinner: winner, players: people(true), myTeam: 1 as Team,
      killFeed: r === 4 ? [kill(2, start, "bot-3", "me", { shave: true })] : [],
    });
    if (r === OSTRZYZENI.rounds) segs.push({ ms: MATCH.endedMs, phase: MatchPhase.Ended, patch: done });
    else segs.push({ ms: OSTRZYZENI.breakMs, phase: MatchPhase.Prep, patch: done });
  }
  segs.push({ ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0, roundResult: "" }) });
  return [...play({ mode: "ostrzyzeni" }, segs)];
}

/** Four entrants: I win semi-final 1 6 : 3, semi-final 2 ends in a walkover at 2 : 1, then the final. */
function turniej(): HudState[] {
  const entrants = ["me", "p5", "bot-1", "bot-3"];
  const nameOf: Record<string, string> = { me: "Kowal", p5: "xXPiotrekXx", "bot-1": "ZDZICHU", "bot-3": "RYSIEK" };
  const everyone = (pair: string[], dead: string[] = []): ScoreRow[] =>
    entrants.map((id) => row(id, nameOf[id], (pair.indexOf(id) === 1 ? 1 : 0) as Team, { alive: pair.includes(id) && !dead.includes(id) }));
  const semi1 = (a: number, b: number) => `4|0;Kowal|xXPiotrekXx|${a}|${b}|-;ZDZICHU|RYSIEK|0|0|-;||0|0|-`;
  const semi2 = (a: number, b: number) => `4|1;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|${a}|${b}|-;Kowal||0|0|-`;
  const fin = (a: number, b: number) => `4|2;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|2|1|a;Kowal|ZDZICHU|${a}|${b}|-`;
  // Between pairs: the room kills everyone (`finishPair`, `withdrawFromBracket`) and moves the bracket on.
  const between = (bracket: string) => (done: Partial<HudState>): Seg => ({ ms: TOURNAMENT.breakMs, phase: MatchPhase.Prep, patch: () => ({ ...done, bracket, players: everyone([]), alive: false }) });
  // A pair's rounds with every entrant on the board (the helper seats only the pair: `a` is team 0).
  const named = (segs: Seg[], pair: [string, string]): Seg[] => segs.map((s) => ({ ...s, patch: (c) => {
    const p = s.patch?.(c) ?? {};
    return { ...p, players: p.players?.length === 2 ? everyone(pair, p.players.filter((r) => !r.alive).map((r) => r.id)) : p.players, myTeam: pair[1] === "me" ? 1 : 0 };
  } }));
  const s1 = named(pairSegs([0, 1, 0, 1, 0, 1, 0, 0, 0], { pair: ["me", "p5"], bracket: semi1, decided: between(semi2(0, 0)) }), ["me", "p5"]);
  const s2 = named(pairSegs([0, 1, 0], { pair: ["bot-1", "bot-3"], bracket: semi2 }), ["bot-1", "bot-3"]);
  // RYSIEK leaves 5 s into the next freeze, at 2 : 1: a walkover, with no Playing→Prep edge.
  const walkover: Seg = { ms: 5_000, phase: MatchPhase.Prep, patch: ({ start }) => ({ phaseEndsAt: start + DUEL.prepMs, round: 3, scoreA: 2, scoreB: 1, roundResult: "", roundWinner: -1, players: everyone(["bot-1", "bot-3"]), bracket: semi2(2, 1), alive: false }) };
  // The final decided: `finishPair` reports it, so the bracket's `at` is past its last match at Ended.
  const settled = "4|3;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|2|1|a;Kowal|ZDZICHU|6|0|a";
  const fn = named(pairSegs([0, 0, 0, 0, 0, 0], { pair: ["me", "bot-1"], bracket: fin, decided: (done) => ended({ ...done, bracket: settled }) }), ["me", "bot-1"]);
  return [...play({ mode: "turniej" }, [
    { ms: MATCH.countdownMs, phase: MatchPhase.Countdown, patch: () => ({ bracket: semi1(0, 0), players: everyone(["me", "p5"]) }) },
    ...s1, ...s2, walkover, between(fin(0, 0))({ round: 3, scoreA: 2, scoreB: 1, roundResult: "", roundWinner: -1 }), ...fn,
    { ms: 3_000, phase: MatchPhase.Waiting, patch: () => ({ phaseEndsAt: 0, bracket: "" }) },
  ])];
}

// ------------------------------------------------------------------------------------ the walk

interface Shown { kind: BannerKind | AlertKind | "intro"; text: string; words: number; ms: number; texts: Set<string> }

function words(v: MomentView, h: HudState, kind: BannerKind): string {
  if (kind === "roundEnd" || kind === "final") {
    // As `RoundBannerLive` draws it: with the winner the bus saw, not the store's `roundWinner`.
    const c = roundBannerOf({ ...h, roundWinner: itemWinner(v.banner) }, v.model);
    return c ? [...c.eyebrow.map((x) => x.text), c.title, ...c.line.map((x) => x.text)].join(" ") : "";
  }
  const c = bannerCopy(kind, v.model, { myTeam: h.myTeam, bracket: h.bracket, chaser: chaserName(h) });
  return c ? [...c.eyebrow.map((x) => x.text), c.title, ...c.line.map((x) => x.text)].join(" ") : "";
}

/** A freeze's length on the server (`TdmRoom.ts:1594,1701,1828`), to judge the freeze-start window by. */
const freezeMs = (mode: string): number => (mode === "bomb" ? BOMB.buyMs : mode === "ostrzyzeni" ? OSTRZYZENI.prepMs : DUEL.prepMs);

/**
 * Walk one match; the rules that must hold at every read, and what was on screen for how long.
 * Every READ counts (the sub-100 ms event and sync reads too) for the rules; the time on screen is
 * counted per 100 ms step.
 */
function walk(states: HudState[], stale = true): { broken: string[]; shown: Shown[] } {
  const tr = createMomentTracker();
  const broken: string[] = [];
  const shown = new Map<string, Shown>();
  const note = (key: string, kind: Shown["kind"], text: string, step: boolean) => {
    const s = shown.get(key) ?? { kind, text, words: 0, ms: 0, texts: new Set<string>() };
    if (step) s.ms += STEP;
    s.words = Math.max(s.words, countWords(text));
    if (countWords(text) >= s.words) s.text = text;
    s.texts.add(text);
    shown.set(key, s);
  };
  for (const { h, t, server } of asGameWrites(states, stale)) {
    const v = tr.read(h, local(t));
    const step = (t - T0) % STEP === 0;
    const at = `${h.mode} t+${t - T0} (${v.model.moment})`;
    // The freeze start and the role card live in the freeze's first 2000 / 2500 ms of SERVER time
    // (§6.5), shifted at most by the sync that brought them (`SYNC_LAG`), never later.
    if (v.banner && (v.banner.kind === "freeze" || v.banner.kind === "role")) {
      const into = t - (server.phaseEndsAt - freezeMs(server.mode));
      const len = v.banner.kind === "role" ? 2_500 : 2_000;
      if (server.phase !== MatchPhase.Prep || into < SYNC_LAG || into >= len + SYNC_LAG) broken.push(`${at}: ${v.banner.kind} banner ${into} ms into the freeze`);
    }
    const slots = { banners: v.banner ? 1 : 0, pairCards: v.model.moment === "betweenPairs" ? 1 : 0, alerts: v.alert ? 1 : 0 };
    if (slots.banners + slots.pairCards > 1) broken.push(`${at}: a banner and the pair card together`);
    if (v.banner && v.alert && v.alert.kind !== "reconnect") broken.push(`${at}: alert ${v.alert.kind} beside banner ${v.banner.kind}`);
    if (v.banner && v.actionMode !== "progressOnly") broken.push(`${at}: the action slot is not progress-only under a banner`);
    if (v.banner && v.digit) broken.push(`${at}: the countdown digit beside a banner`); // (the zone draws one or the other)
    if (v.banner) {
      const text = words(v, h, v.banner.kind);
      if (!text) broken.push(`${at}: banner ${v.banner.kind} with no words`);
      note(v.banner.key, v.banner.kind, text, step);
    }
    // The reconnect line is not timed: it stands exactly as long as the connection is gone.
    if (v.alert && v.alert.kind !== "reconnect") note(v.alert.key, v.alert.kind, alertCopy(v.alert, h.mode).text, step);
    if (v.intro === "in") { const c = introCopy(h); note(`intro:${v.model.phaseEndsAt}`, "intro", `${c.eyebrow} ${c.title} ${c.line}`, step); }
  }
  // An item's words never change under it: no banner starts with the previous round's words (the
  // event lands before the sync that brings the round, the sides and the result) and then flips.
  for (const [key, s] of shown) if (s.texts.size > 1) broken.push(`${key} changed its words: ${[...s.texts].map((x) => `„${x}”`).join(" → ")}`);
  return { broken, shown: [...shown.values()] };
}

/** The words a banner of `kind` held, one entry per banner (by key). */
const saidBy = (shown: Shown[], kind: Shown["kind"]) => shown.filter((s) => s.kind === kind).map((s) => s.text);

const kinds = (shown: Shown[]) => shown.reduce<Record<string, number>>((m, s) => ({ ...m, [s.kind]: (m[s.kind] ?? 0) + 1 }), {});
/** §6.5, the reading-budget law: timed words ≤ 3 × the seconds on screen. */
const overRead = (shown: Shown[]) => shown.filter((s) => s.words > 3 * (s.ms / 1000)).map((s) => `${s.kind} „${s.text}” ${s.words} words in ${s.ms} ms`);

const MATCHES: [string, () => HudState[], Record<string, number>][] = [
  ["tdm", tdm, { intro: 2, aborted: 1, fight: 1, newMatch: 1 }],
  ["gungame", gungame, { intro: 1, fight: 1, lastWeapon: 2, newMatch: 1 }],
  ["dom", dom, { intro: 1, fight: 1, flag: 2, newMatch: 1 }],
  ["bomb", bomb, { intro: 1, freeze: 12, plant: 5, roundEnd: 11, halftime: 1, final: 1, newMatch: 1 }],
  ["duel", duel, { intro: 1, freeze: 11, roundEnd: 10, final: 1, newMatch: 1 }],
  ["ostrzyzeni", ostrzyzeni, { intro: 1, role: 5, shaved: 1, roundEnd: 4, final: 1, newMatch: 1 }],
  ["turniej", turniej, { intro: 1, freeze: 19, roundEnd: 16, final: 1, newMatch: 1 }],
];

describe("every mode's full sequence, in 100 ms steps (§6.5)", () => {
  for (const [mode, states, expected] of MATCHES) {
    it(`${mode}: at most one banner or pair card, at most one alert, and every item readable (≤ 3 words a second)`, () => {
      // With a stale sync between every event and its patch (the worst case), and without one.
      for (const stale of [true, false]) {
        const { broken, shown } = walk(states(), stale);
        expect(broken).toEqual([]);
        expect(overRead(shown)).toEqual([]);
        expect(kinds(shown)).toEqual(expected);
      }
    }, 30_000);
  }

  it("the halftime, the side swap and the match point read as §5.2 has them", () => {
    const { shown } = walk(bomb());
    const texts = shown.map((s) => s.text);
    expect(texts).toContain("PRZERWA ZMIANA STRON Teraz bronisz wszyscy zaczynają od $800");
    expect(texts).toContain("DRUGA POŁOWA RUNDA 7 BRONISZ");
    expect(texts).toContain("OSTATNIA RUNDA POŁOWY RUNDA 6 ATAKUJESZ");
    expect(texts).toContain("MECZBOL · FADE RUNDA 12 BRONISZ");
    expect(texts).toContain("PRZEGRANA RUNDA DLA TAPER Atak wybity MVP xXPiotrekXx · 3 zabójstwa");
    expect(texts).toContain("OSTATNIA RUNDA RUNDA DLA FADE Atak wybity");
    const duelWalk = walk(duel()).shown;
    const duelTexts = duelWalk.map((s) => s.text);
    expect(duelTexts).toContain("WYGRANA ZMIANA STRON RUNDA DLA FADE Czas — więcej zdrowia Broń zostaje");
    expect(duelTexts).toContain("MECZBOL DLA OBU RUNDA 11");
    // Stage A of the duel: the deciding round (5 : 5 → 6 : 5, no Prep event) is FADE's, not a draw (§6.5).
    expect(saidBy(duelWalk, "final")).toEqual(["OSTATNIA RUNDA RUNDA DLA FADE Czas — więcej zdrowia"]);
    // No round of the duel is called a draw: every one had a winner.
    expect(saidBy(duelWalk, "roundEnd").filter((x) => /REMIS|BEZ ROZSTRZYGNIĘCIA/.test(x))).toEqual([]);
    const tourWalk = walk(turniej()).shown;
    const tour = tourWalk.map((s) => s.text);
    expect(tour).toContain("PÓŁFINAŁ RUNDA 1 Kowal vs xXPiotrekXx");
    expect(tour).toContain("RUNDA DLA ZDZICHU Przeciwnik wyeliminowany"); // semi-final 2, watched: no eyebrow, no carry
    expect(tour).toContain("FINAŁ RUNDA 1 Kowal vs ZDZICHU");
    // The final's last round, with the bracket already settled at Ended: named by the pair, and mine.
    expect(saidBy(tourWalk, "final")).toEqual(["OSTATNIA RUNDA RUNDA DLA Kowal Przeciwnik wyeliminowany"]);
    const inf = walk(ostrzyzeni()).shown.map((s) => s.text);
    expect(inf).toContain("PRZETRWAJ RYSIEK MA MASZYNKĘ");
    expect(inf).toContain("MASZ MASZYNKĘ OGOL WSZYSTKICH");
    expect(inf).toContain("OSTRZYŻONY! TERAZ TY GONISZ");
    expect(inf).toContain("WYGRANA RUNDA DLA OSTRZYŻENI Wszyscy ostrzyżeni"); // round 4: I was the last head, and a chaser by its end
    // Round 5's freeze, after ALL SHAVED: the event still has me shaved; the card waits for the sync and says PRZETRWAJ.
    const roles = saidBy(walk(ostrzyzeni()).shown, "role");
    expect(roles).toEqual(["PRZETRWAJ RYSIEK MA MASZYNKĘ", "PRZETRWAJ RYSIEK MA MASZYNKĘ", "MASZ MASZYNKĘ OGOL WSZYSTKICH", "PRZETRWAJ RYSIEK MA MASZYNKĘ", "PRZETRWAJ RYSIEK MA MASZYNKĘ"]);
    // Bomb, round 7: the halftime freeze never opens on round 6's words.
    expect(saidBy(walk(bomb()).shown, "freeze").filter((x) => x.includes("RUNDA 7"))).toEqual(["DRUGA POŁOWA RUNDA 7 BRONISZ"]);
  }, 30_000);
});
