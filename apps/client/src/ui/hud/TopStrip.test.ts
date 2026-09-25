import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOMB, DUEL, MatchPhase, OSTRZYZENI, type BombData, type Team } from "@frankibarber/shared";
import { initialHud, type HudState, type ScoreRow } from "../../game/store";
import { derivePhase } from "./phase";
import { countWords } from "./format";
import { PIP_MAX, PipRow, badgeUp, clockFace, cutNick, ffaSides, pipsOf, row2Of, rungLabel, teamSlots } from "./TopStrip";
import { modeLineOf } from "./ModeLine";
import { actionOf } from "./ActionPrompt";

/**
 * The top strip's rules, pinned without a DOM (docs/UI_U_SPEC.md §7 P2 ACCEPTANCE): which side is
 * drawn where, who the FFA strip compares me with, the pips, and the counts that must never become
 * words. The strip component only lays these out.
 */

const NOW = 1_000_000;
const st = (over: Partial<HudState>): HudState => ({ ...initialHud, serverNow: NOW, ...over });
const row = (id: string, team: Team, o: Partial<ScoreRow> = {}): ScoreRow => ({
  id, name: id, team, kills: 0, deaths: 0, assists: 0, score: 0, ping: 20, alive: true, connected: true, money: 0, bot: false, shaved: false, haircut: "", ...o,
});
const bomb = (over: Partial<BombData> = {}): BombData => ({
  round: 5, attackTeam: 0, stage: "carried", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: NOW + 60_000, actor: "", progress: 0, result: "", ...over,
});
/** Strip the tags: what a player (and the gallery's word count) reads of some markup. */
const textOf = (html: string): string => html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ");

describe("sides", () => {
  it("stripSides puts my team left, score-a stays team 0", () => {
    const model = derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb() }));
    // Team 0: my side is the first slot, drawn first.
    const [a0, b0] = teamSlots(model, 0);
    expect([a0.team, a0.testid, a0.order, a0.left, a0.mine]).toEqual([0, "score-a", 0, true, true]);
    expect([b0.team, b0.testid, b0.order, b0.left, b0.mine]).toEqual([1, "score-b", 2, false, false]);
    // Team 1 (§5.2 row 15, myTeam 1): the DOM keeps score-a on team 0 and score-b on team 1, and
    // only the CSS `order` moves team 1 to the left of the clock (order 1).
    const [a1, b1] = teamSlots(model, 1);
    expect([a1.team, a1.testid, a1.order, a1.left, a1.mine]).toEqual([0, "score-a", 2, false, false]);
    expect([b1.team, b1.testid, b1.order, b1.left, b1.mine]).toEqual([1, "score-b", 0, true, true]);
    // A tournament bystander has no side of their own on the board.
    const t = teamSlots(derivePhase(st({ mode: "turniej", phase: MatchPhase.Playing })), 0, -1);
    expect(t.map((s) => s.mine)).toEqual([false, false]);
  });

  it("ffa: me left, best other right", () => {
    const players = [row("p5", 0, { kills: 18 }), row("me", 0, { kills: 12 }), row("p6", 0, { kills: 9 })];
    const trailing = ffaSides(players, "me", "ffa");
    expect([trailing.me?.id, trailing.best?.id]).toEqual(["me", "p5"]);
    // When I lead, the right side is the runner-up — never me against myself.
    const leading = ffaSides([row("me", 0, { kills: 20 }), ...players.filter((r) => r.id !== "me")], "me", "ffa");
    expect([leading.me?.id, leading.best?.id]).toEqual(["me", "p5"]);
    // Alone on the server: nobody to compare with.
    expect(ffaSides([row("me", 0)], "me", "ffa").best).toBeNull();
    // Gun game compares rungs (`score`), not kills, and prints them as `${rung + 1}/${n}`.
    const gg = ffaSides([row("me", 0, { score: 6, kills: 30 }), row("p5", 0, { score: 8, kills: 10 }), row("p1", 0, { score: 5, kills: 40 })], "me", "gungame");
    expect(gg.best?.id).toBe("p5");
    expect([rungLabel(0), rungLabel(6), rungLabel(99)]).toEqual(["1/14", "7/14", "14/14"]);
    // Nicks keep their own case and are cut at 12 characters.
    expect([cutNick("xXPiotrekXx"), cutNick("Kasia_Brzytwa_77")]).toEqual(["xXPiotrekXx", "Kasia_Brzyt…"]);
  });
});

describe("pips", () => {
  it("pips: alive / dead / disconnected / >5 collapses", () => {
    const players = [
      row("a", 0), row("b", 0, { alive: false }), row("c", 0), row("gone", 0, { alive: false, connected: false }),
      row("x", 1), row("y", 1), row("z", 1), row("w", 1), row("v", 1), row("u", 1, { alive: false }),
    ];
    // Team 0: two alive, one dead, and no pip at all for the player who left. The living come first.
    expect(pipsOf(players, 0, "bomb", "")).toEqual({ pips: ["alive", "alive", "dead"], alive: 2, many: false });
    // Team 1 has six: above PIP_MAX the side is one pip and the count.
    const many = pipsOf(players, 1, "bomb", "");
    expect(PIP_MAX).toBe(5);
    expect(many).toEqual({ pips: ["alive"], alive: 5, many: true });
    // Everyone down: the one pip is the dead one.
    const wiped = pipsOf(players.map((r) => ({ ...r, alive: false })), 1, "bomb", "");
    expect([wiped.pips, wiped.alive]).toEqual([["dead"], 0]);
    // Exactly five stay five.
    expect(pipsOf(players.slice(4, 9), 1, "bomb", "").pips).toHaveLength(5);
  });

  it("alive counts live in aria-label and data-count, never in text", () => {
    for (const pips of [pipsOf([row("a", 0), row("b", 0, { alive: false })], 0, "bomb", ""), pipsOf([0, 1, 2, 3, 4, 5, 6].map((i) => row(`p${i}`, 0)), 0, "bomb", "")]) {
      const html = renderToStaticMarkup(createElement(PipRow, { pips, testid: "alive-a" }));
      expect(html).toContain('data-testid="alive-a"');
      expect(html).toContain(`data-count="${pips.alive}"`);
      expect(html).toContain(`aria-label="ŻYWI: ${pips.alive}"`);
      expect(textOf(html).trim(), html).toBe("");
      expect(countWords(textOf(html))).toBe(0);
    }
  });

  it("turniej bystanders have no pip", () => {
    // The pair on the board is Kowal (team 0) against RYSIEK (team 1); ZDZICHU and Kasia wait their
    // turn — dead, and (in the room) seated on team 0.
    const bracket = "4|1;Kowal|Piotrek|6|3|a;Kowal|RYSIEK|1|0|-;ZDZICHU|Kasia|0|0|-";
    const players = [row("Kowal", 0), row("RYSIEK", 1, { alive: false }), row("ZDZICHU", 0, { alive: false }), row("Kasia", 0, { alive: false }), row("Piotrek", 1, { alive: false })];
    expect(pipsOf(players, 0, "turniej", bracket)).toEqual({ pips: ["alive"], alive: 1, many: false });
    expect(pipsOf(players, 1, "turniej", bracket)).toEqual({ pips: ["dead"], alive: 0, many: false });
    // With no pair on the board (between pairs, or after the final) nobody has a pip.
    expect(pipsOf(players, 0, "turniej", "").pips).toEqual([]);
    // The same rows in a duel room count by team, as a duel has no bystanders.
    expect(pipsOf(players, 0, "duel", "").pips).toHaveLength(3);
  });
});

describe("the clock and row 2", () => {
  it("clock face: the word, dim, amber, the last 3 s of a freeze, and the fuse", () => {
    expect(clockFace(derivePhase(st({ mode: "tdm", phase: MatchPhase.Waiting })), NOW).text).toBe("ROZGRZEWKA");
    const freeze = derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 11_200 }));
    expect(clockFace(freeze, NOW)).toMatchObject({ kind: "freeze", text: "0:12", tick: 0 });
    // The last three seconds pulse once per second, keyed on the second shown.
    expect([3_000, 2_600, 2_000, 1, 0].map((left) => clockFace(freeze, NOW + 11_200 - left).tick)).toEqual([3, 3, 2, 1, 0]);
    const fuse = derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ stage: "planted", site: "A", endsAt: NOW + 27_400 }) }));
    expect(clockFace(fuse, NOW)).toMatchObject({ kind: "bomb", text: "0:28", fast: false });
    expect(clockFace(fuse, NOW + 27_400 - BOMB.defuseMs + 1).fast, "2 Hz under BOMB.defuseMs").toBe(true);
    expect(clockFace(derivePhase(st({ mode: "tdm", phase: MatchPhase.Playing, matchEndsAt: NOW + 252_000 })), NOW).text).toBe("4:12");
  });

  it("row 2 per mode, and the role badge's window", () => {
    const h = { mode: "bomb" as const, players: [row("me", 0)], bracket: "", myId: "me" };
    const text = (r: ReturnType<typeof row2Of>) => r.parts.map((p) => `${p.testid}:${p.text}`).join(" ");
    expect(text(row2Of(derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + 5_000, bomb: bomb({ stage: "buy" }) })), h))).toBe("round-label:RUNDA 5 / 12");
    expect(text(row2Of(derivePhase(st({ mode: "tdm", phase: MatchPhase.Waiting })), { ...h, mode: "tdm" }))).toBe("warmup-players:GRACZE 1/2");
    expect(text(row2Of(derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 5_000, round: 1 })), { ...h, mode: "duel" }))).toBe(`round-label:RUNDA 2 score-goal:DO ${DUEL.wins}`);
    const inf = row2Of(derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: NOW + 5_000, round: 1 })),
      { ...h, mode: "ostrzyzeni", players: [row("me", 0), row("a", 0), row("b", 1, { shaved: true })] });
    expect([text(inf), inf.wide]).toEqual([`infection-line:RUNDA 2 / ${OSTRZYZENI.rounds} · 2 NIEOSTRZYŻONYCH`, true]);
    const tour = "4|0;Kowal|xXPiotrekXx|1|0|-;ZDZICHU|RYSIEK|0|0|-;||0|0|-";
    const pair = [row("Kowal", 0), row("xXPiotrekXx", 1)];
    const tFreeze = derivePhase(st({ mode: "turniej", phase: MatchPhase.Prep, phaseEndsAt: NOW + 5_000, round: 1, bracket: tour, players: pair }));
    expect(text(row2Of(tFreeze, { ...h, mode: "turniej", bracket: tour, players: pair }))).toBe("bracket-strip:PÓŁFINAŁ · RUNDA 2");
    // Between pairs (everyone down, the pair decided): the strip reads „DRABINKA”, the card says the rest.
    const tBetween = derivePhase(st({ mode: "turniej", phase: MatchPhase.Prep, phaseEndsAt: NOW + 5_000, round: 9, bracket: tour, roundResult: "ELIMINATED" }));
    expect([tBetween.moment, text(row2Of(tBetween, { ...h, mode: "turniej", bracket: tour }))]).toEqual(["betweenPairs", "bracket-strip:DRABINKA"]);
    // The badge: through the freeze and the first 5 s live, then gone; never without a side.
    const live = (into: number) => badgeUp(derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ roundEndsAt: NOW + BOMB.roundMs - into }) })), st({ bomb: bomb({ roundEndsAt: NOW + BOMB.roundMs - into }) }));
    expect([live(0), live(4_999), live(5_000)]).toEqual([true, true, false]);
    expect(badgeUp(derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 5_000 })), st({}))).toBe(false);
  });
});

describe("the strip stack below it: the mode line and the action slot (§5.3)", () => {
  const live = (b: Partial<BombData>, over: Partial<HudState> = {}) => {
    const h = st({ mode: "bomb", phase: MatchPhase.Playing, myId: "me", myTeam: 0, connected: true, alive: true, bomb: bomb(b),
      players: [row("me", 0, { name: "Kowal" }), row("p1", 0, { name: "Kasia_Brzytwa" }), row("p5", 1, { name: "xXPiotrekXx" })], ...over });
    return { h, model: derivePhase(h) };
  };
  const line = (b: Partial<BombData>, over: Partial<HudState> = {}) => { const { h, model } = live(b, over); return modeLineOf(model, h)?.text ?? null; };
  const act = (b: Partial<BombData>, over: Partial<HudState> = {}) => { const { h, model } = live(b, over); return actionOf(model, h)?.text ?? null; };

  it("every bomb line today's HUD prints has its home, in ≤ 6 words", () => {
    const lines = [
      line({ stage: "planted", site: "A" }),                                  // attack, planted
      line({ stage: "planted", site: "A" }, { myTeam: 1 }),                   // defence, planted
      line({ carrier: "me" }),                                                // carrier
      line({}, { myTeam: 1 }),                                                // defence, not planted
      line({ stage: "dropped" }),                                             // attack, dropped
      line({ carrier: "p1" }),                                                // attack, escort
      line({ stage: "carried", actor: "p1", progress: 0.4 }),                 // a teammate plants
      line({ stage: "planted", site: "A", actor: "p5", progress: 0.3 }),      // the enemy defuses
      line({ stage: "planted", site: "B", actor: "p1", progress: 0.3 }, { myTeam: 1, players: [row("p1", 1, { name: "Kasia_Brzytwa" })] }),
    ];
    expect(lines).toEqual([
      "ŁADUNEK NA A — PILNUJ", "ŁADUNEK NA A — ROZBRÓJ [T]", "MASZ ŁADUNEK", "BROŃ PUNKTÓW A / B", "ŁADUNEK UPUSZCZONY — PODNIEŚ GO",
      "OSŁANIAJ NIOSĄCEGO ŁADUNEK", "Kasia_Brzytwa PODKŁADA", "WRÓG ROZBRAJA", "Kasia_Brzytwa ROZBRAJA",
    ]);
    for (const l of lines) expect(countWords(l!), l!).toBeLessThanOrEqual(6);
    // A freeze, a break and Ended have no bomb line; the strip and the banner say it (§8.4).
    const freeze = st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + 9_000, bomb: bomb({ stage: "buy" }) });
    expect(modeLineOf(derivePhase(freeze), freeze)).toBeNull();
    const brk = st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + 4_000, bomb: bomb({ stage: "resolved", result: "BOMB DEFUSED" }) });
    expect(modeLineOf(derivePhase(brk), brk)).toBeNull();
  });

  it("my own hands: the action slot's prompts and bars", () => {
    expect(act({ carrier: "me" }, { siteHere: "A" })).toBe("PRZYTRZYMAJ [T] · PODŁÓŻ");
    expect(act({ carrier: "me" }), "off a site there is nothing to press").toBeNull();
    expect(act({ stage: "carried", actor: "me", progress: 0.5 })).toBe("PODKŁADANIE");
    expect(act({ stage: "planted", site: "A" }, { myTeam: 1, nearBomb: true })).toBe("PRZYTRZYMAJ [T] · ROZBRÓJ");
    const { h, model } = live({ stage: "planted", site: "A", actor: "me", progress: 0.45 }, { myTeam: 1 });
    expect(actionOf(model, h)).toMatchObject({ kind: "defuse", text: "ROZBRAJANIE", bar: 0.45, progress: true });
    expect(act({ stage: "planted", site: "A" }, { myTeam: 1, nearBomb: true, alive: false }), "the dead have no hands").toBeNull();
    // Domination (§5.2 row 8, `multiplayer.spec.ts:535`): my capture is my own progress bar.
    const flags = [{ id: "A", name: "DEPOT", owner: -1, capTeam: 0, cap: 0.62, contested: false }];
    const dom = st({ mode: "dom", phase: MatchPhase.Playing, alive: true, myTeam: 0, flags, inFlag: 0 });
    expect(actionOf(derivePhase(dom), dom)).toMatchObject({ kind: "capture", text: "PRZEJMUJESZ A · 62%", bar: 0.62, progress: true });
    for (const v of [actionOf(derivePhase(dom), dom), actionOf(model, h)]) expect(countWords(v!.text)).toBeLessThanOrEqual(5);
  });

  it("the other modes' lines: the goal, the match point, the chase", () => {
    const warm = st({ mode: "tdm", phase: MatchPhase.Waiting, connected: true, players: [row("me", 0)] });
    expect(modeLineOf(derivePhase(warm), warm)).toMatchObject({ testid: "objective", text: "PIERWSI DO 40 ZABÓJSTW" });
    const mp = (a: number, b: number) => { const d = st({ mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: NOW + 30_000, scoreA: a, scoreB: b }); return modeLineOf(derivePhase(d), d); };
    expect(mp(DUEL.wins - 1, 4)).toMatchObject({ testid: "duel-line", text: "MECZBOL · FADE", tone: "warn" });
    expect(mp(DUEL.wins - 1, DUEL.wins - 1)?.text, "fixes „BRONISZ MECZBOLU”").toBe("MECZBOL DLA OBU");
    expect(mp(2, 1)).toBeNull();
    const chase = (myTeam: Team) => { const o = st({ mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: NOW + 6_000, myTeam }); return modeLineOf(derivePhase(o), o)?.text; };
    expect([chase(OSTRZYZENI.survivorTeam), chase(OSTRZYZENI.shavedTeam)]).toEqual(["UCIEKAJ PRZED MASZYNKĄ", "GOŃ I GOL"]);
    const wave = st({ mode: "tdm", phase: MatchPhase.Prep, phaseEndsAt: NOW + 3_000 });
    expect(modeLineOf(derivePhase(wave), wave)).toMatchObject({ testid: "mode-line", text: "ZAMROŻENIE" });
  });
});
