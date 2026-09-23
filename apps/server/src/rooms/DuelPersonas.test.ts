import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DUEL, MatchPhase, WEAPON_PRICES } from "@frankibarber/shared";
import type { PlayerState } from "../schema";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * FOUR PEOPLE PLAY THE 1 v 1, and none of them plays it the way the rules were written for.
 *
 * Every other duel test drives the mode the way its author imagined it. These four are the ones
 * who break modes: they are buy BEHAVIOURS, and each is a real habit that the CS economy either
 * survives or does not.
 *
 *   KASIA     never opens the shop at all. She is the test of the free pistol and of the floor:
 *             a player who buys nothing must never be unable to play, and must never be the
 *             reason a match cannot end.
 *   MAREK     buys the best gun he can afford the moment the freeze starts, every round. He is
 *             the test that a full buy is reachable and that the wallet never goes negative.
 *   ZBYSZEK   is slow: he presses the last button with a second of the freeze left. He is the
 *             test that the window really is fifteen seconds and not "fifteen seconds if you are
 *             quick".
 *   DAWID     does not buy in the freeze at all — he runs out and buys while the round is live,
 *             the way a CS player fixes a forgotten plate. He is the test of the five-second tail
 *             AND of its end: one second past it, the shop must be shut.
 *
 * The assertions are about the MODE holding up under each habit, not about who wins.
 */
let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

type Damage = { applyDamage(attacker: PlayerState, victimId: string, amount: number, headshot: boolean, client: undefined, weapon: string): void };
const P = (c: FakeClient): PlayerState => h.player(c.sessionId);
const kill = (killer: PlayerState, victim: PlayerState, weapon = "rifle"): void => {
  victim.protectedUntil = 0;
  (h.room as unknown as Damage).applyDamage(killer, victim.id, 999, false, undefined, weapon);
};
const buy = async (c: FakeClient, item: string): Promise<void> => { h.send(c, "buy", { item }); await h.advance(50); };
/**
 * The best PRIMARY (slot 1) this wallet can pay for, or null — "what a player would click".
 * The machine pistol is deliberately not on it: it is a sidearm, and "she could afford a sidearm"
 * is not the question the floor exists to answer.
 */
const affordablePrimary = (p: PlayerState): string | null => {
  const list = ["sniper", "rifle", "carbine", "smg", "shotgun"] as const;
  return list.find((w) => WEAPON_PRICES[w] <= p.money) ?? null;
};

async function twoPlayers(): Promise<{ a: FakeClient; b: FakeClient }> {
  h = await RoomHarness.create({ room: "personas", mode: "duel", map: "gora", bots: 0 });
  const a = await h.join("Alpha"), b = await h.join("Bravo");
  await h.until(MatchPhase.Prep);
  return { a, b };
}

describe("four people who buy differently", () => {
  it("KASIA never opens the shop, and is never left unable to play", async () => {
    const { a, b } = await twoPlayers();
    // Six rounds, and Kasia (a) buys nothing in any of them. She loses them all: the worst case.
    for (let round = 1; round <= DUEL.wins; round++) {
      expect(P(a).owned.length, "she always has the free sidearm").toBeGreaterThan(0);
      expect(P(a).weapon, "and it is in her hands").toBeTruthy();
      // Her money is the pistol round's, or AT LEAST the floor — never nothing. (It is usually
      // more: a player who never spends banks every loss bonus, which is its own kind of player
      // and exactly why the floor is a minimum and not an allowance.)
      const half = (round - 1) % DUEL.halfRounds === 0;
      if (half) expect(P(a).money, `round ${round} opens a half`).toBe(DUEL.economy.start);
      else expect(P(a).money, `round ${round}`).toBeGreaterThanOrEqual(DUEL.economy.floor);
      await h.until(MatchPhase.Playing);
      kill(P(b), P(a));
      await h.tick(2);
      if (round < DUEL.wins) await h.advance(DUEL.breakMs + 100);
    }
    // The match still reaches an end: a player who never buys does not stall the mode.
    expect(h.state.phase).toBe(MatchPhase.Ended);
    expect(h.room.handlerErrors).toBe(0);
  }, 60000);

  it("MAREK full-buys every round the money allows, and the wallet never goes negative", async () => {
    const { a, b } = await twoPlayers();
    const bought: string[] = [];
    for (let round = 1; round <= 4; round++) {
      const want = affordablePrimary(P(a));
      bought.push(want ?? "—"); // one entry per round, so `bought[0]` is the PISTOL round
      if (want) await buy(a, want);
      if (P(a).money >= 1000) await buy(a, "heavy");
      expect(P(a).money, "a shop that would overdraw you refuses instead").toBeGreaterThanOrEqual(0);
      await h.until(MatchPhase.Playing);
      kill(P(a), P(b));
      await h.tick(2);
      await h.advance(DUEL.breakMs + 100);
    }
    // The pistol round buys no PRIMARY — $800 is a sidearm and a plate, as in CS — and by the
    // third round a win streak has paid for a real gun.
    expect(bought[0], "no slot-1 weapon costs pistol money").toBe("—");
    expect(bought.filter((w) => w !== "—").length, "and the winner arms up quickly").toBeGreaterThanOrEqual(2);
    expect(h.room.handlerErrors).toBe(0);
  }, 60000);

  it("ZBYSZEK buys with a second of the freeze left, and the shop takes it", async () => {
    const { a } = await twoPlayers();
    P(a).money = 9000;
    await h.advance(DUEL.prepMs - 1000);
    expect(h.state.phase, "still frozen").toBe(MatchPhase.Prep);
    await buy(a, "rifle");
    expect(P(a).owned.includes("rifle"), "a slow buyer is still a buyer").toBe(true);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("DAWID buys on the move after the round starts, until CS's buy time runs out", async () => {
    const { a } = await twoPlayers();
    P(a).money = 9000;
    await h.until(MatchPhase.Playing);
    await h.advance(1000);
    await buy(a, "rifle");
    expect(P(a).owned.includes("rifle"), "the tail is real").toBe(true);
    // One second past the tail, the shop is shut — and says so rather than silently ignoring him.
    await h.advance(DUEL.buyTailMs);
    const before = P(a).money;
    await buy(a, "heavy");
    expect(P(a).armor, "past the tail nothing is sold").toBe(0);
    expect(P(a).money, "and nothing is taken").toBe(before);
    const refusal = h.sentOf(a, "shop").at(-1)?.payload as { ok: boolean; reason?: string } | undefined;
    expect(refusal?.ok).toBe(false);
    expect(refusal?.reason, "the client is told WHY, so the HUD can say it").toBe("closed");
    expect(h.room.handlerErrors).toBe(0);
  });

  it("KASIA against MAREK: the floor keeps the poor side in a gun, not in a pistol", async () => {
    const { a, b } = await twoPlayers();
    // Marek wins the first two rounds; Kasia buys nothing and loses them.
    for (let round = 1; round <= 2; round++) {
      await h.until(MatchPhase.Playing);
      kill(P(b), P(a));
      await h.tick(2);
      await h.advance(DUEL.breakMs + 100);
    }
    // Round three: the loser has at least the floor, which is a real primary and a plate...
    expect(P(a).money).toBeGreaterThanOrEqual(DUEL.economy.floor);
    expect(affordablePrimary(P(a)), "she can afford a proper gun").toBeTruthy();
    // ...and the winner is richer, which is the point of an economy.
    expect(P(b).money).toBeGreaterThan(P(a).money);
    expect(h.room.handlerErrors).toBe(0);
  }, 60000);
});
