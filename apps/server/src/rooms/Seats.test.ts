import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BOTS, MAX_PLAYERS, MAX_SPECTATORS, OPEN_MAX_PLAYERS, modeCapacity, openPlayerCap } from "@frankibarber/shared";
import { RoomHarness } from "./testHarness";

/**
 * Who fits in a room, and whether a bot costs a human a seat.
 *
 * Two rules, one per family of modes:
 *
 *  - DEATHMATCH (tdm, ffa) is an OPEN LOBBY. Bots are bodies on top of the human cap, so a room
 *    can run the full house of `MAX_BOTS` and still admit every human up to `OPEN_MAX_PLAYERS`.
 *    Before this, eight bots left four of twelve seats for people — the opposite of what a crowd
 *    wants from the mode it is most likely to bring a crowd to.
 *  - FIXED ROSTER (bomb, dom, boys, gungame, ostrzyżeni, duel) keeps the old arithmetic: twelve
 *    bodies is the design of those modes, a bot spends one of them, and at least two are held for
 *    humans so a room full of bots is never unjoinable.
 *
 * `maxClients` is a THIRD number and stays what it became when spectators arrived: every socket
 * the room admits, i.e. the player cap plus the watchers' headroom.
 */
let h: RoomHarness;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

interface Seats { maxClients: number; playerSlots: number; botCount: number }
const seats = (): Seats => h.room as unknown as Seats;

describe("seats", () => {
  it("gives a deathmatch its eight bots AND the whole human cap", async () => {
    h = await RoomHarness.create({ room: "dm", mode: "tdm", bots: MAX_BOTS });
    expect(seats().botCount, "every bot that was asked for").toBe(MAX_BOTS);
    expect(seats().playerSlots, "and not one seat taken off the humans").toBe(OPEN_MAX_PLAYERS);
    expect(seats().maxClients).toBe(OPEN_MAX_PLAYERS + MAX_SPECTATORS);
    expect(h.state.players.size, "the bots are in the room, not merely promised").toBe(MAX_BOTS);
    expect(h.room.metadata.bots).toBe(MAX_BOTS);
    // The browser divides a bot-inclusive player count by `slots`, so `slots` counts bodies.
    expect(h.room.metadata.slots).toBe(OPEN_MAX_PLAYERS + MAX_BOTS);
  });

  it("lets more humans than the old room held into a deathmatch that is already full of bots", async () => {
    h = await RoomHarness.create({ room: "crowd", mode: "tdm", bots: MAX_BOTS });
    // MAX_PLAYERS + 1 people: one more than the entire old room, with eight bots already in it.
    for (let i = 0; i < MAX_PLAYERS + 1; i++) await h.join(`P${i}`);
    expect(h.state.players.size).toBe(MAX_PLAYERS + 1 + MAX_BOTS);
    const humans = [...h.state.players.values()].filter((p) => !p.bot);
    expect(humans.length).toBe(MAX_PLAYERS + 1);
    // Teams still split evenly with a crowd in the room: no side is more than one body ahead.
    const t0 = [...h.state.players.values()].filter((p) => p.team === 0).length;
    expect(Math.abs(t0 * 2 - h.state.players.size)).toBeLessThanOrEqual(1);
    expect(h.room.handlerErrors).toBe(0);
  }, 60000);

  it("still refuses the human past the cap, and says so", async () => {
    // A small cap so the test does not have to seat thirty-two people to reach the edge.
    h = await RoomHarness.create({ room: "edge", mode: "ffa", bots: 2 });
    const room = h.room as unknown as { playerSlots: number };
    room.playerSlots = 3;
    for (let i = 0; i < 3; i++) await h.join(`P${i}`);
    await expect(h.join("ONE_TOO_MANY")).rejects.toThrow(/room full/);
    expect(h.state.players.size, "the refusal left the room as it was").toBe(3 + 2);
  });

  it("keeps a bot in a seat in the fixed-roster modes", async () => {
    h = await RoomHarness.create({ room: "fixed", mode: "bomb", bots: MAX_BOTS });
    expect(seats().botCount, "every bot asked for, since eight fits under the roster cap").toBe(MAX_BOTS);
    expect(seats().playerSlots, "and each one spends a seat").toBe(MAX_PLAYERS - MAX_BOTS);
    expect(seats().maxClients).toBe(MAX_PLAYERS - MAX_BOTS + MAX_SPECTATORS);
    expect(h.room.metadata.slots, "twelve bodies however they are split").toBe(MAX_PLAYERS);
    // A greedy request is still bounded twice over: by `MAX_BOTS` and, if that ever rose above ten,
    // by the two seats a fixed-roster room always holds open for people.
    await h.dispose();
    h = await RoomHarness.create({ room: "fixed-greedy", mode: "bomb", bots: 99 });
    expect(seats().botCount).toBe(Math.min(MAX_BOTS, MAX_PLAYERS - 2));
    expect(seats().playerSlots).toBe(MAX_PLAYERS - Math.min(MAX_BOTS, MAX_PLAYERS - 2));
  });

  it("agrees with the shared capacity table the client reads", () => {
    expect(modeCapacity("tdm")).toBe(OPEN_MAX_PLAYERS);
    expect(modeCapacity("ffa")).toBe(OPEN_MAX_PLAYERS);
    expect(modeCapacity("bomb")).toBe(MAX_PLAYERS);
    expect(modeCapacity("duel")).toBe(2);
    // A host may move the open cap with FB_MAX_PLAYERS; nonsense falls back, extremes clamp.
    expect(modeCapacity("tdm", openPlayerCap("48"))).toBe(48);
    expect(modeCapacity("tdm", openPlayerCap("banana"))).toBe(OPEN_MAX_PLAYERS);
    expect(modeCapacity("tdm", openPlayerCap("100000"))).toBe(64);
    expect(modeCapacity("bomb", openPlayerCap("48")), "a fixed roster ignores it").toBe(MAX_PLAYERS);
  });
});
