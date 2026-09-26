import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClientState, LocalDriver, LocalPresence, matchMaker, type Client } from "@colyseus/core";
import { DUEL_MAP_ID, LOBBY_CHAT_MAX_LEN, parseBracket } from "@frankibarber/shared";
import { TdmRoom } from "./TdmRoom";
import { TournamentLobbyRoom } from "./TournamentLobbyRoom";
import { fakeClient, type FakeClient } from "./testHarness";

/**
 * The tournament WAITING-ROOM (`tournament-lobby`, drop V, P2): host, readiness, START into parallel
 * arenas, the result→bracket channel over `presence`, and the authoritative chat safety.
 *
 * The arenas are real `tdm mode="duel"` rooms raised by the lobby through the matchmaker — this test
 * proves START opens the right NUMBER of them and that a result published on a pair's presence topic
 * advances the replicated bracket, without playing the duels out (that is Tournament.test.ts's job).
 */

let booted = false;
async function boot(): Promise<void> {
  if (booted) return;
  await matchMaker.setup(new LocalPresence(), new LocalDriver());
  matchMaker.defineRoomType("tdm", TdmRoom);
  matchMaker.defineRoomType("tournament-lobby", TournamentLobbyRoom);
  booted = true;
}

interface Harness {
  room: TournamentLobbyRoom;
  broadcasts: { type: string; payload: unknown }[];
  join(name: string): Promise<FakeClient>;
  send(c: FakeClient, type: string, payload?: unknown): void;
  dispose(): Promise<void>;
}

async function createLobby(opts: Record<string, unknown> = {}): Promise<Harness> {
  await boot();
  const listing = await matchMaker.createRoom("tournament-lobby", { size: 8, seed: 7, ...opts });
  const room = matchMaker.getLocalRoomById(listing.roomId) as TournamentLobbyRoom;
  const internals = room as unknown as {
    _onJoin(c: Client, a: undefined, o?: unknown): Promise<void>;
    onMessageEvents: { emit(type: string, ...args: unknown[]): void };
    _listing: Parameters<typeof matchMaker.reserveSeatFor>[0];
  };
  const broadcasts: { type: string; payload: unknown }[] = [];
  const orig = room.broadcast.bind(room);
  vi.spyOn(room, "broadcast").mockImplementation((type: string | number, ...args: unknown[]) => {
    broadcasts.push({ type: String(type), payload: args[0] });
    return orig(type, ...(args as [unknown]));
  });
  const clients: FakeClient[] = [];
  return {
    room,
    broadcasts,
    async join(name: string) {
      const seat = await matchMaker.reserveSeatFor(internals._listing, { name });
      const c = fakeClient(seat.sessionId);
      await internals._onJoin(c, undefined);
      c.state = ClientState.JOINED;
      clients.push(c);
      return c;
    },
    send(c, type, payload) { internals.onMessageEvents.emit(type, c, payload, undefined); },
    async dispose() {
      const done = room.disconnect();
      await vi.advanceTimersByTimeAsync(1000);
      await done;
    },
  };
}

let h: Harness;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

it("first entrant hosts; readiness toggles on the roster", async () => {
  h = await createLobby();
  const host = await h.join("HOST");
  const b = await h.join("B");
  expect(h.room.state.hostId).toBe(host.sessionId);
  expect(h.room.state.entrants.size).toBe(2);
  h.send(host, "lobby:ready", { ready: true });
  expect(h.room.state.entrants.get(host.sessionId)!.ready).toBe(true);
  h.send(host, "lobby:ready", {}); // flip
  expect(h.room.state.entrants.get(host.sessionId)!.ready).toBe(false);
  expect(h.room.state.entrants.get(b.sessionId)!.seat).toBe(1);
});

it("host START with 8 ready raises 4 parallel arenas and enters phase 'trwa'", async () => {
  h = await createLobby({ size: 8, seed: 11 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < 8; i++) { const c = await h.join(`G${i}`); h.send(c, "lobby:ready", { ready: true }); cs.push(c); }
  h.send(cs[0], "lobby:start", {});
  await vi.waitFor(() => expect(h.room.state.arenas.size).toBe(4));
  expect(h.room.state.phase).toBe("trwa");
  const view = parseBracket(h.room.state.bracket)!;
  expect(view.size).toBe(8);
  for (const [, arena] of h.room.state.arenas) { expect(arena.roomId).not.toBe(""); expect(arena.live).toBe(true); }
});

/**
 * Drop W (P1): the lobby's map reaches the arenas it raises — and only a duel arena does. The
 * arena rooms are real local `TdmRoom`s, so their replicated `mapId` is read straight off them.
 */
it("raises its arenas on the duel map it was created with, or on the default duel map", async () => {
  const arenaMaps = async (opts: Record<string, unknown>): Promise<string[]> => {
    h = await createLobby({ size: 4, seed: 13, ...opts });
    const cs: FakeClient[] = [];
    for (let i = 0; i < 4; i++) { const c = await h.join(`G${i}`); h.send(c, "lobby:ready", { ready: true }); cs.push(c); }
    h.send(cs[0], "lobby:start", {});
    await vi.waitFor(() => expect(h.room.state.arenas.size).toBe(2));
    const ids = [...h.room.state.arenas.values()].map((a) => (matchMaker.getLocalRoomById(a.roomId) as TdmRoom).state.mapId);
    await h.dispose();
    return ids;
  };
  expect(await arenaMaps({ map: "gora" })).toEqual(["gora", "gora"]);
  expect(await arenaMaps({ map: "dolna" })).toEqual([DUEL_MAP_ID, DUEL_MAP_ID]);
  expect(await arenaMaps({})).toEqual([DUEL_MAP_ID, DUEL_MAP_ID]);
  expect(await arenaMaps({ map: "night_district" }), "a pair never plays the district").toEqual([DUEL_MAP_ID, DUEL_MAP_ID]);
});

it("a non-host START, and a START under two ready, are ignored", async () => {
  h = await createLobby({ size: 8, seed: 3 });
  const host = await h.join("HOST");
  const b = await h.join("B");
  h.send(host, "lobby:ready", { ready: true }); // only one ready
  h.send(host, "lobby:start", {});
  expect(h.room.state.phase).toBe("poczekalnia");
  h.send(b, "lobby:ready", { ready: true });
  h.send(b, "lobby:start", {}); // b is not the host
  expect(h.room.state.phase).toBe("poczekalnia");
  h.send(host, "lobby:start", {});
  await vi.waitFor(() => expect(h.room.state.phase).toBe("trwa"));
});

it("a result on the pair's presence topic advances the replicated bracket", async () => {
  h = await createLobby({ size: 4, seed: 5 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < 4; i++) { const c = await h.join(`G${i}`); h.send(c, "lobby:ready", { ready: true }); cs.push(c); }
  h.send(cs[0], "lobby:start", {});
  await vi.waitFor(() => expect(h.room.state.arenas.size).toBe(2));
  const before = parseBracket(h.room.state.bracket)!;
  // The winner of match 0 is one of its two entrants (nick, since bracketString carries names).
  const m0 = before.matches[0];
  const winnerName = m0.a;
  const winnerId = [...h.room.state.entrants.values()].find((e) => e.name === winnerName)!.id;
  await h.room.presence.publish("tourn:" + h.room.roomId + ":0", { winner: winnerId, scoreA: 6, scoreB: 3 });
  await vi.waitFor(() => {
    const v = parseBracket(h.room.state.bracket)!;
    expect(v.matches[0].winner).toBe("a");
    expect(v.matches[0].scoreA).toBe(6);
  });
  // The arena for match 0 is marked finished.
  expect(h.room.state.arenas.get("0")!.live).toBe(false);
});

it("chat over 200 chars is truncated into the broadcast", async () => {
  h = await createLobby();
  const host = await h.join("HOST");
  const long = "x".repeat(500);
  h.send(host, "lobby:chat", { text: long });
  const line = h.broadcasts.filter((b) => b.type === "lobby:chat").pop()!.payload as { text: string };
  expect(line.text.length).toBe(LOBBY_CHAT_MAX_LEN);
  expect(line.text.length).toBe(200);
});

it("a second chat line inside the interval is dropped silently", async () => {
  h = await createLobby();
  const host = await h.join("HOST");
  h.send(host, "lobby:chat", { text: "pierwsza" });
  h.send(host, "lobby:chat", { text: "druga natychmiast" }); // < 1000 ms later
  const lines = h.broadcasts.filter((b) => b.type === "lobby:chat");
  expect(lines.length).toBe(1);
  expect((lines[0].payload as { text: string }).text).toBe("pierwsza");
});

it("html in a chat line is escaped, not carried raw", async () => {
  h = await createLobby();
  const host = await h.join("HOST");
  h.send(host, "lobby:chat", { text: "<b>x</b>" });
  const line = h.broadcasts.filter((b) => b.type === "lobby:chat").pop()!.payload as { text: string };
  expect(line.text).not.toContain("<b>");
  expect(line.text).toContain("&lt;b&gt;");
});
