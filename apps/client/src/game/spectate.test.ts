import { describe, expect, it } from "vitest";
import { MatchPhase, type Team } from "@frankibarber/shared";
import { CARD_OUT_MS, DEATH_BEAT_MS, NO_SPECTATE, TARGET_HOLD_MS, candidates, cycle, spectating, stepSpectate, type SpectateCtx, type SpectateRow } from "./spectate";

/**
 * The spectator of a dead player (UI_U_SPEC §7 P1 (h)): whom the camera follows, in which order,
 * and what happens when that player dies too. Pure, so every rule is a table of rows.
 */
const row = (id: string, team: Team, o: Partial<SpectateRow> = {}): SpectateRow => ({ id, name: id.toUpperCase(), team, alive: true, connected: true, ...o });

const bomb = (players: SpectateRow[]): SpectateCtx => ({ myId: "me", myTeam: 0, mode: "bomb", players, bracket: "" });

describe("spectate", () => {
  it("cycles alive teammates only", () => {
    const ctx = bomb([row("me", 0, { alive: false }), row("m2", 0), row("m1", 0), row("m3", 0, { alive: false }), row("e1", 1), row("e2", 1)]);
    expect(candidates(ctx).map((r) => r.id)).toEqual(["m1", "m2"]);
    expect(cycle(ctx, null, 1)).toBe("m1");
    expect(cycle(ctx, "m1", 1)).toBe("m2");
    expect(cycle(ctx, "m2", 1), "the ring wraps").toBe("m1");
    expect(cycle(ctx, "m1", -1), "PPM walks back").toBe("m2");
    expect(cycle(ctx, null, -1)).toBe("m2");
  });

  it("skips disconnected", () => {
    const ctx = bomb([row("me", 0, { alive: false }), row("m1", 0, { connected: false }), row("m2", 0), row("e1", 1)]);
    expect(candidates(ctx).map((r) => r.id)).toEqual(["m2"]);
    expect(stepSpectate(NO_SPECTATE, ctx, 0).targetId).toBe("m2");
    // A target who drops out is not held on: the view moves at once.
    const gone = bomb([row("me", 0, { alive: false }), row("m1", 0), row("m2", 0, { connected: false })]);
    expect(stepSpectate({ targetId: "m2", lostAt: 0 }, gone, 5).targetId).toBe("m1");
  });

  it("falls back to enemies when the team is dead", () => {
    const ctx = bomb([row("me", 0, { alive: false }), row("m1", 0, { alive: false }), row("e2", 1), row("e1", 1)]);
    expect(candidates(ctx).map((r) => r.id)).toEqual(["e1", "e2"]);
    // The 1 v 1 is that case from the first death: my side is me.
    const duel: SpectateCtx = { myId: "me", myTeam: 1, mode: "duel", players: [row("me", 1, { alive: false }), row("them", 0)], bracket: "" };
    expect(stepSpectate(NO_SPECTATE, duel, 0).targetId).toBe("them");
  });

  it("turniej spectates only the pair", () => {
    // Semi-final 1 on the board: ZDZICHU vs RYSIEK. Kowal (me) and PIOTREK wait, dead, on team 0.
    const bracket = "4|0;ZDZICHU|RYSIEK|2|1|-;KOWAL|PIOTREK|0|0|-;||0|0|-";
    const players = [
      row("me", 0, { name: "KOWAL", alive: false }), row("p5", 0, { name: "PIOTREK", alive: false }),
      row("b1", 0, { name: "ZDZICHU" }), row("b3", 1, { name: "RYSIEK" }),
    ];
    const ctx: SpectateCtx = { myId: "me", myTeam: 0, mode: "turniej", players, bracket };
    expect(candidates(ctx).map((r) => r.id), "a bystander watches both players of the pair, and only them").toEqual(["b1", "b3"]);
    // A bystander who happens to be alive in the room (a stale row) is still nobody's view.
    const stale = { ...ctx, players: [...players.slice(0, 1), row("p5", 0, { name: "PIOTREK" }), ...players.slice(2)] };
    expect(candidates(stale).map((r) => r.id)).toEqual(["b1", "b3"]);
    // A pair player who is down watches the opponent.
    const inPair: SpectateCtx = { myId: "b1", myTeam: 0, mode: "turniej", players: [players[0], players[1], row("b1", 0, { name: "ZDZICHU", alive: false }), players[3]], bracket };
    expect(candidates(inPair).map((r) => r.id)).toEqual(["b3"]);
    // Between pairs (the bracket over, or no bracket at all) there is nobody to watch.
    expect(candidates({ ...ctx, bracket: "" })).toEqual([]);
  });

  it("target death → next target after 1000 ms", () => {
    const live = [row("me", 0, { alive: false }), row("m1", 0), row("m2", 0)];
    let s = stepSpectate(NO_SPECTATE, bomb(live), 0);
    expect(s.targetId).toBe("m1");
    const m1Down = bomb([live[0], row("m1", 0, { alive: false }), live[2]]);
    s = stepSpectate(s, m1Down, 10_000);
    expect(s, "the view holds on the body").toEqual({ targetId: "m1", lostAt: 10_000 });
    expect(stepSpectate(s, m1Down, 10_000 + TARGET_HOLD_MS - 1).targetId).toBe("m1");
    s = stepSpectate(s, m1Down, 10_000 + TARGET_HOLD_MS);
    expect(s).toEqual({ targetId: "m2", lostAt: 0 });
    // A step that changes nothing returns the same object (the game writes the store only on change).
    expect(stepSpectate(s, m1Down, 20_000)).toBe(s);
  });

  it("no target → null", () => {
    const allDown = bomb([row("me", 0, { alive: false }), row("m1", 0, { alive: false }), row("e1", 1, { alive: false })]);
    expect(stepSpectate(NO_SPECTATE, allDown, 0).targetId).toBeNull();
    expect(cycle(allDown, null, 1)).toBeNull();
    // The last one standing dies: after the hold there is nobody, and the answer is null.
    const lastDown = { targetId: "m1", lostAt: 1 };
    expect(stepSpectate(lastDown, allDown, 1 + TARGET_HOLD_MS).targetId).toBeNull();
  });

  it("watches only in a round mode, after the card's beat, never on a respawn timer", () => {
    const base = { mode: "bomb" as const, phase: MatchPhase.Playing, alive: false, respawnAt: 0, diedAt: 1_000, noCard: false };
    expect(spectating({ ...base, now: 1_000 + CARD_OUT_MS - 1 })).toBe(false);
    expect(spectating({ ...base, now: 1_000 + CARD_OUT_MS })).toBe(true);
    expect(spectating({ ...base, now: 1_000, noCard: true }), "a late join watches at once").toBe(true);
    expect(spectating({ ...base, now: 99_000, respawnAt: 5_000 }), "a respawn on a timer counts down instead").toBe(false);
    expect(spectating({ ...base, now: 99_000, mode: "tdm" })).toBe(false);
    expect(spectating({ ...base, now: 99_000, phase: MatchPhase.Ended })).toBe(false);
    // The round is over (a duel ends on the kill): no card to wait for, only the death's own beat —
    // the 5 s duel break would otherwise end before anybody was watched.
    const brk = { ...base, phase: MatchPhase.Prep, inBreak: true };
    expect(spectating({ ...brk, now: 1_000 + DEATH_BEAT_MS - 1 })).toBe(false);
    expect(spectating({ ...brk, now: 1_000 + DEATH_BEAT_MS })).toBe(true);
  });
});
