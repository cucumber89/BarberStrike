import http from "node:http";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDriver, LocalPresence, matchMaker } from "@colyseus/core";
import { MATCH, MAX_BOTS, MatchPhase } from "@frankibarber/shared";
import { TdmRoom } from "../rooms/TdmRoom";
import { TournamentLobbyRoom } from "../rooms/TournamentLobbyRoom";
import { ADMIN_KEY_HEADER, ADMIN_ROOM_GRACE_S, adminAllowed, adminKeyOf, adminRoomRow, adminRoutes, endPlan, quickRoomOptions, unlockEverything } from "./routes";
import { DEFAULT_HAIRCUT, DROPPABLE_EMOTES, HAIRCUTS } from "@frankibarber/shared";
import { closeDb, useTestDb } from "../accounts/db";
import { createAccount, getProfile, saveProfile } from "../accounts/store";

/**
 * The admin console's REST (owner's brief 2026-09-27): the gate, the room table, ZAŁÓŻ MECZ and
 * ZAKOŃCZ, driven over real HTTP against real rooms in the in-process matchmaker (LocalDriver +
 * LocalPresence, no sockets — the same harness the lobby test uses). What is pinned: the password
 * rule (required when set, open when unset, on every route), an unknown room is a 404, a created
 * match is a real `tdm` room built with the options the menu sends, and ZAKOŃCZ reaches `endMatch`
 * and closes the room so it leaves the table.
 */

let booted = false;
async function boot(): Promise<void> {
  if (booted) return;
  await matchMaker.setup(new LocalPresence(), new LocalDriver());
  matchMaker.defineRoomType("tdm", TdmRoom);
  matchMaker.defineRoomType("tournament-lobby", TournamentLobbyRoom);
  booted = true;
}

let server: http.Server;
let base = "";
beforeAll(async () => {
  await boot();
  const app = express();
  app.use("/api", adminRoutes());
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const savedPassword = process.env.ADMIN_PASSWORD;
beforeEach(() => { delete process.env.ADMIN_PASSWORD; });
afterEach(async () => {
  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = savedPassword;
  // Leave no room behind for the next test's table.
  for (const r of await matchMaker.query({})) await matchMaker.remoteRoomCall(r.roomId, "disconnect").catch(() => {});
  await vi.waitFor(async () => expect((await matchMaker.query({})).length).toBe(0));
});

async function call(method: string, path: string, body?: unknown, key?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== undefined) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

describe("pure pieces", () => {
  it("reads the key from the bearer header first, then x-admin-key, then the body", () => {
    expect(adminKeyOf({ headers: { authorization: "Bearer a", [ADMIN_KEY_HEADER]: "h" }, body: { password: "b" } } as never)).toBe("a");
    expect(adminKeyOf({ headers: { [ADMIN_KEY_HEADER]: "h" }, body: { password: "b" } } as never)).toBe("h");
    expect(adminKeyOf({ headers: {}, body: { password: "b" } } as never)).toBe("b");
    expect(adminKeyOf({ headers: {}, body: { adminKey: "k" } } as never)).toBe("k");
    expect(adminKeyOf({ headers: {}, body: undefined } as never)).toBe("");
  });

  it("is open with no password and exact-match with one", () => {
    expect(adminAllowed("", undefined)).toBe(true);
    expect(adminAllowed("anything", "")).toBe(true);
    expect(adminAllowed("secret", "secret")).toBe(true);
    expect(adminAllowed("Secret", "secret")).toBe(false);
    expect(adminAllowed("", "secret")).toBe(false);
  });

  it("validates a quick match into the options TdmRoom reads, and refuses what it would not build", () => {
    expect(quickRoomOptions({ mode: "ffa", map: "gora", room: "  piątek ", bots: 3.4, botLevel: "hard" }))
      .toEqual({ mode: "ffa", map: "gora", room: "piątek", bots: 3, botLevel: "hard" });
    expect(quickRoomOptions({ mode: "tdm", map: "night_district", bots: 99 })!.bots).toBe(MAX_BOTS);
    expect(quickRoomOptions({ mode: "tdm", map: "night_district", bots: -2, botLevel: "x" })).toMatchObject({ bots: 0, botLevel: "normal" });
    expect(quickRoomOptions({ mode: "tdm", map: "night_district" })!.room).toMatch(/^mecz-/);
    expect(quickRoomOptions({ mode: "tdm", map: "night_district", room: "x".repeat(40) })!.room).toHaveLength(24);
    expect(quickRoomOptions({ mode: "turniej", map: "dolna" }), "a tournament is the lobby's job").toBeNull();
    expect(quickRoomOptions({ mode: "tdm", map: "banana" }), "a map the build lacks").toBeNull();
    expect(quickRoomOptions({ mode: "nope", map: "gora" })).toBeNull();
    expect(quickRoomOptions(null)).toBeNull();
  });

  it("shapes a table row from a listing, counting players apart from watchers", () => {
    const row = adminRoomRow({ roomId: "r1", name: "tdm", clients: 5, maxClients: 18, locked: false, metadata: { name: "late-shift", mode: "ffa", map: "gora", players: 3, slots: 12, bots: 2 } } as never, MatchPhase.Playing);
    expect(row).toEqual({ roomId: "r1", kind: "tdm", name: "late-shift", mode: "ffa", map: "gora", players: 3, slots: 12, watching: 2, bots: 2, locked: false, phase: "playing" });
    const lobby = adminRoomRow({ roomId: "l1", name: "tournament-lobby", clients: 4, maxClients: 32, locked: false, metadata: { kind: "tournament-lobby", map: "dolna", name: "" } } as never, "poczekalnia");
    expect(lobby).toMatchObject({ kind: "tournament-lobby", mode: "turniej", players: 4, slots: 32, watching: 0, phase: "poczekalnia" });
  });

  it("ends a match with people in it after the result screen, and closes an empty or waiting room now", () => {
    expect(endPlan("tdm", 3)).toEqual({ endMatch: true, closeInMs: MATCH.endedMs });
    expect(endPlan("tdm", 0)).toEqual({ endMatch: true, closeInMs: 0 });
    expect(endPlan("tournament-lobby", 5)).toEqual({ endMatch: false, closeInMs: 0 });
  });
});

describe("the gate", () => {
  it("verify: open when no password is set, exact match when one is", async () => {
    expect(await call("POST", "/admin/verify", {})).toMatchObject({ status: 200, json: { ok: true, open: true } });
    process.env.ADMIN_PASSWORD = "sekret";
    expect((await call("POST", "/admin/verify", { password: "zle" })).status).toBe(401);
    expect(await call("POST", "/admin/verify", { password: "sekret" })).toMatchObject({ status: 200, json: { ok: true, open: false } });
    expect((await call("POST", "/admin/verify", {}, "sekret")).status, "the bearer header works too").toBe(200);
    const viaHeader = await fetch(`${base}/api/admin/verify`, { method: "POST", headers: { [ADMIN_KEY_HEADER]: "sekret" } });
    expect(viaHeader.status, "and so does x-admin-key, for curl").toBe(200);
  });

  it("every action requires the key when a password is set, and is open when it is not", async () => {
    process.env.ADMIN_PASSWORD = "sekret";
    expect((await call("GET", "/admin/rooms")).status).toBe(401);
    expect((await call("POST", "/admin/rooms", { mode: "tdm", map: "gora" })).status).toBe(401);
    expect((await call("POST", "/admin/rooms/nope/end", {})).status).toBe(401);
    expect((await call("GET", "/admin/rooms", undefined, "sekret")).status).toBe(200);
    // A password set on the server never reaches a room the key did not open.
    expect((await matchMaker.query({ name: "tdm" })).length).toBe(0);
    delete process.env.ADMIN_PASSWORD;
    expect((await call("GET", "/admin/rooms")).status).toBe(200);
  });
});

describe("rooms", () => {
  it("ZAŁÓŻ MECZ creates a real tdm room with the menu's options, listed with its phase", async () => {
    const created = await call("POST", "/admin/rooms", { mode: "ffa", map: "gora", room: "piątek", bots: 2, botLevel: "easy" });
    expect(created.status).toBe(201);
    const roomId = created.json.roomId as string;
    expect(roomId).toBeTruthy();
    const room = matchMaker.getLocalRoomById(roomId) as TdmRoom;
    expect(room.state.mode).toBe("ffa");
    expect(room.state.mapId).toBe("gora");
    expect(room.state.roomName).toBe("piątek");
    expect(room.state.players.size, "two bots are in already").toBe(2);
    expect(room.metadata.bots).toBe(2);

    const list = await call("GET", "/admin/rooms");
    const rows = list.json.rooms as { roomId: string; phase: string; mode: string; map: string; name: string; bots: number }[];
    // Two bots are two ready bodies, so the room is already counting down: the table shows the room's own phase, live.
    expect(rows.find((r) => r.roomId === roomId)).toMatchObject({ mode: "ffa", map: "gora", name: "piątek", bots: 2, phase: room.state.phase });
    expect(rows.find((r) => r.roomId === roomId)!.phase).toBe(MatchPhase.Countdown);
    expect(ADMIN_ROOM_GRACE_S).toBeGreaterThan(15);
  });

  it("refuses a match it would not build", async () => {
    expect((await call("POST", "/admin/rooms", { mode: "turniej", map: "dolna" })).status).toBe(400);
    expect((await call("POST", "/admin/rooms", { mode: "tdm", map: "banana" })).status).toBe(400);
  });

  it("ZAKOŃCZ on an unknown room is a 404", async () => {
    expect((await call("POST", "/admin/rooms/no-such-room/end", {})).status).toBe(404);
  });

  it("ZAKOŃCZ reaches endMatch and closes the room, which leaves the table", async () => {
    const created = await call("POST", "/admin/rooms", { mode: "tdm", map: "night_district", room: "koniec" });
    const roomId = created.json.roomId as string;
    const room = matchMaker.getLocalRoomById(roomId) as TdmRoom;
    const ended = await call("POST", `/admin/rooms/${roomId}/end`, {});
    expect(ended).toMatchObject({ status: 200, json: { ok: true, roomId, closesInMs: 0 } });
    expect(room.state.phase, "the same end-of-match path the clock reaches").toBe(MatchPhase.Ended);
    await vi.waitFor(async () => expect((await matchMaker.query({ roomId })).length).toBe(0));
    expect((await call("GET", "/admin/rooms")).json.rooms).toEqual([]);
  });

  it("a waiting room shows in the table under the name the console gave it, and ZAKOŃCZ closes it", async () => {
    const listing = await matchMaker.createRoom("tournament-lobby", { size: 8, room: "Piątkowy Turniej", map: "dolna" });
    const list = await call("GET", "/admin/rooms");
    const rows = list.json.rooms as { roomId: string; kind: string; name: string; phase: string; mode: string }[];
    expect(rows.find((r) => r.roomId === listing.roomId)).toMatchObject({ kind: "tournament-lobby", name: "Piątkowy Turniej", mode: "turniej", phase: "poczekalnia" });
    expect((await call("POST", `/admin/rooms/${listing.roomId}/end`, {})).status).toBe(200);
    await vi.waitFor(async () => expect((await matchMaker.query({ roomId: listing.roomId })).length).toBe(0));
  });
});

describe("ODBLOKUJ WSZYSTKO (owner's account)", () => {
  it("adds every finish, haircut and dance, and keeps everything the profile already had", () => {
    const before = { xp: 1234, skins: [{ skin: "warsztat", wear: 0.3, rolledAt: 5 }], crateCuts: ["mohawk"], emotes: ["nitka"], fits: ["kibol"] };
    const next = unlockEverything(before, ["warsztat", "osy", "osy", "BAD ID!", 7], 1000);
    expect(next.xp).toBe(1234);
    expect(next.fits).toEqual(["kibol"]);
    expect(next.skins).toEqual([{ skin: "warsztat", wear: 0.3, rolledAt: 5 }, { skin: "osy", wear: 0, rolledAt: 1001 }]);
    expect(new Set(next.crateCuts as string[])).toEqual(new Set(HAIRCUTS.map((h) => h.id).filter((id) => id !== DEFAULT_HAIRCUT)));
    expect(new Set(next.emotes as string[])).toEqual(new Set(DROPPABLE_EMOTES.map((e) => e.id)));
    expect(unlockEverything(null, ["osy"]).skins).toHaveLength(1);
  });

  it("POST /admin/accounts/unlock writes the stored profile of that login, behind the key", async () => {
    useTestDb();
    try {
      const id = createAccount("cucumber89", "x");
      saveProfile(id, JSON.stringify({ xp: 50, skins: [] }));
      process.env.ADMIN_PASSWORD = "sekret";
      expect((await call("POST", "/admin/accounts/unlock", { login: "cucumber89", skins: ["osy"] })).status).toBe(401);
      expect((await call("POST", "/admin/accounts/unlock", { login: "nikt", skins: [] }, "sekret")).status).toBe(404);
      const ok = await call("POST", "/admin/accounts/unlock", { login: "Cucumber89", skins: ["osy", "talk"] }, "sekret");
      expect(ok).toMatchObject({ status: 200, json: { ok: true, login: "cucumber89", skins: 2, emotes: DROPPABLE_EMOTES.length } });
      const stored = JSON.parse(getProfile(id)!);
      expect(stored.xp).toBe(50);
      expect(stored.emotes).toContain("spucha");
    } finally { closeDb(); }
  });
});
