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
  /** Close a client's socket the way going off to play a match does — through the real `_onLeave`. */
  leave(c: FakeClient): Promise<void>;
  send(c: FakeClient, type: string, payload?: unknown): void;
  dispose(): Promise<void>;
}

async function createLobby(opts: Record<string, unknown> = {}): Promise<Harness> {
  await boot();
  const listing = await matchMaker.createRoom("tournament-lobby", { size: 8, seed: 7, ...opts });
  const room = matchMaker.getLocalRoomById(listing.roomId) as TournamentLobbyRoom;
  const internals = room as unknown as {
    _onJoin(c: Client, a: undefined, o?: unknown): Promise<void>;
    _onLeave(c: Client, code?: number): Promise<void>;
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
    async leave(c) { await internals._onLeave(c, 1000); },
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
 * THE BUG THE FIRST LIVE TOURNAMENT HIT, and the hole the test above left open.
 *
 * "Raises 4 parallel arenas" passed, and the tournament was still unplayable: the arenas went up,
 * the bracket drew, and NOBODY WAS EVER TOLD WHERE TO GO. An arena is created by the matchmaker, so
 * it has no name to type and no listing to find — a client that is not sent to it cannot reach it
 * by any means. The whole room sat looking at a bracket.
 *
 * So the thing to assert is not that the arenas exist. It is that the two people in each pair were
 * handed the room id, and that nobody else was.
 */
it("sends both players of every pair into their own arena, and nobody else", async () => {
  h = await createLobby({ size: 4, seed: 11 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < 4; i++) { const c = await h.join(`G${i}`); h.send(c, "lobby:ready", { ready: true }); cs.push(c); }
  h.send(cs[0], "lobby:start", {});
  await vi.waitFor(() => expect(h.room.state.arenas.size).toBe(2));

  const gotos = (c: FakeClient) => c.sent.filter((m) => m.type === "lobby:goto").map((m) => m.payload as { roomId: string; matchIndex: number; play?: boolean });
  // Four entrants, two arenas: every one of the four is playing in this round, and each was given
  // exactly one room — their own.
  const rooms = new Set<string>();
  for (const c of cs) {
    const g = gotos(c);
    expect(g, `${c.sessionId} was told where to play`).toHaveLength(1);
    expect(g[0].play, "and told to PLAY it, not to watch it").toBe(true);
    expect(g[0].roomId).toBeTruthy();
    rooms.add(g[0].roomId);
  }
  expect(rooms.size, "two pairs, two arenas").toBe(2);

  // And the id each pair was sent is the arena the lobby recorded for that match.
  const byIndex = new Map([...h.room.state.arenas].map(([k, a]) => [Number(k), a.roomId]));
  for (const c of cs) {
    const g = gotos(c)[0];
    expect(byIndex.get(g.matchIndex), `match ${g.matchIndex}`).toBe(g.roomId);
  }
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

/**
 * ROUND TWO, which is where the first fix alone still left the tournament stuck.
 *
 * The waiting-room screen lives inside the menu, and the menu is gone while a match is on — so a
 * player who goes off to play LEAVES this room and comes back with a brand new session id. The
 * bracket keys on the id they were drawn under, so a fresh seat for a returning player means the
 * final is offered to a session that no longer exists: the semi-finals get played and then nobody
 * can get into the final. And the final's arena is raised at the instant the last semi reports,
 * when both its players are still on the summary screen of the match they have just won.
 *
 * So a seat outlives its socket, and the arena is offered again on the way back in.
 */
it("a player coming back from their match keeps their seat, and is sent to the next round's arena", async () => {
  h = await createLobby({ size: 4, seed: 11 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < 4; i++) { const c = await h.join(`G${i}`); h.send(c, "lobby:ready", { ready: true }); cs.push(c); }
  h.send(cs[0], "lobby:start", {});
  await vi.waitFor(() => expect(h.room.state.arenas.size).toBe(2));

  const view = parseBracket(h.room.state.bracket)!;
  const idOf = (name: string): string => [...h.room.state.entrants.values()].find((e) => e.name === name)!.id;
  const finalists = [view.matches[0].a, view.matches[1].a]; // side A takes both semi-finals
  const seats = finalists.map(idOf);

  // Everybody walks off into their arena — which means everybody leaves THIS room.
  for (const c of cs) await h.leave(c);
  expect(h.room.state.entrants.size, "a roster keeps its seats through a match").toBe(4);

  // Both semis report. The final's arena goes up with nobody here to be told about it.
  await h.room.presence.publish(`tourn:${h.room.roomId}:0`, { winner: seats[0], scoreA: 6, scoreB: 2 });
  await h.room.presence.publish(`tourn:${h.room.roomId}:1`, { winner: seats[1], scoreA: 6, scoreB: 4 });
  await vi.waitFor(() => expect(h.room.state.arenas.has("2"), "the final's arena is raised").toBe(true));

  // ...and the finalist is told the moment they walk back in under the same nickname.
  const back = await h.join(finalists[0]);
  expect(h.room.state.entrants.size, "a returning player is not a new entrant").toBe(4);
  expect(h.room.state.entrants.get(seats[0])!.connected, "back in their own seat").toBe(true);
  expect(parseBracket(h.room.state.bracket)!.matches[2].a, "and still named in the final").toBe(finalists[0]);
  await vi.waitFor(() => {
    const g = back.sent.filter((m) => m.type === "lobby:goto").map((m) => m.payload as { roomId: string; matchIndex: number; play?: boolean });
    expect(g, "sent to the final").toHaveLength(1);
    expect(g[0].play).toBe(true);
    expect(g[0].matchIndex).toBe(2);
    expect(g[0].roomId).toBe(h.room.state.arenas.get("2")!.roomId);
  });
});

/** The other half of that: a seat you have already WON from is never offered back to you. */
it("does not drag a player back into the match they have just finished", async () => {
  h = await createLobby({ size: 4, seed: 11 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < 4; i++) { const c = await h.join(`G${i}`); h.send(c, "lobby:ready", { ready: true }); cs.push(c); }
  h.send(cs[0], "lobby:start", {});
  await vi.waitFor(() => expect(h.room.state.arenas.size).toBe(2));
  const view = parseBracket(h.room.state.bracket)!;
  const winner = view.matches[0].a;
  const winnerId = [...h.room.state.entrants.values()].find((e) => e.name === winner)!.id;

  for (const c of cs) await h.leave(c);
  // Only the first semi is over; the second is still being played, so the final has no arena yet.
  await h.room.presence.publish(`tourn:${h.room.roomId}:0`, { winner: winnerId, scoreA: 6, scoreB: 0 });
  await vi.waitFor(() => expect(h.room.state.arenas.get("0")!.live).toBe(false));

  const back = await h.join(winner);
  await vi.advanceTimersByTimeAsync(50);
  expect(back.sent.filter((m) => m.type === "lobby:goto"), "nothing to play yet").toHaveLength(0);
  expect(h.room.state.entrants.size).toBe(4);
});

/**
 * WHY THE ROOM IS STILL HERE AT ALL. Colyseus disposes a room a second after its last client goes,
 * and a tournament being played is a waiting room with nobody in it — so the lobby used to vanish
 * the moment the last pair walked into their arenas, taking the bracket with it and leaving the
 * results the arenas publish with nothing subscribed to hear them. START therefore pins the room
 * open, and an abandonment timer is what makes sure a forgotten one still goes away.
 */
it("survives its own room emptying while the matches are played, on a backstop timer", async () => {
  h = await createLobby({ size: 4, seed: 11 });
  const cs: FakeClient[] = [];
  for (let i = 0; i < 4; i++) { const c = await h.join(`G${i}`); h.send(c, "lobby:ready", { ready: true }); cs.push(c); }
  expect(h.room.autoDispose, "before START it is an ordinary room").toBe(true);
  h.send(cs[0], "lobby:start", {});
  await vi.waitFor(() => expect(h.room.state.arenas.size).toBe(2));
  expect(h.room.autoDispose, "a tournament under way outlives its sockets").toBe(false);

  const timer = (): unknown => (h.room as unknown as { abandonTimer: unknown }).abandonTimer;
  for (const c of cs) await h.leave(c);
  expect(h.room.clients.length).toBe(0);
  expect(h.room.state.phase, "still running with nobody in the room").toBe("trwa");
  expect(timer(), "and a backstop armed against being forgotten").toBeDefined();

  // Somebody coming back disarms it.
  await h.join("G0");
  expect(timer()).toBeUndefined();
});
