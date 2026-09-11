import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, MAX_PLAYERS, MAX_SPECTATORS, S2C } from "@frankibarber/shared";
import { RoomHarness } from "./testHarness";

/**
 * A spectator (`/viewer`) is a client the room does not model.
 *
 * The whole feature is one absence: no `PlayerState`. Everything a watcher needs is already leaving
 * the room — Colyseus replicates the full match state to every connected client — so watching costs
 * a socket and nothing else. That also means the guarantees worth testing are all NEGATIVE: the
 * watcher must not appear on the scoreboard, must not be counted towards starting a match, must not
 * take a seat a player wanted, and must not be able to do anything by sending a message.
 */
let h: RoomHarness;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { await h.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("watching a match without playing it", () => {
  it("joins without a body, a row on the scoreboard, or a seat", async () => {
    h = await RoomHarness.create({ room: "watch", mode: "tdm" });
    const player = await h.join("Alpha");
    const before = h.state.players.size;
    const viewer = await h.join("Widz", { spectator: true });

    expect(h.state.players.size, "the watcher added no player").toBe(before);
    expect(h.state.players.has(viewer.sessionId)).toBe(false);
    // It still gets the clock: without it a viewer would interpolate against a time of its own.
    expect(h.sentOf(viewer, S2C.Welcome).length).toBe(1);
    expect(h.state.players.has(player.sessionId)).toBe(true);
  });

  it("does not count towards the players a match needs", async () => {
    h = await RoomHarness.create({ room: "count", mode: "tdm" });
    const room = h.room as unknown as { connectedPlayers: number };
    await h.join("Widz", { spectator: true });
    await h.join("Widz2", { spectator: true });
    expect(room.connectedPlayers, "two watchers are still nobody").toBe(0);
    await h.join("Alpha");
    expect(room.connectedPlayers).toBe(1);
  });

  it("leaves the player seats alone and takes its own", async () => {
    h = await RoomHarness.create({ room: "seats", mode: "tdm", bots: 2 });
    const room = h.room as unknown as { maxClients: number; playerSlots: number };
    expect(room.playerSlots).toBe(MAX_PLAYERS - 2);
    expect(room.maxClients).toBe(MAX_PLAYERS - 2 + MAX_SPECTATORS);
  });

  it("does not make the room look full to somebody who wants to play", async () => {
    // `clients` counts sockets, so without the published count six watchers would read as 6/12 in
    // the room browser and as six players on /health.
    h = await RoomHarness.create({ room: "browser", mode: "tdm" });
    await h.join("Alpha");
    for (let i = 0; i < 4; i++) await h.join(`Widz${i}`, { spectator: true });
    const meta = (h.room as unknown as { metadata: { players: number; slots: number } }).metadata;
    expect(meta.players, "one player, four watchers").toBe(1);
    expect(meta.slots).toBe(MAX_PLAYERS);
  });

  it("cannot move the match by sending anything", async () => {
    h = await RoomHarness.create({ room: "mute", mode: "tdm" });
    await h.join("Alpha");
    const viewer = await h.join("Widz", { spectator: true });
    const before = h.state.players.size;
    // Every handler starts by looking the sender up in `state.players`; a watcher is not there.
    h.send(viewer, C2S.Equip, 1);
    h.send(viewer, C2S.Reload, {});
    await h.tick();
    expect(h.state.players.size).toBe(before);
    expect(h.state.players.has(viewer.sessionId)).toBe(false);
  });
});
